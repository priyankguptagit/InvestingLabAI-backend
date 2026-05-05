/**
 * seed-admin.ts
 *
 * Seed script to create a new admin or super_admin for the Admin Portal.
 *
 * Usage:
 *   npx ts-node scripts/seed-admin.ts <email> <password> [role]
 *
 * Example:
 *   npx ts-node scripts/seed-admin.ts admin@praedico.com MySecurePassword123 super_admin
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import * as argon2 from 'argon2';
import { CompanyMemberModel } from '../src/models/company';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌  MONGODB_URI environment variable is not set.');
    process.exit(1);
}

const email = process.argv[2];
const password = process.argv[3];
const role = process.argv[4] || 'super_admin';

if (!email || !password) {
    console.error('❌  Missing required arguments.');
    console.error('Usage: npx ts-node scripts/seed-admin.ts <email> <password> [role]');
    process.exit(1);
}

async function seed() {
    console.log('🔌  Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI as string);
    console.log('✅  Connected.\n');

    const existing = await CompanyMemberModel.findOne({ email });

    if (existing) {
        console.log(`⚠️   User with email ${email} already exists. Skipping.`);
        await mongoose.disconnect();
        return;
    }

    console.log(`🔐  Hashing password...`);
    const passwordHash = await argon2.hash(password);

    console.log(`🌱  Creating new ${role}...`);
    const newAdmin = await CompanyMemberModel.create({
        name: email.split('@')[0],
        email: email,
        passwordHash: passwordHash,
        role: role,
        isActive: true,
        isVerified: true,
    });

    console.log(`\n🎉  Successfully created ${role}:`);
    console.log(`     ID    : ${newAdmin._id}`);
    console.log(`     Name  : ${newAdmin.name}`);
    console.log(`     Email : ${newAdmin.email}`);
    console.log(`     Role  : ${newAdmin.role}`);

    await mongoose.disconnect();
    console.log('\n🔌  Disconnected from MongoDB. Done.');
}

seed().catch((err) => {
    console.error('❌  Seeding failed:', err);
    process.exit(1);
});
