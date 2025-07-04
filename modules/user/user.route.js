import express from 'express';
import { registerUserStep1, verifyOTP, registerUserStep3 } from './user.controller.js'; // Adjust imports
import  upload  from '../../config/Multer.config.js'; // File upload middleware
 

const router = express.Router();

// Test route
router.get('/test', (req, res) => {
  res.send('✅ User route connected');
});

// File upload route
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }
  res.status(200).send({ message: 'File uploaded successfully', file: req.file });
});

// Step 1: User provides email and receives OTP
router.post('/register-step1', registerUserStep1); 

// Step 2: User verifies OTP
router.post('/verify-otp', verifyOTP);

// router.patch('/uodateuser', varyfyUser('USER'), updateUser)

// Step 3: User sets name and password after OTP verification
router.post('/register-step3', registerUserStep3);

export default router;
