
import fs from 'fs';
import path from 'path';

export const logDebug = (message: string, data?: any) => {
    const logFile = path.join(process.cwd(), 'backend-debug.log');
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message} ${data ? JSON.stringify(data) : ''}\n`;

    try {
        fs.appendFileSync(logFile, logEntry);
    } catch (err) {
        console.error('Failed to write to debug log', err);
    }
};
