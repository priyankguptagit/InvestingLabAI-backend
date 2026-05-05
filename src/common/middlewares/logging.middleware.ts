import { Request, Response, NextFunction } from 'express';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const { method, url, ip } = req;


    res.on('finish', () => {
        const duration = Date.now() - start;
        const status = res.statusCode;
        

        const statusColor = status >= 400 ? '\x1b[31m' : '\x1b[32m';
        const resetColor = '\x1b[0m';

        console.log(
            `[${new Date().toISOString()}] ${method} ${url} ${statusColor}${status}${resetColor} - ${duration}ms - IP: ${ip}`
        );
    });

    next();
};