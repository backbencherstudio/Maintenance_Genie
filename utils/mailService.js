import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { emailForgotPasswordOTP, emailRegisterUserOTP } from "../constants/email_message.js";
  // Import your email templates

dotenv.config();

export const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();  // Generates a 4-digit OTP
};

// Send email function
export const sendEmail = async (to, subject, htmlContent) => {
  const mailTransporter = nodemailer.createTransport({
    service: "gmail",
    port: 587,
    auth: {
      user: process.env.MAIL_USERNAME || "",  
      pass: process.env.MAIL_PASSWORD || "",  
    },
  });

  const mailOptions = {
    from: `${process.env.MAIL_FROM_NAME} <${process.env.MAIL_FROM_ADDRESS}>`,
    to,
    subject,
    html: htmlContent,
  };

  try {
    await mailTransporter.sendMail(mailOptions);
    console.log("Email sent successfully");
  } catch (error) {
    console.error("Error sending email: ", error);
  }
};

// Send OTP for Registration
export const sendRegistrationOTPEmail = async (email, otp, ) => {
  const htmlContent = emailRegisterUserOTP( email, otp);  
  await sendEmail(email, "Your OTP Code for SocialApp Registration", htmlContent);  il
};

// Send OTP for Forgot Password
export const sendForgotPasswordOTP = async (email, otp) => {
  const htmlContent = emailForgotPasswordOTP(email, otp);  
  await sendEmail(email, "OTP Code for Password Reset", htmlContent);  
};

