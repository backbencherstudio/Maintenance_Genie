import dotenv from "dotenv";
import validator from 'validator';
import bcrypt from "bcryptjs";
import { prisma } from "../prisma/prisma.js";
import { generateOTP, sendForgotPasswordOTP, sendRegistrationOTPEmail } from "../../utils/mailService.js";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "jsonwebtoken";
import cookieParser from 'cookie-parser';


const { sign, verify } = pkg;


dotenv.config();

const { isEmail } = validator;

// Helper function to set cookies
const setCookies = (res, cookies = {}) => {
  for (const [key, value] of Object.entries(cookies)) {
    res.cookie(key, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'None',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days for the token
      path: '/'
    });
  }
};



// Generate JWT token
const generateToken = (id, email, role) => {
  return sign({ userId: id, email, role }, process.env.WEBTOKEN_SECRET_KEY, {
    expiresIn: "1d",
  });
};

// Hash user password
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(8);
  return await bcrypt.hash(password, salt);
};

// Register a new user
export const registerUserStep1 = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Generate OTP
    const otp = generateOTP();

    // Save OTP in cookies (for later verification)
    setCookies("otp", otp, res);
    setCookies("email", email, res);  // Save email temporarily to link with OTP

    // Send OTP to user's email
    await sendRegistrationOTPEmail(email, otp);

    return res.status(200).json({
      message: "OTP sent successfully to your email. Please verify it to continue.",
    });
  } catch (error) {
    console.error("Error in registerUserStep1:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
export const verifyOTP = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    if (otp !== req.cookies.otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // OTP is valid, allow user to proceed to name and password step
    return res.status(200).json({
      message: "OTP matched successfully. You can now set your name and password.",
    });
  } catch (error) {
    console.error("Error in verifyOTP:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
export const registerUserStep3 = async (req, res) => {
  try {
    const { name, password } = req.body;
    const email = req.cookies.email;

    if (!name || !password) {
      return res.status(400).json({ message: "Name and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }


    // Save user to the database
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashPassword,
      },
    });

    // Clear cookies after registration
    res.clearCookie("otp");
    res.clearCookie("email");

    return res.status(200).json({
      message: "Registration successful",
      user: { id: newUser.id, name: newUser.name, email: newUser.email },
    });
  } catch (error) {
    console.error("Error in registerUserStep3:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


// Authenticate user during login
export const authenticateUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Please fill all required fields" });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(400).json({ message: "User not found!" });
    }

    // Compare passwords
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Generate JWT token and set cookies
    const token = generateToken(user.id, user.email, user.role);
    setCookies(res, { token });

    return res.status(200).json({
      message: "Login successful",
      user: { ...user, password: undefined }, // Avoid sending the password
      token,
    });
  } catch (error) {
    console.error("Error in authenticateUser:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Forgot password OTP send
export const forgotPasswordOTPsend = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const otp = generateOTP().toString();
    setCookies(res, { otp });

    // Send OTP email
    if (user.name) await sendForgotPasswordOTP(user.name, user.email, otp);

    return res.status(200).json({
      message: "OTP sent successfully for password change",
      success: true,
    });
  } catch (error) {
    console.error("Error sending OTP:", error);
    return res.status(500).json(error);
  }
};

// Match forgot password OTP
export const matchForgotPasswordOTP = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp || otp !== req.cookies.otp) {
      return res.status(400).json({ message: "OTP does not match" });
    }

    setCookies(res, { isOtpValid: true });
    return res.status(200).json({
      success: true,
      message: "OTP matched successfully",
    });
  } catch (error) {
    return res.status(500).json(error);
  }
};

// Reset password
export const resetPassword = async (req, res) => {
  try {
    if (!req.cookies.isOtpValid) {
      return res.status(400).json({ message: "OTP invalid" });
    }

    const { password } = req.body;

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.update({
      where: { email: req.cookies.email },
      data: { password: hashedPassword }
    });

    // Clear session after password reset
    res.clearCookie("otp");
    res.clearCookie("email");
    res.clearCookie("isOtpValid");

    return res.status(200).json({
      message: "Password reset successfully",
      success: true,
    });
  } catch (error) {
    return res.status(500).json(error);
  }
};

// Logout user
export const logout = (req, res) => {
  try {
    res.clearCookie("token");
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Check if user is authenticated
export const checkAuthStatus = async (req, res) => {
  try {
    const { token } = req.cookies;

    if (!token) {
      return res.status(400).json({ authenticated: false });
    }

    verify(token, process.env.WEBTOKEN_SECRET_KEY, async (err, decoded) => {
      if (err) {
        return res.status(401).json({ message: "Invalid token", authenticated: false });
      }

      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      if (!user) {
        return res.status(404).json({ message: "User not found", authenticated: false });
      }

      return res.status(200).json({ authenticated: true, user });
    });
  } catch (error) {
    console.error("Error checking auth status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
