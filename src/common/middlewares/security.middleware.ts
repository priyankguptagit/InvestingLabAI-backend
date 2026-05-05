import { Request, Response, NextFunction } from 'express';

export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
    // 1. Prevent Clickjacking (Site cannot be put in an iframe)
    res.setHeader('X-Frame-Options', 'DENY');
    
    // 2. XSS Protection (Stop browser from executing malicious scripts)
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // 3. Content Type Options (Stop browser from guessing file types)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // 4. Hide Tech Stack (Don't let hackers know we use Express)
    res.removeHeader('X-Powered-By');
    
    // 5. Strict Transport Security (Force HTTPS) - Good for Production
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
};