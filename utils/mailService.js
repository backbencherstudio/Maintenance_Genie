import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { emailForgotPasswordOTP, emailRegisterUserOTP } from "../constants/email_message.js";  // Import your email templates

dotenv.config();  // Load environment variables from .env file

// Generate a 4-digit OTP
export const generateOTP = () => {
  return (Math.floor(1000 + Math.random() * 9000)).toString().padStart(4, '0');
};


// Send email function
export const sendEmail = async (to, subject, htmlContent) => {
  // Ensure required environment variables are available
  const { MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM_NAME, MAIL_FROM_ADDRESS } = process.env;
  if (!MAIL_USERNAME || !MAIL_PASSWORD || !MAIL_FROM_NAME || !MAIL_FROM_ADDRESS) {
    console.error("Missing required environment variables for email configuration.");
    return;
  }

  // Create a transporter for Gmail using SMTP
  const mailTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",  // Explicitly using SMTP host for Gmail
    port: 587,  // SMTP port for Gmail
    secure: false,  // Use TLS (STARTTLS)
    auth: {
      user: MAIL_USERNAME,  // Your Gmail address
      pass: MAIL_PASSWORD,  // Your Gmail App Password
    },
  });

  // Email options
  const mailOptions = {
    from: `${MAIL_FROM_NAME} <${MAIL_FROM_ADDRESS}>`,  // Sender's email
    to: to,  // Recipient email
    subject: subject,  // Email subject
    html: htmlContent,  // HTML content of the email
  };

  // Send the email and handle any errors
  try {
    await mailTransporter.sendMail(mailOptions);
   // console.log("Email sent successfully to:", to);
  } catch (error) {
    console.error("Error sending email: ", error);
  }
};

// Send OTP for Registration
export const sendRegistrationOTPEmail = async (email, otp) => {
  const htmlContent = emailRegisterUserOTP(email, otp);  // Email body template for registration OTP
  await sendEmail(email, "Your OTP Code for SocialApp Registration", htmlContent);  // Send the OTP email
};

// Send OTP for Forgot Password
export const sendForgotPasswordOTP = async (email, otp) => {
  const htmlContent = emailForgotPasswordOTP(email, otp);  // Email body template for forgot password OTP
  await sendEmail(email, "OTP Code for Password Reset", htmlContent);  // Send the OTP email
};
