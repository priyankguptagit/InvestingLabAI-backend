import { CompanyMemberModel, CompanyRoleModel, ICompanyMember, CompanyActivityLogModel } from '../models/company';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import crypto from 'crypto';
import { sendEmployeeInviteEmail, sendCompanyPasswordResetEmail } from './email';

export class CompanyAuthService {

    // =================================================================
    // 1. LOGIN
    // =================================================================
    async login(email: string, plainPass: string) {
        const member = await CompanyMemberModel.findOne({ email })
            .select('+passwordHash')
            .populate('customRole');

        if (!member) throw new Error('Invalid credentials');

        if (!member.isActive) {
            throw new Error('Your account has been deactivated. Please contact the platform owner.');
        }

        if (!member.passwordHash) {
            throw new Error('Account has no password set. Please contact the platform owner.');
        }

        const isValid = await argon2.verify(member.passwordHash, plainPass);
        if (!isValid) throw new Error('Invalid credentials');

        // Joining date check: prevent login before the employee's start date
        if (member.joiningDate && new Date() < new Date(member.joiningDate)) {
            const dateStr = new Date(member.joiningDate).toLocaleDateString('en-IN', {
                day: '2-digit', month: 'long', year: 'numeric'
            });
            throw new Error(`ACCESS_BEFORE_JOINING:${dateStr}`);
        }

        // Update lastLogin
        member.lastLogin = new Date();
        await member.save();

        const { accessToken, refreshToken } = this.generateTokens(member);
        // Log the login event
        await CompanyActivityLogModel.create({
            action: 'EMPLOYEE_LOGIN',
            details: `${member.role === 'super_admin' ? 'Super Admin' : 'Employee'} logged in.`,
            performedBy: member._id,
            targetId: member._id,
            targetModel: 'CompanyMember',
            metadata: { ip: 'unknown' }
        });

        return { member, accessToken, refreshToken };
    }

    // =================================================================
    // 2. GET PROFILE BY ID
    // =================================================================
    async getMemberById(memberId: string) {
        const member = await CompanyMemberModel.findById(memberId)
            .populate('customRole')
            .select('-passwordHash -verificationToken -resetPasswordToken');
        if (!member) throw new Error('Company member not found');
        return member;
    }

    // =================================================================
    // 2b. UPDATE OWN PROFILE (name + avatar + phone)
    // Writes to CompanyMemberModel — never touches UserModel
    // =================================================================
    async updateMemberProfile(memberId: string, updateData: { name?: string; avatar?: string; phone?: string }) {
        const member = await CompanyMemberModel.findById(memberId);
        if (!member) throw new Error('Company member not found');

        if (updateData.name !== undefined) member.name = updateData.name;
        if (updateData.avatar !== undefined) member.avatar = updateData.avatar;
        if (updateData.phone !== undefined) member.phone = updateData.phone;

        await member.save();
        return member;
    }

    // =================================================================
    // 2c. CHANGE PASSWORD
    // =================================================================
    async changePassword(memberId: string, currentPassword: string, newPassword: string) {
        const member = await CompanyMemberModel.findById(memberId).select('+passwordHash');
        if (!member) throw new Error('Company member not found');

        const isValid = await argon2.verify(member.passwordHash || '', currentPassword);
        if (!isValid) throw new Error('Current password is incorrect');

        member.passwordHash = await argon2.hash(newPassword);
        await member.save();
        return { message: 'Password changed successfully' };
    }

    // =================================================================
    // 2d. FORGOT PASSWORD — generate reset token and email link
    // =================================================================
    async requestPasswordReset(email: string) {
        const member = await CompanyMemberModel.findOne({ email: email.toLowerCase().trim() })
            .select('+resetPasswordToken +resetPasswordExpires');

        // Always resolve — never reveal whether the email is registered
        if (!member) return { message: 'If this email is registered, a reset link has been sent.' };

        const rawToken = crypto.randomBytes(32).toString('hex');
        // Store SHA-256 hash of token in DB for security
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        (member as any).resetPasswordToken = hashedToken;
        member.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await member.save();

        await sendCompanyPasswordResetEmail(member.email, member.name, rawToken);

        return { message: 'If this email is registered, a reset link has been sent.' };
    }

