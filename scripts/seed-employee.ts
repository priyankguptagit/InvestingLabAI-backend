/**
 * seed-employee.ts
 *
 * Creates a test employee account in the CompanyMember collection.
 * Credentials: testingemp@gmail.com / admin123
 *
 * Run from backend dir:
 *   npx ts-node scripts/seed-employee.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import argon2 from 'argon2';
import { CompanyMemberModel } from '../src/models/company';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌  MONGODB_URI not set in .env');
    process.exit(1);
}

async function seed() {
    console.log('🔌  Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI as string);
    console.log('✅  Connected.\n');

    const email = 'testingemp@gmail.com';
    const plainPassword = 'admin123';

    const existing = await CompanyMemberModel.findOne({ email });
    if (existing) {
        console.log(`ℹ️   Employee ${email} already exists (id: ${existing._id}). Skipping.`);
        await mongoose.disconnect();
        return;
    }

    const passwordHash = await argon2.hash(plainPassword);

    const employee = await CompanyMemberModel.create({
        name: 'Test Employee',
        email,
        passwordHash,
        role: 'employee',
        isActive: true,
        isVerified: true,
    });

    console.log('✅  Employee created successfully!');
    console.log(`   Email    : ${employee.email}`);
    console.log(`   Password : ${plainPassword}`);
    console.log(`   Role     : ${employee.role}`);
    console.log(`   _id      : ${employee._id}`);
    console.log('\n⚠️  Login via POST /api/company/login with the above credentials.');

    await mongoose.disconnect();
    console.log('🔌  Disconnected. Done.');
}

seed().catch((err) => {
    console.error('❌  Seeding failed:', err);
    process.exit(1);
});
