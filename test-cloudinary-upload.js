require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Create a dummy 1x1 pixel image
const dummyImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
fs.writeFileSync('dummy.png', dummyImage);

console.log("Uploading dummy image directly to Cloudinary...");
cloudinary.uploader.upload('dummy.png', { folder: 'urban-cabz/fleet' })
    .then(result => {
        console.log("Upload Success! URL:", result.secure_url);
    })
    .catch(error => {
        console.error("Upload Error:", error.message || error);
    });
