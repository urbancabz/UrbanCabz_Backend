require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log("Testing Cloudinary Credentials...");
cloudinary.api.ping()
    .then(res => {
        console.log('Ping Success:', res);
    })
    .catch(err => {
        console.error('Ping Error:', err.message || err);
    });
