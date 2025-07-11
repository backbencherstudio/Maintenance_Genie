import express from "express";
import cors from "cors";
import morgan from "morgan";
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import path from "path";
import userRoutes from "./modules/user/user.route.js";
import adminRoutes from "./modules/admin/admin.route.js";
import addItemRoutes from "./modules/add_items/add_items.route.js";
import pay from "./modules/paymnet/stripe.route.js";

const app = express();

app.use(
  cors({
    origin: [
      "http://192.168.30.102:3000",    // Local development on a specific IP and port
      "http://localhost:5173",         // Local development with Vue.js or other frontend on port 5173
      "http://localhost:3000",         // Local React app
      "http://localhost:8080",         // Local backend or another service
      "http://127.0.0.1:5500",        // Local development (VSCode Live Server)
      "https://eea9f755b5c2.ngrok-free.app",  // Your specific ngrok URL
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],  // Allowed HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],  // Allow custom headers
    credentials: true,  // Allow cookies or credentials in the request
  })
);




app.use((req, res, next) => {
  // use raw body parser for the webhook endpoint
  if (req.originalUrl == '/api/payments/webhook') {
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/items', addItemRoutes);
app.use('/api/payments', pay);
app.get("/", (req, res) => {
  res.send("Welcome to Maintenance Genie API");
});


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));


app.use((req, res, next) => {
  res.status(404).json({
    message: `404 route not found`,
  });
});

app.use((err, req, res, next) => {
  res.status(500).json({
    message: `500 Something broken!`,
    error: err.message,
  });
});


app.use(express.static(path.join(__dirname, "public")));






export default app;

