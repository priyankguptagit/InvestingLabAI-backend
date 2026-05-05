import { CompanyMemberModel } from '../models/company';
import { ReferralCodeModel } from '../models/referralCode';
import crypto from 'crypto';

const TOTAL_VALUE_POOL = 20;

export const generateUniqueReferralCode = async (
    employeeId: string,
    discountPercent: number
) => {
    if (discountPercent < 0 || discountPercent > TOTAL_VALUE_POOL) {
        throw new Error(`Discount percent must be between 0 and ${TOTAL_VALUE_POOL}`);
    }

    const employee = await CompanyMemberModel.findById(employeeId);
    if (!employee) {
        throw new Error('Employee not found');
    }

    const firstName = employee.name.split(' ')[0].replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (!firstName) {
        throw new Error('Invalid employee name');
    }

    const commissionPercent = TOTAL_VALUE_POOL - discountPercent;
    let isUnique = false;
    let code = '';

    while (!isUnique) {
        const randomString = crypto.randomBytes(2).toString('hex').slice(0, 3).toUpperCase(); // 3 random hex chars
        code = `${firstName}${discountPercent}-${randomString}`;
        
        const existing = await ReferralCodeModel.findOne({ code });
        if (!existing) {
            isUnique = true;
        }
    }

    // Attempt to save to DB
    const referralCode = new ReferralCodeModel({
        code,
        employeeId,
        discountPercent,
        commissionPercent,
    });

    await referralCode.save();

    return referralCode;
};
