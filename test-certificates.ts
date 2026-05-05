import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cronService from './src/services/cronService';
import connectDB from './src/config/database';

dotenv.config();

async function runTest() {
  console.log('--- Starting Certificate Generation Test ---');
  
  // Connect to DB
  await connectDB();
  
  console.log('Running the certificate generation job manually...');
  await cronService.runCertificateJobNow();

  console.log('Job finished. Check the database Collections for "certificates"');
  console.log('Also check the backend/public/certificates folder for PDFs!');
  
  await mongoose.connection.close();
  console.log('--- Test Complete ---');
}

runTest();
