import dotenv from 'dotenv';
dotenv.config();

// Helper function to validate existence
const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;
  if (value === undefined) {
    throw new Error(`❌ Missing Environment Variable: ${key}`);
  }
  return value;
};

export const ENV = {
  PORT: getEnv('PORT', '5001'),
  
  // Database
  MONGODB_URI: getEnv('MONGODB_URI'),
  
  // Security Secrets
  JWT_SECRET: getEnv('JWT_SECRET'),
  JWT_REFRESH_SECRET: getEnv('JWT_REFRESH_SECRET'),
  ADMIN_SECRET_KEY: getEnv('ADMIN_SECRET_KEY'),
  
  // Configs
  JWT_EXPIRES_IN: getEnv('JWT_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: getEnv('JWT_REFRESH_EXPIRES_IN', '7d'),
  
  // Email
  EMAIL_USER: getEnv('EMAIL_USER'),
  EMAIL_PASS: getEnv('EMAIL_PASS'),
  
  // Frontend
  FRONTEND_URL: getEnv('FRONTEND_URL', 'https://praedico-frontend.vercel.app'),
  
  // AI Configuration
  GEMINI_API_KEY: getEnv('GEMINI_API_KEY'),
  AI_MODEL: getEnv('AI_MODEL', 'gemini-1.5-flash'),
  AI_MAX_HISTORY: getEnv('AI_MAX_HISTORY', '20'),

  //Razorpay Credentials
  razorpay: {
    keyId:         getEnv('RAZORPAY_KEY_ID'),
    keySecret:     getEnv('RAZORPAY_KEY_SECRET'),
    webhookSecret: getEnv('RAZORPAY_WEBHOOK_SECRET'),
  },
};