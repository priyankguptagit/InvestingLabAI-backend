import mongoose, { Schema, Document } from 'mongoose';

export interface IWatchlistItem {
    symbol: string;
    addedAt: Date;
}

export interface IWatchlist extends Document {
    user: mongoose.Types.ObjectId;
    items: IWatchlistItem[];
}

const WatchlistSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    items: [
        {
            symbol: { type: String, required: true, uppercase: true },
            addedAt: { type: Date, default: Date.now }
        }
    ]
}, { timestamps: true });

export default mongoose.model<IWatchlist>('Watchlist', WatchlistSchema);
