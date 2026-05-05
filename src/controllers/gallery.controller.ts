import { Request, Response } from "express";
import { GalleryPhoto } from "../models/gallery";
import cloudinary from "../config/cloudinary";

// 1. Fetch All Photos
export const getGallery = async (req: Request, res: Response) => {
  try {
    const photos = await GalleryPhoto.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: photos });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Failed to fetch gallery", error: error.message });
  }
};

// 2. Add New Photo Record
export const addGalleryPhoto = async (req: Request, res: Response) => {
  try {
    const { url, title, category, description } = req.body;

    if (!url || !category) {
      return res.status(400).json({ success: false, message: "URL and Category are required." });
    }

    const newPhoto = await GalleryPhoto.create({
      url,
      title: title || "Untitled Image",
      category,
      description: description || undefined,
    });

    return res.status(201).json({ success: true, message: "Photo added successfully", data: newPhoto });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Failed to add photo", error: error.message });
  }
};

// 3. Delete Photo
export const deleteGalleryPhoto = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const photo = await GalleryPhoto.findById(id);
    if (!photo) {
      return res.status(404).json({ success: false, message: "Photo not found" });
    }

    // Optional: We can also try to delete from Cloudinary here to save space!
    // Extract public_id from Cloudinary URL:
    // https://res.cloudinary.com/cloudname/image/upload/v1234/praedico_gallery/filename.jpg
    try {
        const urlParts = photo.url.split('/');
        const fileWithExt = urlParts[urlParts.length - 1];
        const pubId = fileWithExt.split('.')[0];
        // Cloudinary needs the exact folder path
        const fullCloudinaryId = `praedico_gallery/${pubId}`;
        await cloudinary.uploader.destroy(fullCloudinaryId);
    } catch (err) {
        console.warn('Failed to delete from Cloudinary, but continuing DB deletion', err);
    }

    await GalleryPhoto.findByIdAndDelete(id);

    return res.status(200).json({ success: true, message: "Photo deleted successfully" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Failed to delete photo", error: error.message });
  }
};
