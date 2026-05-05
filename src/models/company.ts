import mongoose, { Schema, Document } from 'mongoose';

export interface ICompanyMember extends Document {
    name: string;
    email: string;
    passwordHash?: string;

    /** 
     * 'super_admin'  → full platform access
     * 'admin'        → elevated platform access
     * 'employee'     → standard internal staff
     */
    role: 'super_admin' | 'admin' | 'employee';

    /** Reference to CompanyRole (only applicable if role === 'employee') */
    customRole?: mongoose.Types.ObjectId;

    // Basic profile
    phone?: string;
    avatar?: string;
    aadharNumber?: string;
    permanentAddress?: string;
    joiningDate?: Date;

    // Auth / account state
    isActive: boolean;
    isVerified: boolean;
    verificationToken?: string;
    resetPasswordToken?: string;
    resetPasswordExpires?: Date;
    lastLogin?: Date;

    createdAt: Date;
    updatedAt: Date;
}

const CompanyMemberSchema: Schema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        passwordHash: {
            type: String,
            select: false,
        },
        role: {
            type: String,
            enum: ['super_admin', 'admin', 'employee'],
            default: 'employee',
        },
        customRole: {
            type: Schema.Types.ObjectId,
            ref: 'CompanyRole',
            default: null,
        },

        // Basic profile
        phone: { type: String, trim: true },
        avatar: { type: String, default: null },
        aadharNumber: { type: String, trim: true, select: false },
        permanentAddress: { type: String, trim: true },
        joiningDate: { type: Date },

        // Auth / account state
        isActive: { type: Boolean, default: true },
        isVerified: { type: Boolean, default: false },
        verificationToken: { type: String, select: false },
        resetPasswordToken: { type: String, select: false },
        resetPasswordExpires: { type: Date, select: false },
        lastLogin: { type: Date },
    },
    { timestamps: true }
);

export const CompanyMemberModel = mongoose.model<ICompanyMember>(
    'CompanyMember',
    CompanyMemberSchema
);

// ─────────────────────────────────────────────────────────────────────────────
// CompanyRole — custom roles created by super_admin
// ─────────────────────────────────────────────────────────────────────────────

export interface ICompanyRole extends Document {
    name: string;
    description?: string;
    /** Array of granular permission keys e.g. ["users.view", "users.edit"] */
    permissions: string[];
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const CompanyRoleSchema: Schema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            unique: true,
        },
        description: {
            type: String,
            trim: true,
            default: '',
        },
        permissions: {
            type: [String],
            default: [],
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'CompanyMember',
            required: true,
        },
    },
    { timestamps: true }
);

export const CompanyRoleModel = mongoose.model<ICompanyRole>(
    'CompanyRole',
    CompanyRoleSchema
);

// =================================================================
// 3. ACTIVITY LOG MODEL (Audit Trail)
// =================================================================
export interface ICompanyActivityLog extends Document {
    action: string;
    details: string;
    performedBy: mongoose.Types.ObjectId | ICompanyMember;
    targetId?: mongoose.Types.ObjectId;
    targetModel?: string; // e.g., 'CompanyMember', 'CompanyRole'
    metadata?: Record<string, any>;
    createdAt: Date;
}

const CompanyActivityLogSchema: Schema = new Schema(
    {
        action: {
            type: String,
            required: true,
            enum: [
                'EMPLOYEE_CREATED',
                'EMPLOYEE_UPDATED',
                'EMPLOYEE_DELETED',
                'EMPLOYEE_BLOCKED',
                'EMPLOYEE_LOGIN',
                'EMPLOYEE_LOGOUT',
                'ROLE_CREATED',
                'ROLE_UPDATED',
                'ROLE_DELETED',
                'ROLE_ASSIGNED',
            ],
        },
        details: { type: String, required: true },
        performedBy: {
            type: Schema.Types.ObjectId,
            ref: 'CompanyMember',
            required: true,
        },
        targetId: { type: Schema.Types.ObjectId },
        targetModel: { type: String },
        metadata: { type: Schema.Types.Mixed },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

export const CompanyActivityLogModel = mongoose.model<ICompanyActivityLog>(
    'CompanyActivityLog',
    CompanyActivityLogSchema
);
