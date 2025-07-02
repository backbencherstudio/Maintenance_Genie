// src/prisma/prismaClient.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Manually connect and log
async function connectDB() {
  try {
    await prisma.$connect();
    console.log('Connected to PostgreSQL via Prisma!');
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    process.exit(1);
  }
}

export { prisma, connectDB };
