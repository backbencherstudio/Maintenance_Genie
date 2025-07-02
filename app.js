import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import { prisma, connectDB } from './modules/prisma/prisma.js';
import userRoutes from './modules/user/user.route.js';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';  
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Connect to the database
connectDB();

// Middlewares
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the "uploads" folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// User-related routes =
app.use('/api/users', userRoutes);

// Global 404 fallback
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
