import mongoose, { Schema, Document } from 'mongoose';

export interface ICommissionLog extends Document {
    employeeId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    referralCode: string;
    planName: string;
    originalPrice: number;
    discountGiven: number;
    amountPaid: number;
    commissionEarned: number;
    status: 'pending' | 'paid';
    createdAt: Date;
    updatedAt: Date;
}

const CommissionLogSchema: Schema = new Schema(
    {
        employeeId: {
            type: Schema.Types.ObjectId,
            ref: 'CompanyMember',
            required: true,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        referralCode: {
            type: String,
            required: true,
        },
        planName: {
            type: String,
            required: true,
        },
        originalPrice: {
            type: Number,
            required: true,
            min: 0,
        },
        discountGiven: {
            type: Number,
            required: true,
            min: 0,
        },
        amountPaid: {
            type: Number,
            required: true,
            min: 0,
        },
        commissionEarned: {
            type: Number,
            required: true,
            min: 0,
        },
        status: {
            type: String,
            enum: ['pending', 'paid'],
            default: 'pending',
        },
    },
    { timestamps: true }
);

CommissionLogSchema.index({ employeeId: 1 });
CommissionLogSchema.index({ userId: 1 });
CommissionLogSchema.index({ status: 1 });

export const CommissionLogModel = mongoose.model<ICommissionLog>('CommissionLog', CommissionLogSchema);
