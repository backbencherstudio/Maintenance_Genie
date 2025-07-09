import dotenv from "dotenv";
import validator from 'validator';
import bcrypt from "bcryptjs";
import  {upload}  from '../../config/Multer.config.js'; 
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { PrismaClient } from "@prisma/client";
import { sendAdminInvitationEmail} from "../../utils/mailService.js";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "jsonwebtoken";
import { randomBytes } from "crypto";
import cookieParser from 'cookie-parser';
import { token } from "morgan";
import { type } from "os";

const prisma = new PrismaClient();
const { sign, verify } = pkg;
dotenv.config();
const { isEmail } = validator;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//admin login
export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const missingField = ['email', 'password'].find(field => !req.body[field]);
    if (missingField) {
      res.status(400).json({
        message: `${missingField} is required!`,
      });
      return;
    }
    const user = await prisma.user.findUnique({
      where: {
        email,
        type: 'ADMIN',
      },
    });

    if (!user) {
      res.status(404).json({
        message: 'SORRY YOU ARE NOT REGISTERED AS ADMIN',
      });
      return;
    }


    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      res.status(401).json({ message: 'Invalid password' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, type: user.type },
      process.env.JWT_SECRET,
      { expiresIn: '100d' }
    );

    console.log('Token expires at:', token);


    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Something went wrong',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
