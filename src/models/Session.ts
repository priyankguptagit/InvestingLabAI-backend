import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    sessionToken: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    loginAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }, // Idle timeout (TTL index defined below)
    hardCapAt: { type: Date, required: true },               // 4-hour max
    isValid: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// TTL index to automatically remove expired session docs from MongoDB
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model("Session", sessionSchema);
