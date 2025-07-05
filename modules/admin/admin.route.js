import express from 'express';

import { upload } from '../../config/Multer.config.js';
import { verifyUser } from '../../middlewares/verifyUsers.js';
import { changeAdminPassword, getAllAdmins, loginAdmin, updateAdminDetails, updateImage,deleteAdmin ,inviteAdmin,getAllUsers,getTotalUsers,suspendUser,activateUser} from './admin.controller.js';

const router = express.Router();

//admin login
router.post('/login', loginAdmin);
//admin change password
router.post('/change-password', verifyUser("ADMIN"), changeAdminPassword);
//admin profile image upload
router.put('/update-image',upload.single('profilePicture') , verifyUser("ADMIN") , updateImage);
//update admin details
router.put('/update-admin-details', verifyUser("ADMIN"), updateAdminDetails);
//get all admins
router.get('/get-all-admins', verifyUser("ADMIN"), getAllAdmins);
//get all users
router.get('/get-all-users', verifyUser("ADMIN"), getAllUsers);
//delete a admin
router.delete('/delete-admin/:id', verifyUser("ADMIN"), deleteAdmin);
//invite a new admin
router.post('/invite-admin', verifyUser("ADMIN"), inviteAdmin)
//get total number of users
router.get('/get-total-users', verifyUser("ADMIN"), getTotalUsers);
//suspend a user
router.put('/suspend-user/:id', verifyUser("ADMIN"), suspendUser);
//active a user
router.put('/active-user/:id', verifyUser("ADMIN"), activateUser);



export default router;