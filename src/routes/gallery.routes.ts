import express from 'express';
import { getGallery, addGalleryPhoto, deleteGalleryPhoto } from '../controllers/gallery.controller';

const router = express.Router();

import { authorize } from '../common/guards/role.guard';

router.get('/', getGallery);
router.post('/', authorize(['super_admin', 'employee'], ['gallery.upload']), addGalleryPhoto);
router.delete('/:id', authorize(['super_admin', 'employee'], ['gallery.delete']), deleteGalleryPhoto);

export default router;
