import express from 'express';
import { getWatchlist, addToWatchlist, removeFromWatchlist } from '../controllers/watchlist';
import { authorize } from '../common/guards/role.guard';

const router = express.Router();

// Apply auth middleware to all watchlist routes
router.use(authorize(['user', 'admin', 'super_admin']));

router.route('/')
    .get(getWatchlist)
    .post(addToWatchlist);

router.route('/:symbol')
    .delete(removeFromWatchlist);

export default router;
