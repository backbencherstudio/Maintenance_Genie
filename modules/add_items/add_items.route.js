import { upload } from '../../config/Multer.config.js';
import { verifyUser } from '../../middlewares/verifyUsers.js';
import express from 'express';
import { addItem ,getAllItems,getItemById,generateTasks,generateQuestions, uploadReceipt,getAllTasksForAnItem, getAlltasksForAuser} from './add_iteams.controller.js';
const router = express.Router();

router.post('/add-item',verifyUser("USER"),upload.single('img'), addItem);
//get all items
router.get('/get-all-items', verifyUser("USER"), getAllItems);
//generate questions for an item
router.get("/:id/questions", verifyUser("USER"), generateQuestions);
//generate tasks for an item
router.post("/:id/generate-tasks", verifyUser("USER"), generateTasks);
//get all tasks for an item
router.get("/:id/tasks", verifyUser("USER"), getAllTasksForAnItem);
//get all tasks for an user
router.get("/all-tasks", verifyUser("USER"), getAlltasksForAuser);
//get one item by id
router.get('/get-item/:id', verifyUser("USER"), getItemById);
//upload maintaincne history
router.post('/upload-maintenance-history/:id', verifyUser("USER"), upload.single('img'), uploadReceipt);
export default router;
