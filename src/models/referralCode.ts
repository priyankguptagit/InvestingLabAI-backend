import mongoose, { Schema, Document } from 'mongoose';

export interface IReferralCode extends Document {
    code: string;               // e.g. AMAN10-X7B
    employeeId: mongoose.Types.ObjectId; 
    discountPercent: number;    // e.g. 10
    commissionPercent: number;  // e.g. 10 (20 pool - 10 discount)
    isActive: boolean;
    usageCount: number;
    createdAt: Date;
    updatedAt: Date;
}

const ReferralCodeSchema: Schema = new Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
        },
        employeeId: {
            type: Schema.Types.ObjectId,
            ref: 'CompanyMember',
            required: true,
        },
        discountPercent: {
            type: Number,
            required: true,
            min: 0,
            max: 20, // Based on the 20% pool
        },
        commissionPercent: {
            type: Number,
            required: true,
            min: 0,
            max: 20, // Calculated value
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        usageCount: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

// Indexes
ReferralCodeSchema.index({ code: 1 });
ReferralCodeSchema.index({ employeeId: 1 });

export const ReferralCodeModel = mongoose.model<IReferralCode>('ReferralCode', ReferralCodeSchema);
