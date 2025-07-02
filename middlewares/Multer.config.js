import multer from "multer";
import path from "path";

// Configure the storage engine
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads"); // Set the destination folder for uploads
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname); // Get the file extension
    cb(null, file.fieldname + "-" + uniqueSuffix + ext); // Set the filename format
  },
});

// Create the multer upload middleware
const upload = multer({ storage: storage });

export { upload }; // Export the upload middleware for use in other parts of the application
