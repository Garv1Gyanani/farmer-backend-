const mongoose = require('mongoose');

const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    console.error(`[MongoDB] Error: process.env.MONGODB_URI is undefined! Check that your .env file is loaded properly.`);
    return;
  }
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log(`[MongoDB] Connected successfully to host: ${conn.connection.host}, database: ${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`[MongoDB] Connection failed: ${error.message}`);
    console.warn(`[MongoDB] ACTION REQUIRED: Add 0.0.0.0/0 to Network Access in MongoDB Atlas (https://cloud.mongodb.com) to allow Railway cloud IPs.`);
    console.log(`[MongoDB] Retrying connection in 8 seconds...`);
    setTimeout(connectDB, 8000);
  }
};

module.exports = connectDB;
