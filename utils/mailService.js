import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { emailForgotPasswordOTP, emailRegisterUserOTP } from "../constants/email_message.js"; 

dotenv.config();  


export const generateOTP = () => {
  return (Math.floor(1000 + Math.random() * 9000)).toString().padStart(4, '0');
};


// Send email function
export const sendEmail = async (to, subject, htmlContent) => {
 
  const { MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM_NAME, MAIL_FROM_ADDRESS } = process.env;
  if (!MAIL_USERNAME || !MAIL_PASSWORD || !MAIL_FROM_NAME || !MAIL_FROM_ADDRESS) {
    console.error("Missing required environment variables for email configuration.");
    return;
  }


  const mailTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",  
    port: 587, 
    secure: false, 
    auth: {
      user: MAIL_USERNAME, 
      pass: MAIL_PASSWORD,  
    },
  });

  // Email options
  const mailOptions = {
    from: `${MAIL_FROM_NAME} <${MAIL_FROM_ADDRESS}>`,  
    to: to, 
    subject: subject,  
    html: htmlContent,
  };

  try {
    await mailTransporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending email: ", error);
  }
};

// Send OTP for Registration
export const sendRegistrationOTPEmail = async (email, otp) => {
  const htmlContent = emailRegisterUserOTP(email, otp); 
  await sendEmail(email, "Your OTP Code for SocialApp Registration", htmlContent);
};

// Send OTP for Forgot Password
export const sendForgotPasswordOTP = async (email, otp) => {
  const htmlContent = emailForgotPasswordOTP(email, otp);
  await sendEmail(email, "OTP Code for Password Reset", htmlContent);
};

export const sendAdminInvitationEmail = async (email, password) => {
  const htmlContent = `<p>Dear,</p>
  <p>You have been invited to join the admin team.</p>
  <p>Please click the link below to accept the invitation:</p>
  <p><a href="http://localhost:8080/accept-invitation?email=${email}">Accept Invitation</a></p>
  p<p>Your temporary password is: <strong>${password}</strong></p>
  <p>Please change your password after logging in.</p>
  <p>Thank you!</p>`;
  await sendEmail(email, "Admin Invitation", htmlContent);
};
