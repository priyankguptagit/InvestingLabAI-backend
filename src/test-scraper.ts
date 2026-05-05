import mongoose from 'mongoose';
import dotenv from 'dotenv';
import stockScraperService from './services/stockScraper';

dotenv.config();

async function testScraper() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('Connected to MongoDB');
    
    await stockScraperService.scrapeAllStocks();
    
    console.log('Test completed');
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testScraper();
