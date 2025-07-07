import { upload } from '../../config/Multer.config.js';
import { verifyUser } from '../../middlewares/verifyUsers.js';
import express from 'express';
import { addItem } from './add_iteams.controller.js';

const router = express.Router();

router.post('/add-item',verifyUser("USER"),upload.single('img'), addItem);

export default router;