//change admin password
export const changeAdminPassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.userId;
    console.log('User ID:', userId);
    

    if (!oldPassword || !newPassword) {
      res.status(400).json({
        message: 'Old password and new password are required',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({
        message: 'User not found',
      });
      return;
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);

    if (!isOldPasswordValid) {
      res.status(401).json({
        message: 'Old password is incorrect',
      });
      return;
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Something went wrong',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
//change admin image
export const updateImage = async (req, res) => {

  try {
    const id = req.user?.userId;
    const newImage = req.file;

    if (!newImage) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: id, type: 'ADMIN' },
    });

    if (!existingUser) {
      fs.unlinkSync(path.join(__dirname, "../../uploads", newImage.filename));
      return res.status(404).json({ message: "Admin not found" });
    }

    if (existingUser.avatar) {
      const oldImagePath = path.join(__dirname, "../../uploads", existingUser.avatar);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath); 
      }
    }

    const user = await prisma.user.update({
      where: { id: id, type: 'ADMIN' },
      data: {
        avatar: newImage.filename, 
      },
    });

    const imageUrl = `http://localhost:8080/uploads/${newImage.filename}`;

    return res.status(200).json({
      success: true,
      message: "Image updated successfully",
      data: { ...user, imageUrl },
   
      
    });
  } catch (error) {
    console.error('Error during image upload:', error);

    if (req.file) {
      fs.unlinkSync(path.join(__dirname, "../../uploads", req.file.filename)); 
    }

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error", 
    });
  }
};
//change admin details
export const updateAdminDetails = async (req, res) => {
  try {
    const { name, email } = req.body;
    const id = req.user?.userId;

    if (!id) {
      return res.status(400).json({ message: "Admin not authenticated" });
    }

    if (!id) {
      return res.status(400).json({ message: "Admin not authenticated" });
    }

    const dataToUpdate = {};

    if (name) dataToUpdate.name = name;
    if (email) dataToUpdate.email = email;

    if (Object.keys(dataToUpdate).length === 0) {
      return res.status(400).json({ message: "No valid fields provided for update" });
    }

    const user = await prisma.user.update({
      where: { id: id, type: 'ADMIN' },
      data: dataToUpdate,  
    });

    return res.status(200).json({
      success: true,
      message: "User details updated successfully",
      data: user,
    });
  } catch (error) {
    console.error('Error updating user details:', error);

    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//get all admins
export const getAllAdmins = async (req, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: { type: 'ADMIN' },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        created_at: true,
      },
    });

    if (admins.length === 0) {
      return res.status(404).json({ message: "No admins found" });
    }

    return res.status(200).json({
      success: true,
      message: "Admins retrieved successfully",
      data: admins,
    });
  } catch (error) {
    console.error('Error retrieving admins:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//delete a admin
export const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Admin ID is required" });
    }

    const admin = await prisma.user.findUnique({
      where: { id, type: 'ADMIN' },
    });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    await prisma.user.delete({
      where: { id, type: 'ADMIN' },
    });

    return res.status(200).json({
      success: true,
      message: "Admin deleted successfully",
    });
  } catch (error) {
    console.error('Error deleting admin:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//invite a admin
export const inviteAdmin = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !isEmail(email)) {
      return res.status(400).json({ message: "Valid email is required" });
    }

    const existingAdmin = await prisma.user.findUnique({
      where: { email, type: 'ADMIN' },
    });

    if (existingAdmin) {
      return res.status(400).json({ message: "Admin with this email already exists" });
    }

      const rawPassword = randomBytes(6).toString('base64');
      const hashedPassword = await bcrypt.hash(rawPassword, 10);
       
      const addAdmin = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          type: 'ADMIN',
        },
      });


      sendAdminInvitationEmail(email, rawPassword);

    return res.status(200).json({
      success: true,
      message: "Invitation sent successfully.",
      addAdmin
    });
  } catch (error) {
    console.error('Error inviting admin:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//get all users
export const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { type: 'USER' },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        created_at: true,
        status: true,
      },
    });

    if (users.length === 0) {
      return res.status(404).json({ message: "No users found" });
    }

    return res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      data: users,
    });
  } catch (error) {
    console.error('Error retrieving users:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//total number of users
export const getTotalUsers = async (req, res) => {
  try {
    const totalUsers = await prisma.user.count({
      where: { type: 'USER' },
    });

    return res.status(200).json({
      success: true,
      message: "Total users retrieved successfully",
      data: { totalUsers },
    });
  } catch (error) {
    console.error('Error retrieving total users:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//suspend a user
export const suspendUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await prisma.user.findUnique({
      where: { id, type: 'USER' },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await prisma.user.update({
      where: { id, type: 'USER' },
      data: { status: 'suspended' }, 
    });

    return res.status(200).json({
      success: true,
      message: "User suspended successfully",
    });
  } catch (error) {
    console.error('Error suspending user:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//active a user
export const activateUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await prisma.user.findUnique({
      where: { id, type: 'USER' },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await prisma.user.update({
      where: { id, type: 'USER' },
      data: { status: 'active' }, 
    });

    return res.status(200).json({
      success: true,
      message: "User activated successfully",
    });
  } catch (error) {
    console.error('Error activating user:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//get all mails 
export const getAllMails = async (req, res) => {
  try {
    const mails = await prisma.mail.findMany({
      orderBy: {
        created_at: 'desc',
      },
    });

    if (mails.length === 0) {
      return res.status(404).json({ message: "No mails found" });
    }

    return res.status(200).json({
      success: true,
      message: "Mails retrieved successfully",
      data: mails,
    });
  } catch (error) {
    console.error('Error retrieving mails:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//change mail status
export const changeMailStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Mail ID is required" });
    }

    const mail = await prisma.mail.findUnique({
      where: { id },
    });

    if (!mail) {
      return res.status(404).json({ message: "Mail not found" });
    }

    const newStatus = mail.status === 'Pending' ? 'Solved' : 'Pending';

    const updatedMail = await prisma.mail.update({
      where: { id },
      data: { status: newStatus },
    });

    return res.status(200).json({
      success: true,
      message: `Mail status updated to ${newStatus} successfully`,
      data: updatedMail,
    });
  } catch (error) {
    console.error('Error updating mail status:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
export const createService = async (req, res) => {
  try {
    const { name, description, price, features, plan } = req.body;

    if (!name || !description || !price || !features || !plan) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const newService = await prisma.services.create({
      data: {
        name,
        description,
        price: parseFloat(price),
        features: JSON.parse(features), 
        plan,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Service created successfully",
      data: newService,
    });
  } catch (error) {
    console.error('Error creating service:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
}
//get all services
export const getAllServices = async (req, res) => {
  try {
    const services = await prisma.services.findMany({
      orderBy: {
        created_at: 'desc',
      },
    });

    if (services.length === 0) {
      return res.status(404).json({ message: "No services found" });
    }

    return res.status(200).json({
      success: true,
      message: "Services retrieved successfully",
      data: services,
    });
  } catch (error) {
    console.error('Error retrieving services:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
}
//get me
export const getMe = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(400).json({ message: "User not authenticated" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        created_at: true,
        type: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: "User retrieved successfully",
      data: user,
    });
  } catch (error) {
    console.error('Error retrieving user:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};