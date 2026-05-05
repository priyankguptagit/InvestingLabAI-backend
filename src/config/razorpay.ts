import Razorpay from 'razorpay';
import { ENV } from './env';

export const razorpayInstance = new Razorpay({
  key_id: ENV.razorpay.keyId,
  key_secret: ENV.razorpay.keySecret,
});