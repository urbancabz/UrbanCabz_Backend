const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Storage
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'urban-cabz/fleet', // Folder in Cloudinary
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'gif', 'avif'],
        transformation: [{ width: 1000, crop: "limit" }] // Optional resizing
    }
});

// File filter - only allow images
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg', 'image/avif'];
    console.log(`📂 Processing upload: ${file.originalname} (${file.mimetype})`);

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        console.error(`❌ Rejected file type: ${file.mimetype}`);
        cb(new Error(`Only image files are allowed. Received: ${file.mimetype}`), false);
    }
};

// Create multer instance
const uploadFleetImage = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max
    }
});

module.exports = { uploadFleetImage };
