import dotenv from "dotenv";
import validator from 'validator';
import bcrypt from "bcryptjs";
import jwt from 'jsonwebtoken';
import { PrismaClient } from "@prisma/client";
import { generateOTP, receiveEmails, sendForgotPasswordOTP, sendRegistrationOTPEmail } from "../../utils/mailService.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import Stripe from 'stripe';
import { 
  change_password,
  forgot_password_otp_send,
  login,
  register_step_1_email,
  register_step_3,
  reset_password,
  update_user_details,
  verify_otp
} from "../../validations/joi.validations.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});


const prisma = new PrismaClient();
dotenv.config();
const { isEmail } = validator;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hash user password
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(8);
  return await bcrypt.hash(password, salt);
};
// Register a new user
export const registerUserStep1 = async (req, res) => {
  try {

    const { value, error } = register_step_1_email.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }
    const { email } = value;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }


    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }


    const existingTempUser = await prisma.temp.findUnique({ where: { email } });

    if (existingTempUser) {
      if (new Date() > new Date(existingTempUser.expires_at)) {
        await prisma.temp.delete({ where: { email } });
        const otp = generateOTP();
        await prisma.temp.create({
          data: {
            email,
            otp,
            expires_at: new Date(Date.now() + 15 * 60 * 1000), // OTP expires in 15 minutes
          },
        });

        sendRegistrationOTPEmail(email, otp);






        return res.status(200).json({
          message: "OTP expired. A new OTP has been sent to your email.",
        });
      }

      // OTP is still valid, notify the user to check their email or wait for expiration
      return res.status(400).json({
        message: "An OTP has already been sent to this email. Please check your inbox or wait for expiration.",
        shouldResendOtp: false,  // No need to resend if OTP is valid
      });
    }
    const otp = generateOTP();
    await prisma.temp.create({
      data: {
        email,
        otp,
        expires_at: new Date(Date.now() + 15 * 60 * 1000), // OTP expires in 15 minutes
      },
    });
    sendRegistrationOTPEmail(email, otp);

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
    const { value, error } = verify_otp.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { otp, email } = value;

    if (!otp || !email) {
      return res.status(400).json({ message: "OTP and email are required" });
    }
    const notVerifiedUser = await prisma.temp.findUnique({
      where: { email },
    });

    if (!notVerifiedUser) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    if (new Date() > new Date(notVerifiedUser.expires_at)) {
      return res.status(400).json({
        success: false,
        message: "OTP expired. New OTP sent",
        shouldResendOtp: true,
        ucodeId: notVerifiedUser.id,
      });
    }
    if (notVerifiedUser.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    const verifiedUser = await prisma.user.create({
      data: {
        email: notVerifiedUser.email,
      },
    });

    await prisma.temp.delete({
      where: { id: notVerifiedUser.id },
    });
    const jwtToken = jwt.sign(
      {
        userId: verifiedUser.id,
        email: verifiedUser.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "10d" }
    );

    return res.status(200).json({
      success: true,
      token: jwtToken,
      message: "OTP matched successfully. You can now set your name and password.",
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
      },
    });

  } catch (error) {
    console.error("Error in verifyOTP:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
export const registerUserStep3 = async (req, res) => {
  try {
    const { name, password } = register_step_3.validate(req.body);
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
      return res.status(400).json({ message: "Authentication token is required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const email = decoded.email;

    if (!name || !password) {
      return res.status(400).json({ message: "Name and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const hashedPassword = await hashPassword(password);

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!existingUser) {
      return res.status(400).json({ message: "Email is not registered" });
    }

    let stripeCustomer;
    if (!existingUser.billing_id) {
      stripeCustomer = await stripe.customers.create({
        email,
        name,
        metadata: { app_user_id: existingUser.id },
      });

      console.log("Stripe customer created:", stripeCustomer.id);
    }

    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        name,
        password: hashedPassword,
        billing_id: stripeCustomer ? stripeCustomer.id : existingUser.billing_id,
        customer_id: stripeCustomer ? stripeCustomer.id : existingUser.customer_id,
      },
    });

    return res.status(200).json({
      message: "Registration successful",
      user: { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email },
    });
  } catch (error) {
    console.error("Error in registerUserStep3:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
//Login
export const loginUser = async (req, res) => {
  try {
    const { error, value } = login.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { email, password } = value;


    const missingField = ['email', 'password'].find(field => !req.body[field]);
    if (missingField) {
      return res.status(400).json({
        message: `${missingField} is required!`,
      });
    }


    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });
    
    if (!user) {
      return res.status(404).json({
        message: 'User not exists, please register and then try to log in',
      });
    }


    if (user.status === 'suspended') {
      return res.status(403).json({
        message: 'Your account is suspended. Please contact support.',
      })
    }



    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid password' });
    }


    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, type: user.type },
      process.env.JWT_SECRET,
      { expiresIn: '100d' }
    );

    console.log('Token expires at:', token);


    return res.status(200).json({
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
    return res.status(500).json({
      success: false,
      message: 'Something went wrong',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
// Forgot password OTP send
export const forgotPasswordOTPsend = async (req, res) => {
  try {
    const { email } = forgot_password_otp_send(req.body);

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const existingTempUser = await prisma.temp.findUnique({
      where: { email },
    });

    if (existingTempUser) {
      if (new Date() > new Date(existingTempUser.expires_at)) {
        await prisma.temp.delete({ where: { email } });

        const otp = generateOTP();
        await prisma.temp.create({
          data: {
            email,
            otp,
            expires_at: new Date(Date.now() + 15 * 60 * 1000),
          },
        });

        sendForgotPasswordOTP(email, otp);

        return res.status(200).json({
          message: "OTP expired. A new OTP has been sent to your email.",
        });
      }

      return res.status(400).json({
        message: "An OTP has already been sent to this email. Please check your inbox or wait for expiration.",
        shouldResendOtp: false,
      });
    }

    const otp = generateOTP();

    await prisma.temp.create({
      data: {
        email,
        otp,
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    sendForgotPasswordOTP(email, otp);

    return res.status(200).json({
      message: "OTP sent successfully to your email. Please verify it to continue.",
    });
  } catch (error) {
    console.error("Error in sendForgotPasswordOTP:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
// Match forgot password OTP
export const verifyForgotPasswordOTP = async (req, res) => {
  try {
    const { otp, email } = verify_otp(req.body);

    if (!otp || !email) {
      return res.status(400).json({ message: "OTP and email are required" });
    }

    const existingTempUser = await prisma.temp.findUnique({
      where: { email },
      select: { otp: true, email: true }
    });

    if (!existingTempUser) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    if (new Date() > new Date(existingTempUser.expires_at)) {
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new OTP.",
        shouldResendOtp: true,
        email: existingTempUser.email,
      });
    }

    if (existingTempUser.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    const jwtToken = jwt.sign(
      {
        email: existingTempUser.email,
      },
      process.env.JWT_SECRET_FORGET,
      { expiresIn: '1d' }
    );

    await prisma.temp.delete({
      where: { email: existingTempUser.email },
    });

    return res.status(200).json({
      success: true,
      message: "OTP matched successfully. You can now reset your password.",
      token: jwtToken,
    });
  } catch (error) {
    console.error("Error in verifyForgotPasswordOTP:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
// Reset password
export const resetPassword = async (req, res) => {
  const {value , error} = reset_password.validate(req.body);
  const { newPassword } = value;

  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(400).json({ message: "Authorization token is required" });
  }


  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET_FORGET);
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  const { email } = decoded;


  console.log(email);



  const user = await prisma.user.findUnique({
    where: { email: email },
  });



  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  const isOldPasswordCorrect = await bcrypt.compare(newPassword, user.password);
  if (isOldPasswordCorrect) {
    return res.status(400).json({ message: "New password cannot be the same as the old password" });
  }


  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { email: email },
    data: { password: hashedPassword },
  });



  return res.status(200).json({ message: "Password reset successfully" });
};
// Check if user is authenticated
export const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = decoded;
    next();
  });
};
//update user image
export const updateImage = async (req, res) => {
  // console.log("Image upload: ", req.file);

  try {
    const id = req.user?.userId;
    const newImage = req.file;

    if (!newImage) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: id , type: 'USER' },
    });

    if (!existingUser) {
      fs.unlinkSync(path.join(__dirname, "../../uploads", newImage.filename));
      return res.status(404).json({ message: "User not found" });
    }

    if (existingUser.avatar) {
      const oldImagePath = path.join(__dirname, "../../uploads", existingUser.avatar);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    const user = await prisma.user.update({
      where: { id: id },
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
//update user details
export const updateUserDetails = async (req, res) => {
  try {
    const {value, error} = update_user_details.validate(req.body);
    const { name, email, address } = value;

    if(error){
      return res.status(400).json({ message: error.details[0].message });
    }

    const id = req.user?.userId;
    const existUser = await prisma.user.findUnique({
      where: { id: id , type: 'USER' },
    });
    if (!existUser) {
      return res.status(400).json({ message: "User not exist" });
    }
    if(!id){
      return res.status(400).json({ message: "User not authenticated" });
    }

    const dataToUpdate = {};

    if (name) dataToUpdate.name = name;
    if (email) dataToUpdate.email = email;
    if (address) dataToUpdate.address = address;

    if (Object.keys(dataToUpdate).length === 0) {
      return res.status(400).json({ message: "No valid fields provided for update" });
    }

  if(email){
        const checkExistingEmail = await prisma.user.findUnique({
      where:{email:email}
    })

    if(checkExistingEmail){
      res.status(400).json({ message: "Email already exists" });
    }
  }

    const user = await prisma.user.update({
      where: { id: id },
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
//send mail to admin
export const sendMailToAdmin = async (req, res) => {
  try {
    const { subject, message } = req.body;

    const user_email = req.user?.email;
    const userId = req.user?.userId;

    if (!user_email || !userId) {
      return res.status(400).json({ message: "User email or ID is missing" });
    }

    const user = await prisma.user.findUnique({
      where: { email: user_email, id: userId, type: 'USER' },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!subject || !message) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!isEmail(user_email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const token = Math.floor(10000000 + Math.random() * 90000000).toString(); // Generate a random 8-digit token

    const mail = await prisma.mail.create({
      data: {
        user_id: userId,
        user_email,
        user_name: user.name,
        subject,
        message,
        token: token,
      },
    });



    receiveEmails(user_email, subject, message);

    return res.status(200).json({
      success: true,
      message: "Mail sent to admin successfully",
      data: mail,
    });
  } catch (error) {
    console.error('Error sending mail to admin:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//get me
export const getMe = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(400).json({ message: "User not authenticated" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId , type: 'USER' },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        created_at: true,
        updated_at: true,
        address: true,
        role: true,
        type: true,
        status: true,
        billing_id: true,

      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const imageUrl = user.avatar ? `http://localhost:8070/uploads/${user.avatar}` : null;

    return res.status(200).json({
      success: true,
      message: "User details retrieved successfully",
      data: { ...user, imageUrl },
    });
  } catch (error) {
    console.error('Error retrieving user details:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
// Update password
export const updatePassword = async (req, res) => {
  try {
    const {value, error } = change_password.validate(req.body);
    if(error){
      return res.status(400).json({ message: error.details[0].message });
    }
    const { oldPassword, newPassword } = value;
    const userId = req.user?.userId;
    

    if (!userId) {
      return res.status(400).json({ message: "User not authenticated" });
    }
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new passwords are required" });
    }


    const user = await prisma.user.findUnique({
      where: { id: userId , type: 'USER' },
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      return res.status(401).json({ message: "Old password is incorrect" });
    }
    const hashedNewPassword = await hashPassword(newPassword);

    if(isOldPasswordValid === newPassword){
      return res.status(401).json({message:"old and new password cannot be same"})
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });
    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
      },
    });
  }
  catch (error) {
    console.error('Error updating password:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
}