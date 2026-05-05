import mongoose, { Schema, Document } from 'mongoose';

export interface IDepartment extends Document {
  organization: mongoose.Types.ObjectId;
  departmentName: string;
  departmentCode: string;
  description?: string;
  
  // Stats
  totalStudents: number;
  totalCoordinators: number;
  activeStudents: number;
  
  // Status
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentSchema: Schema = new Schema({
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  departmentName: {
    type: String,
    required: true,
    trim: true
  },
  departmentCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  description: {
    type: String,
    trim: true
  },
  
  // Stats
  totalStudents: { type: Number, default: 0 },
  totalCoordinators: { type: Number, default: 0 },
  activeStudents: { type: Number, default: 0 },
  
  // Status
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
}, {
  timestamps: true
});

// Compound unique index: same department code can't exist in same organization
DepartmentSchema.index({ organization: 1, departmentCode: 1 }, { unique: true });

export const DepartmentModel = mongoose.model<IDepartment>('Department', DepartmentSchema);
