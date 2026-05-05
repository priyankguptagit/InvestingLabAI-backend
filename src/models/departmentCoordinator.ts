import mongoose, { Schema, Document } from 'mongoose';

export interface IDepartmentCoordinator extends Document {
  organization: mongoose.Types.ObjectId;
  department: mongoose.Types.ObjectId;
  name: string;
  email: string;
  mobile: string;
  profilePhoto?: string;
  bio?: string;
  passwordHash?: string;
  
  role: 'department_coordinator';
  designation: 'hod' | 'faculty' | 'coordinator' | 'other';
  
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

const DepartmentCoordinatorSchema: Schema = new Schema({
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  department: {
    type: Schema.Types.ObjectId,
    ref: 'Department',
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
  profilePhoto: {
    type: String,
    trim: true
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 500
  },
  role: {
    type: String,
    enum: ['department_coordinator'],
    default: 'department_coordinator'
  },
  designation: {
    type: String,
    enum: ['hod', 'faculty', 'coordinator', 'other'],
    required: true
  },
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

export const DepartmentCoordinatorModel = mongoose.model<IDepartmentCoordinator>('DepartmentCoordinator', DepartmentCoordinatorSchema);
