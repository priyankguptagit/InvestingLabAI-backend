import mongoose, { Schema, Document } from 'mongoose';

export interface IOrganizationAdmin extends Document {
  organization: mongoose.Types.ObjectId;
  name: string;
  email: string;
  mobile: string;
  passwordHash?: string;
  avatar?: string; // org admin personal profile photo — isolated from UserModel
  
  role: 'organization_admin';
  designation: 'dean' | 'director' | 'principal' | 'admin' | 'other';
  
  // Auth fields
  isVerified: boolean;
  isActive: boolean;
  verificationToken?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  
  // Activity
  lastLogin?: Date;
  lastActive?: Date;
  
  // Status
  isDeleted: boolean;
  deletedAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationAdminSchema: Schema = new Schema({
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  mobile: {
    type: String,
    required: true,
    trim: true
  },
  passwordHash: {
    type: String,
    select: false
  },
  role: {
    type: String,
    enum: ['organization_admin'],
    default: 'organization_admin'
  },
  designation: {
    type: String,
    enum: ['dean', 'director', 'principal', 'admin', 'other'],
    required: true
  },
  avatar: { type: String, default: null },
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  verificationToken: { type: String, select: false },
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpires: { type: Date, select: false },
  lastLogin: { type: Date },
  lastActive: { type: Date, default: Date.now },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
}, {
  timestamps: true
});

export const OrganizationAdminModel = mongoose.model<IOrganizationAdmin>('OrganizationAdmin', OrganizationAdminSchema);
