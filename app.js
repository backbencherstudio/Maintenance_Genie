import express from "express";
import { Server } from "socket.io";
import cors from "cors";
import morgan from "morgan";
import { fileURLToPath } from 'url';
import path from "path";
import userRoutes from "./modules/user/user.route.js";
import adminRoutes from "./modules/admin/admin.route.js";
import addItemRoutes from "./modules/add_items/add_items.route.js";
import pay from "./modules/paymnet/stripe.route.js";
import nodeCron from "node-cron";
import { PrismaClient } from "@prisma/client";
import http from 'http';  
import dotenv from "dotenv";
import { setSocketServer } from "./utils/notificationService.js";


// Initialize environment variables
dotenv.config();



const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();


// Middleware to handle JSON and URL-encoded data
app.set("json replacer", (key, value) =>
  typeof value === "bigint" ? value.toString() : value
);
// Convert BigInt to string for JSON serialization
BigInt.prototype.toJSON = function () {
  return this.toString();
};


// Initialize Socket.IO server
export const io = new Server(server, {
  cors: {
    origin: ["*", "http://192.168.30.102:3000", "http://localhost:5173", "http://localhost:3000", "http://localhost:8080","https://maintenance-genies.vercel.app"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    allowOrigin: true,
    credentials: true,
  },
});
setSocketServer(io);


// CORS configuration
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://192.168.30.102:3000",
    "https://maintenance-genies.vercel.app"
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
}));

//cron job to update subscriptions daily  Refresh the counter every day at midnight

let counter = 0;
nodeCron.schedule('0 0 * * *', async () => { 
  try {
    const now = new Date();
    console.log(`Daily cron job running at: ${now.toISOString()} - Counter: ${counter++}`);
    const batchSize = 1000; 
    const subscriptionsToUpdate = await prisma.subscription.findMany({
      where: {
        end_date: {
          lte: now,
        },
        status: "Active",
      },
      take: batchSize,
      include: {
        user: {
          select: {
            id: true,
          },
        },
      },
    });
    if (subscriptionsToUpdate.length === 0) {
      console.log("No subscriptions to update today.");
      return;
    }
    const userIds = [...new Set(subscriptionsToUpdate.map((sub) => sub.user.id))];
    await prisma.$transaction([
      prisma.subscription.updateMany({
        where: {
          id: {
            in: subscriptionsToUpdate.map((sub) => sub.id),
          },
        },
        data: {
          status: "Ended",
        },
      }),
      prisma.user.updateMany({
        where: {
          id: {
            in: userIds,
          },
        },
        data: {
          is_subscribed: false,
          role: "normal",
        },
      }),
    ]);
    console.log(
      `Updated ${subscriptionsToUpdate.length} subscriptions and ${userIds.length} users.`
    );
  } catch (error) {
    console.error("Error in daily subscription cleanup:", error);
  }
});
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') {
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

// all other routes
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/items', addItemRoutes);
app.use('/api/payments', pay);
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Serve static files from the "uploads" directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));


// 404 and 500 error handling
app.use((req, res, next) => {
  res.status(404).json({
    message: `404 route not found`,
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  res.status(500).json({
    message: `500 Something broken!`,
    error: err.message,
  });
});

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, "public")));
export default server;

