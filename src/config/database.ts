import mongoose from 'mongoose';

const connectDB = async () => {
  // If already connected, skip
  if (mongoose.connection.readyState === 1) {
    return;
  }
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || '');
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    // In serverless environments, process.exit() crashes the Lambda container.
    // Throw instead so the HTTP handler returns a 500 rather than hanging.
    const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    if (isServerless) {
      throw error;
    }
    process.exit(1);
  }
};

export default connectDB;