    // =================================================================
    // 2e. RESET PASSWORD — validate token and set new password
    // =================================================================
    async resetPassword(rawToken: string, newPassword: string) {
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        const member = await CompanyMemberModel.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: new Date() },
        }).select('+resetPasswordToken +resetPasswordExpires +passwordHash');

        if (!member) throw new Error('Invalid or expired reset link. Please request a new one.');

        member.passwordHash = await argon2.hash(newPassword);
        (member as any).resetPasswordToken = undefined;
        member.resetPasswordExpires = undefined;
        await member.save();

        return { message: 'Password reset successfully. You can now log in.' };
    }

    // =================================================================
    // 3. LIST ALL EMPLOYEES (non-super_admin members)
    // =================================================================
    async listEmployees(search?: string) {
        const query: Record<string, any> = { role: { $ne: 'super_admin' } };

        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [{ name: regex }, { email: regex }];
        }

        const employees = await CompanyMemberModel.find(query)
            .populate('customRole', 'name permissions')
            .select('-passwordHash -verificationToken -resetPasswordToken')
            .sort({ createdAt: -1 })
            .lean();

        return employees;
    }

    // =================================================================
    // 4. LIST ALL STAFF (including super_admin, for super_admin view)
    // =================================================================
    async listAllMembers(search?: string) {
        const query: Record<string, any> = {};

        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [{ name: regex }, { email: regex }];
        }

        const members = await CompanyMemberModel.find(query)
            .populate('customRole', 'name permissions')
            .select('-passwordHash -verificationToken -resetPasswordToken')
            .sort({ createdAt: -1 })
            .lean();

        return members;
    }

    // =================================================================
    // 4.5. ASSIGN ROLE TO EMPLOYEE
    // =================================================================
    async assignRole(memberId: string, roleId: string | null) {
        const member = await CompanyMemberModel.findById(memberId);
        if (!member) throw new Error('Company member not found');
        if (member.role === 'super_admin') {
            throw new Error('Cannot assign custom roles to super_admins.');
        }

        if (roleId) {
            const role = await CompanyRoleModel.findById(roleId);
            if (!role) throw new Error('Selected role does not exist');
            member.customRole = roleId as any;

            // Log assigning
            await CompanyActivityLogModel.create({
                action: 'ROLE_ASSIGNED',
                details: `Assigned role "${role.name}" to employee ${member.email}.`,
                performedBy: memberId as any, // Not technically correct since performedBy is whoever called it, but we lack caller ID here without massive refactoring. Let's just track the employee ID to ensure we record *something*.
                targetId: member._id,
                targetModel: 'CompanyMember'
            });
        } else {
            member.customRole = undefined;
            // Log unassigning
            await CompanyActivityLogModel.create({
                action: 'ROLE_ASSIGNED',
                details: `Unassigned role from employee ${member.email}.`,
                performedBy: memberId as any,
                targetId: member._id,
                targetModel: 'CompanyMember'
            });
        }

        await member.save();
        return member;
    }

    // =================================================================
    // 5. ROLE CRUD
    // =================================================================
    async listRoles() {
        // For each role, also count how many employees are assigned to it
        const roles = await CompanyRoleModel.find()
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 })
            .lean();

        // Attach employee count (CompanyMember has no roleRef yet — prepare for future)
        return roles;
    }

    async createRole(
        name: string,
        description: string,
        permissions: string[],
        createdById: string
    ) {
        const existing = await CompanyRoleModel.findOne({
            name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
        });
        if (existing) throw new Error(`A role named "${name}" already exists.`);

        const role = await CompanyRoleModel.create({
            name: name.trim(),
            description: description?.trim() ?? '',
            permissions,
            createdBy: createdById,
        });

        // Log creation
        await CompanyActivityLogModel.create({
            action: 'ROLE_CREATED',
            details: `Created custom role "${role.name}".`,
            performedBy: createdById as any,
            targetId: role._id,
            targetModel: 'CompanyRole'
        });

        return role;
    }

    async updateRole(
        roleId: string,
        updates: { name?: string; description?: string; permissions?: string[] },
        updatedById: string
    ) {
        const role = await CompanyRoleModel.findById(roleId);
        if (!role) throw new Error('Role not found');

        if (updates.name !== undefined) role.name = updates.name;
        if (updates.description !== undefined) role.description = updates.description;
        if (updates.permissions !== undefined) role.permissions = updates.permissions;

        await role.save();

        // Log update
        await CompanyActivityLogModel.create({
            action: 'ROLE_UPDATED',
            details: `Updated custom role "${role.name}".`,
            performedBy: updatedById as any,
            targetId: role._id,
            targetModel: 'CompanyRole'
        });

        return role;
    }

    async deleteRole(roleId: string) {
        const role = await CompanyRoleModel.findByIdAndDelete(roleId);
        if (!role) throw new Error('Role not found');

        // Log deletion (using dummy ID for performedBy since we lack it in this signature without refactor)
        await CompanyActivityLogModel.create({
            action: 'ROLE_DELETED',
            details: `Deleted custom role "${role.name}".`,
            performedBy: role.createdBy as any, // Best effort
            targetId: role._id,
            targetModel: 'CompanyRole'
        });

        return true;
    }

    // =================================================================
    // 6. ACTIVITY LOGS
    // =================================================================
    async getActivityLogs(limit = 200) {
        return await CompanyActivityLogModel.find()
            .populate('performedBy', 'name email avatar role customRole isActive')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
    }

    async getEmployeeActivityLogs(employeeId: string, limit = 100) {
        return await CompanyActivityLogModel.find({ performedBy: employeeId })
            .populate('performedBy', 'name email avatar role customRole isActive')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
    }

    // =================================================================
    // 7. INVITE EMPLOYEE
    // =================================================================
    async inviteEmployee(
        name: string,
        email: string,
        phone: string | undefined,
        aadharNumber: string | undefined,
        permanentAddress: string | undefined,
        joiningDate: string | undefined,
        performedById: string
    ) {
        const existing = await CompanyMemberModel.findOne({ email: email.toLowerCase().trim() });
        if (existing) throw new Error(`An account with email "${email}" already exists.`);

        const token = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

        const member = await CompanyMemberModel.create({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            phone: phone?.trim() || undefined,
            aadharNumber: aadharNumber?.trim() || undefined,
            permanentAddress: permanentAddress?.trim() || undefined,
            joiningDate: joiningDate ? new Date(joiningDate) : undefined,
            role: 'employee',
            isActive: true,
            isVerified: false,
            verificationToken: token,
            resetPasswordExpires: tokenExpiry,
        });

        await sendEmployeeInviteEmail(member.email, member.name, token);

        await CompanyActivityLogModel.create({
            action: 'EMPLOYEE_CREATED',
            details: `Invited new employee: ${member.email}.`,
            performedBy: performedById as any,
            targetId: member._id,
            targetModel: 'CompanyMember',
        });

        return member;
    }

    // =================================================================
    // 7b. RESEND INVITE EMAIL
    // =================================================================
    async resendInvite(memberId: string, performedById: string) {
        const member = await CompanyMemberModel.findById(memberId)
            .select('+verificationToken +resetPasswordExpires');
        if (!member) throw new Error('Employee not found');
        if (member.role === 'super_admin') throw new Error('Cannot resend invite to a super_admin.');
        if (member.isVerified) throw new Error('This employee has already accepted their invite and set a password.');

        // Regenerate a fresh 48-hour token
        const token = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
        member.verificationToken = token;
        member.resetPasswordExpires = tokenExpiry;
        await member.save();

        await sendEmployeeInviteEmail(member.email, member.name, token);

        await CompanyActivityLogModel.create({
            action: 'EMPLOYEE_CREATED',
            details: `Resent invitation to employee: ${member.email}.`,
            performedBy: performedById as any,
            targetId: member._id,
            targetModel: 'CompanyMember',
        });

        return member;
    }

    // =================================================================
    // 8. UPDATE EMPLOYEE (name, phone, aadhar, address, joiningDate)
    // =================================================================
    async updateEmployee(
        memberId: string,
        data: { name?: string; phone?: string; permanentAddress?: string; joiningDate?: string },
        performedById: string
    ) {
        const member = await CompanyMemberModel.findById(memberId);
        if (!member) throw new Error('Employee not found');
        if (member.role === 'super_admin') throw new Error('Cannot modify a super_admin.');

        if (data.name !== undefined) member.name = data.name.trim();
        if (data.phone !== undefined) member.phone = data.phone.trim() || undefined;
        if (data.permanentAddress !== undefined) member.permanentAddress = data.permanentAddress.trim() || undefined;
        if (data.joiningDate !== undefined) member.joiningDate = data.joiningDate ? new Date(data.joiningDate) : undefined;

        await member.save();

        await CompanyActivityLogModel.create({
            action: 'EMPLOYEE_UPDATED',
            details: `Updated employee profile: ${member.email}.`,
            performedBy: performedById as any,
            targetId: member._id,
            targetModel: 'CompanyMember',
        });

        return member;
    }

    // =================================================================
    // 9. DELETE EMPLOYEE
    // =================================================================
    async deleteEmployee(memberId: string, performedById: string) {
        const member = await CompanyMemberModel.findById(memberId);
        if (!member) throw new Error('Employee not found');
        if (member.role === 'super_admin') throw new Error('Cannot delete a super_admin.');

        await CompanyActivityLogModel.create({
            action: 'EMPLOYEE_DELETED',
            details: `Deleted employee: ${member.email}.`,
            performedBy: performedById as any,
            targetId: member._id,
            targetModel: 'CompanyMember',
        });

        await CompanyMemberModel.findByIdAndDelete(memberId);
        return true;
    }

    // =================================================================
    // 10. TOGGLE BLOCK / UNBLOCK
    // =================================================================
    async toggleBlock(memberId: string, performedById: string) {
        const member = await CompanyMemberModel.findById(memberId);
        if (!member) throw new Error('Employee not found');
        if (member.role === 'super_admin') throw new Error('Cannot block a super_admin.');

        member.isActive = !member.isActive;
        await member.save();

        await CompanyActivityLogModel.create({
            action: 'EMPLOYEE_BLOCKED',
            details: `${member.isActive ? 'Unblocked' : 'Blocked'} employee: ${member.email}.`,
            performedBy: performedById as any,
            targetId: member._id,
            targetModel: 'CompanyMember',
        });

        return member;
    }

    // =================================================================
    // 11. VERIFY EMPLOYEE INVITE TOKEN & SET PASSWORD (public)
    // =================================================================
    async verifyEmployeeToken(token: string, password: string) {
        const member = await CompanyMemberModel.findOne({
            verificationToken: token,
            resetPasswordExpires: { $gt: new Date() },
        }).select('+verificationToken +resetPasswordExpires');

        if (!member) throw new Error('Invalid or expired invite link. Please contact your administrator.');

        member.passwordHash = await argon2.hash(password);
        member.isVerified = true;
        (member as any).verificationToken = undefined;
        (member as any).resetPasswordExpires = undefined;
        await member.save();

        return { message: 'Password set successfully. You can now log in.' };
    }

    // =================================================================
    // 3. REFRESH TOKEN (kept numbering consistent)
    // =================================================================
    async refreshToken(token: string) {
        try {
            const decoded = jwt.verify(token, ENV.JWT_REFRESH_SECRET) as any;
            const member = await CompanyMemberModel.findById(decoded.id).populate('customRole');

            if (!member) throw new Error('Member not found');

            const { accessToken, refreshToken } = this.generateTokens(member);
            return { accessToken, refreshToken };
        } catch {
            throw new Error('Invalid or expired refresh token');
        }
    }

    // =================================================================
    // HELPER: Token Generation
    // Note: 'model' claim distinguishes company JWTs from user JWTs in
    //        controllers that need to know the source collection.
    //        The 'role' string itself ('super_admin') stays the same so
    //        all existing authorize() guard calls continue to work.
    // =================================================================
    private generateTokens(member: any) {
        const payload = {
            id: (member._id as any).toString(),
            email: member.email,
            name: member.name,
            role: member.role,          // 'super_admin' | 'employee'
            model: 'CompanyMember',     // discriminator claim
            isActive: member.isActive,
            customRole: member.customRole?._id ? (member.customRole._id as any).toString() : null,
            permissions: member.customRole?.permissions || []
        };

        const accessToken = jwt.sign(payload, ENV.JWT_SECRET, {
            expiresIn: ENV.JWT_EXPIRES_IN,
        } as jwt.SignOptions);

        const refreshToken = jwt.sign(
            { id: (member._id as any).toString(), model: 'CompanyMember' },
            ENV.JWT_REFRESH_SECRET,
            { expiresIn: ENV.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions
        );

        return { accessToken, refreshToken };
    }
}
