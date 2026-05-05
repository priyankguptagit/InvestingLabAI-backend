import { Request, Response } from 'express';
import Watchlist from '../models/watchlist';
import StockData from '../models/stockData';

export interface AuthRequest extends Request {
    user?: any;
}

// Get User's Watchlist
export const getWatchlist = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        let watchlist = await Watchlist.findOne({ user: userId });

        // If no watchlist exists, return empty array
        if (!watchlist || watchlist.items.length === 0) {
            return res.status(200).json({ success: true, count: 0, data: [] });
        }

        // Extract symbols
        const symbols = watchlist.items.map(item => item.symbol);

        // Fetch latest stock data for these symbols
        const stocks = await StockData.find({ symbol: { $in: symbols } })
            .sort({ timestamp: -1 });

        // We only want the latest entry per symbol
        const latestStocksMap = new Map();
        for (const stock of stocks) {
            if (!latestStocksMap.has(stock.symbol)) {
                latestStocksMap.set(stock.symbol, stock);
            }
        }

        // Combine watchlist item with stock data
        const populatedWatchlist = watchlist.items.map(item => {
            const stockData = latestStocksMap.get(item.symbol);
            return {
                symbol: item.symbol,
                addedAt: item.addedAt,
                stockData: stockData || null
            };
        });

        res.status(200).json({
            success: true,
            count: populatedWatchlist.length,
            data: populatedWatchlist
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Add to Watchlist
export const addToWatchlist = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { symbol } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        if (!symbol) {
            return res.status(400).json({ success: false, message: 'Symbol is required' });
        }

        const upperSymbol = symbol.toUpperCase();

        // Verify stock exists in DB
        const stockExists = await StockData.findOne({ symbol: upperSymbol });
        if (!stockExists) {
            return res.status(404).json({ success: false, message: 'Stock not found in our database' });
        }

        let watchlist = await Watchlist.findOne({ user: userId });

        if (!watchlist) {
            // Create new watchlist
            watchlist = new Watchlist({
                user: userId,
                items: [{ symbol: upperSymbol }]
            });
        } else {
            // Check if symbol already exists
            const exists = watchlist.items.some(item => item.symbol === upperSymbol);
            if (exists) {
                return res.status(400).json({ success: false, message: 'Stock already in watchlist' });
            }

            // Limit watchlist size to e.g. 50
            if (watchlist.items.length >= 50) {
                return res.status(400).json({ success: false, message: 'Watchlist limit reached (50 items)' });
            }

            watchlist.items.push({ symbol: upperSymbol, addedAt: new Date() });
        }

        await watchlist.save();

        res.status(200).json({ success: true, message: 'Added to watchlist', data: watchlist });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Remove from Watchlist
export const removeFromWatchlist = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { symbol } = req.params;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        if (!symbol) {
            return res.status(400).json({ success: false, message: 'Symbol is required' });
        }

        const upperSymbol = (symbol as string).toUpperCase();

        const watchlist = await Watchlist.findOne({ user: userId });

        if (!watchlist) {
            return res.status(404).json({ success: false, message: 'Watchlist not found' });
        }

        const initialLength = watchlist.items.length;
        watchlist.items = watchlist.items.filter(item => item.symbol !== upperSymbol) as any;

        if (watchlist.items.length === initialLength) {
            return res.status(404).json({ success: false, message: 'Stock not found in watchlist' });
        }

        await watchlist.save();

        res.status(200).json({ success: true, message: 'Removed from watchlist', data: watchlist });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};
