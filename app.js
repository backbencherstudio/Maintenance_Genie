import express from "express";
import cors from "cors";
import morgan from "morgan";
import { fileURLToPath } from 'url';
import path from "path";
import userRoutes from "./modules/user/user.route.js";

const app = express();

app.use(
  cors({
    origin: [
      "http://192.168.30.102:3000",
      "http://192.168.30.102:*",
      "http://localhost:5173",
      "http://localhost:3000",
    ]
  })
);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use('/api/users', userRoutes);


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

