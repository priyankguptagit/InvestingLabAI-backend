import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

// Wrapper to catch async errors automatically
export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// The Final Safety Net
export const globalErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('❌ Error:', err);

    // 1. Handle Zod Validation Errors (Bad User Input)
    if (err instanceof ZodError) {
        return res.status(400).json({
            success: false,
            message: 'Validation Error',
            // FIXED: Changed 'err.errors' to 'err.issues'
            errors: err.issues.map(e => ({ 
                field: e.path[0], 
                message: e.message 
            }))
        });
    }

    // 2. Handle Known Errors (Manual 'throw new Error')
    if (err.message) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }

    // 3. Handle Unknown Server Crashes
    return res.status(500).json({
        success: false,
        message: 'Internal Server Error'
    });
};