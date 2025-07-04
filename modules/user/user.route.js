import express from 'express';
import { registerUserStep1, verifyOTP, registerUserStep3 } from './user.controller.js'; 
import  upload  from '../../config/Multer.config.js'; // 
 

const router = express.Router();

// Test route
router.get('/test', (req, res) => {
  res.send('User route connected');
});

// File upload route
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }
  res.status(200).send({ message: 'File uploaded successfully', file: req.file });
});

//Register a user
router.post('/register-step1', registerUserStep1); 
router.post('/verify-otp', verifyOTP);
router.post('/register-step3', registerUserStep3);



// router.patch('/updateuser', varyfyUser('USER'), updateUser)




export default router;
