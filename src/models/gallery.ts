import mongoose, { Schema, Document } from "mongoose";

export interface IGalleryPhoto extends Document {
  url: string;
  title: string;
  category: string;
  description?: string;
  createdAt: Date;
}

const galleryPhotoSchema = new Schema<IGalleryPhoto>(
  {
    url: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      maxLength: 500,
    },
  },
  {
    timestamps: true,
  }
);

export const GalleryPhoto = mongoose.model<IGalleryPhoto>("GalleryPhoto", galleryPhotoSchema);
