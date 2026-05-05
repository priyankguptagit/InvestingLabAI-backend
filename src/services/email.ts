import nodemailer from "nodemailer";
import { ENV } from "../config/env";
import { OrganizationModel } from "../models/organization";
import { OrganizationAdminModel } from "../models/organizationAdmin";
import { DepartmentCoordinatorModel } from "../models/departmentCoordinator";
import { DepartmentModel } from "../models/department";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: ENV.EMAIL_USER,
    pass: ENV.EMAIL_PASS,
  },
});

// Your company logo URL
const LOGO_URL = 'https://raw.githubusercontent.com/Cyber-warrior-2026/Praedico-application-2/main/backend/praedico_global_research_pvt_ltd_logo.jpg';

// =====================================================
// EXISTING USER EMAIL FUNCTIONS (UNCHANGED)
// =====================================================

export const sendVerificationEmail = async (email: string, token: string) => {
  const verificationLink = `${ENV.FRONTEND_URL}/verify/${token}`;

  await transporter.sendMail({
    from: `"Team Praedico" <${ENV.EMAIL_USER}>`,
    to: email,
    subject: '✨ Welcome to praedico Verify Your Email',
    html: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f7fa;">
        <tr>
          <td align="center" style="padding: 40px 0;">
            
            <!-- Main Container -->
            <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              
              <!-- Header with Logo -->
              <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                  <img src="${LOGO_URL}" alt="Praedico Global Research Logo" style="max-width: 220px; height: auto; margin-bottom: 20px; background-color: white; padding: 10px; border-radius: 8px;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Welcome to Praedico! 🎉</h1>
                </td>
              </tr>
              
              <!-- Content Body -->
              <tr>
                <td style="padding: 40px 30px;">
                  <h2 style="color: #333333; font-size: 22px; margin: 0 0 20px 0; font-weight: 600;">Verify Your Email Address</h2>
                  
                  <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                    Thank you for registering with <strong>Praedico</strong>! We're excited to have you on board.
                  </p>
                  
                  <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                    To complete your registration and set your password, please click the button below:
                  </p>
                  
                  <!-- CTA Button -->
                  <table role="presentation" style="width: 100%;">
                    <tr>
                      <td align="center">
                        <a href="${verificationLink}" 
                           style="display: inline-block; 
                                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                  color: #ffffff; 
                                  text-decoration: none; 
                                  padding: 16px 40px; 
                                  border-radius: 8px; 
                                  font-size: 16px; 
                                  font-weight: 600;
                                  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                                  transition: all 0.3s ease;">
                          ✓ Verify Email & Set Password
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Alternative Link -->
                  <p style="color: #888888; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0; text-align: center;">
                    Or copy and paste this link in your browser:
                  </p>
                  <p style="color: #667eea; font-size: 13px; word-break: break-all; text-align: center; margin: 10px 0 0 0;">
                    <a href="${verificationLink}" style="color: #667eea; text-decoration: none;">${verificationLink}</a>
                  </p>
                  
                  <!-- Security Note -->
                  <table role="presentation" style="width: 100%; margin-top: 30px; background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 4px;">
                    <tr>
                      <td>
                        <p style="color: #856404; font-size: 14px; margin: 0; line-height: 1.5;">
                          ⚠️ <strong>Security Note:</strong> This link will expire in <strong>1 hour</strong>. If you didn't create an account with Praedico, please ignore this email.
                        </p>
                      </td>
                    </tr>
                  </table>
                  
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
                  <p style="color: #6c757d; font-size: 14px; margin: 0 0 10px 0;">
                    Need help? Contact us at <a href="mailto:support@praedico.com" style="color: #667eea; text-decoration: none;">support@praedico.com</a>
                  </p>
                  <p style="color: #adb5bd; font-size: 12px; margin: 0;">
                    © 2026 Praedico Global Research Pvt Ltd. All rights reserved.<br>
                    Made with ❤️ by Team Sambhav & Arjun
                  </p>
                </td>
              </tr>
              
            </table>
            
          </td>
        </tr>
      </table>
    </body>
    </html>
    `
  });
};

/**
 * Send Password Reset Email with Beautiful Design
 */
export const sendPasswordResetEmail = async (email: string, token: string) => {
  const resetLink = `${ENV.FRONTEND_URL}/reset-password/${token}`;

  await transporter.sendMail({
    from: `"Team Praedico" <${ENV.EMAIL_USER}>`,
    to: email,
    subject: '🔐 Reset Your Praedico Password',
    html: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f7fa;">
        <tr>
          <td align="center" style="padding: 40px 0;">
            
            <!-- Main Container -->
            <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 40px 30px; text-align: center;">
                  <img src="${LOGO_URL}" alt="Praedico Global Research Logo" style="max-width: 220px; height: auto; margin-bottom: 20px; background-color: white; padding: 10px; border-radius: 8px;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Password Reset Request 🔐</h1>
                </td>
              </tr>
              
              <!-- Content Body -->
              <tr>
                <td style="padding: 40px 30px;">
                  <h2 style="color: #333333; font-size: 22px; margin: 0 0 20px 0; font-weight: 600;">Reset Your Password</h2>
                  
                  <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                    We received a request to reset the password for your <strong>Praedico</strong> account.
                  </p>
                  
                  <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                    Click the button below to create a new password:
                  </p>
                  
                  <!-- CTA Button -->
                  <table role="presentation" style="width: 100%;">
                    <tr>
                      <td align="center">
                        <a href="${resetLink}" 
                           style="display: inline-block; 
                                  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); 
                                  color: #ffffff; 
                                  text-decoration: none; 
                                  padding: 16px 40px; 
                                  border-radius: 8px; 
                                  font-size: 16px; 
                                  font-weight: 600;
                                  box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4);">
                          🔑 Reset Password
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Alternative Link -->
                  <p style="color: #888888; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0; text-align: center;">
                    Or copy and paste this link in your browser:
                  </p>
                  <p style="color: #f5576c; font-size: 13px; word-break: break-all; text-align: center; margin: 10px 0 0 0;">
                    <a href="${resetLink}" style="color: #f5576c; text-decoration: none;">${resetLink}</a>
                  </p>
                  
                  <!-- Security Warnings -->
                  <table role="presentation" style="width: 100%; margin-top: 30px; background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 4px;">
                    <tr>
                      <td>
                        <p style="color: #856404; font-size: 14px; margin: 0 0 10px 0; line-height: 1.5;">
                          ⚠️ <strong>Important:</strong> This link will expire in <strong>30 minutes</strong>.
                        </p>
                        <p style="color: #856404; font-size: 14px; margin: 0; line-height: 1.5;">
                          If you didn't request a password reset, please ignore this email and your password will remain unchanged.
                        </p>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Additional Help -->
                  <table role="presentation" style="width: 100%; margin-top: 20px; background-color: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; border-radius: 4px;">
                    <tr>
                      <td>
                        <p style="color: #014361; font-size: 14px; margin: 0; line-height: 1.5;">
                          💡 <strong>Security Tip:</strong> Never share your password with anyone. Praedico will never ask for your password via email.
                        </p>
                      </td>
                    </tr>
                  </table>
                  
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
                  <p style="color: #6c757d; font-size: 14px; margin: 0 0 10px 0;">
                    Need help? Contact us at <a href="mailto:support@praedico.com" style="color: #f5576c; text-decoration: none;">support@praedico.com</a>
                  </p>
                  <p style="color: #adb5bd; font-size: 12px; margin: 0;">
                    © 2026 Praedico Global Research Pvt Ltd. All rights reserved.<br>
                    Made with ❤️ by Team Sambhav & Arjun
                  </p>
                </td>
              </tr>
              
            </table>
            
          </td>
        </tr>
      </table>
    </body>
    </html>
    `
  });
};

// =====================================================
// ORGANIZATION EMAIL FUNCTIONS (NEW)
// =====================================================

// Organization Verification Email (First Admin)
export const sendOrganizationVerificationEmail = async (
  email: string,
  token: string,
  organizationName: string,
  adminName: string
) => {
  const verificationLink = `${ENV.FRONTEND_URL}/organization/verify/${token}`;

  await transporter.sendMail({
    from: `"Team Praedico" <${ENV.EMAIL_USER}>`,
    to: email,
    subject: '✨ Welcome to Praedico - Verify Your Organization',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f4f4f4; }
          .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
          .header { text-align: center; padding: 30px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
          .logo { max-width: 150px; }
          .content { padding: 40px 30px; }
          .button { display: inline-block; padding: 15px 40px; background: #667eea; color: white !important; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
          .footer { text-align: center; padding: 20px; background: #f9f9f9; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${LOGO_URL}" alt="Praedico Logo" class="logo" />
          </div>
          <div class="content">
            <h2 style="color: #667eea;">🎉 Welcome ${organizationName}!</h2>
            <p>Dear ${adminName},</p>
            <p>Thank you for registering <strong>${organizationName}</strong> with Praedico. We're excited to have your organization onboard!</p>
            <p>Please verify your email address to activate your organization account:</p>
            <center>
              <a href="${verificationLink}" class="button">Verify Organization Account</a>
            </center>
            <p style="font-size: 14px; color: #666;">Or copy this link:<br/> <code style="background: #f4f4f4; padding: 5px 10px; border-radius: 3px;">${verificationLink}</code></p>
            <p><strong>What's Next?</strong></p>
            <ul>
              <li>Create departments for your organization</li>
              <li>Add department coordinators</li>
              <li>Manage student registrations</li>
            </ul>
            <p style="color: #e74c3c;"><strong>⏰ Note:</strong> This link expires in 24 hours.</p>
          </div>
          <div class="footer">
            <p>© 2026 Praedico Global Research Pvt Ltd. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  });
};

// Organization Subscription Expiry Notification
export const sendSubscriptionExpiryEmail = async (
  email: string,
  organizationName: string,
  daysRemaining: number,
  planName: string,
  expiryDateStr: string
) => {
  const isExpired = daysRemaining < 0;
  const isExpiringToday = daysRemaining === 0;

  let title = '';
  let color = '';
  let message = '';

  if (isExpired) {
    title = '⚠️ Subscription Expired';
    color = '#f44336'; // Red
    message = `Your <strong>${planName}</strong> subscription for <strong>${organizationName}</strong> has expired on ${expiryDateStr}.`;
  } else if (isExpiringToday) {
    title = '⚠️ Subscription Expires Today';
    color = '#ff9800'; // Orange
    message = `Your <strong>${planName}</strong> subscription for <strong>${organizationName}</strong> expires <strong>today</strong> (${expiryDateStr}).`;
  } else {
    title = '⏳ Subscription Expiry Reminder';
    color = '#ff9800'; // Orange
    message = `Your <strong>${planName}</strong> subscription for <strong>${organizationName}</strong> will expire in <strong>${daysRemaining} days</strong> (on ${expiryDateStr}).`;
  }

  await transporter.sendMail({
    from: `"Praedico Billing" <${ENV.EMAIL_USER}>`,
    to: email,
    subject: title,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .content { background: #fff8e1; padding: 30px; border-radius: 10px; border-left: 5px solid ${color}; }
          .button { display: inline-block; padding: 15px 40px; background: ${color}; color: white !important; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <h2 style="color: ${color};">${title}</h2>
            <p>${message}</p>
            <p>To ensure uninterrupted access for your students and coordinators, please contact the Praedico administration team to renew your subscription.</p>
            <p>If you have already renewed, please ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `
  });
};

// Organization Admin Invite Email
export const sendOrganizationAdminInviteEmail = async (
  email: string,
  name: string,
  token: string,
  organizationName: string
) => {
  const verificationLink = `${ENV.FRONTEND_URL}/organization/verify/${token}`;

  await transporter.sendMail({
    from: `"Team Praedico" <${ENV.EMAIL_USER}>`,
    to: email,
    subject: `🎓 You've been invited as Admin - ${organizationName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .content { background: #e8f4f8; padding: 30px; border-radius: 10px; border-left: 5px solid #667eea; }
          .button { display: inline-block; padding: 15px 40px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <h2 style="color: #667eea;">👋 Welcome ${name}!</h2>
            <p>You have been invited as an administrator for <strong>${organizationName}</strong> on Praedico.</p>
            <p>Click below to set your password and activate your account:</p>
            <center>
              <a href="${verificationLink}" class="button">Set Password & Login</a>
            </center>
          </div>
        </div>
      </body>
      </html>
    `
  });
};

// Coordinator Invite Email
export const sendCoordinatorInviteEmail = async (
  email: string,
  name: string,
  token: string,
  departmentName: string
) => {
  const verificationLink = `${ENV.FRONTEND_URL}/coordinator/verify/${token}`;

  await transporter.sendMail({
    from: `"Team Praedico" <${ENV.EMAIL_USER}>`,
    to: email,
    subject: `🎓 You've been invited as Department Coordinator`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .content { background: #fff3cd; padding: 30px; border-radius: 10px; border-left: 5px solid #ffc107; }
          .button { display: inline-block; padding: 15px 40px; background: #ffc107; color: #333; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <h2 style="color: #856404;">👋 Welcome ${name}!</h2>
            <p>You have been invited as a <strong>Department Coordinator</strong> for the <strong>${departmentName}</strong> department.</p>
            <p><strong>Your Responsibilities:</strong></p>
            <ul>
              <li>Approve/Reject student registrations in your department</li>
              <li>Manage students in your department</li>
              <li>View department statistics</li>
            </ul>
            <p>Click below to set your password and activate your account:</p>
            <center>
              <a href="${verificationLink}" class="button">Set Password & Login</a>
            </center>
          </div>
        </div>
      </body>
      </html>
    `
  });
};

// Notify Organization about New Student Registration
export const sendStudentApprovalNotificationToOrganization = async (
  organizationId: string,
  departmentId: string,
  studentEmail: string,
  studentName: string
) => {
  const organization = await OrganizationModel.findById(organizationId);
  const department = await DepartmentModel.findById(departmentId);

  if (!organization || !department) return;

  // Get all organization admins
  const admins = await OrganizationAdminModel.find({
    organization: organizationId,
    isActive: true,
    isDeleted: false
  });

  // Get department coordinators
  const coordinators = await DepartmentCoordinatorModel.find({
    department: departmentId,
    isActive: true,
    isDeleted: false
  });

  // Combine all emails
  const allRecipients = [
    ...admins.map(a => a.email),
    ...coordinators.map(c => c.email)
  ];

  if (allRecipients.length === 0) return;

  await transporter.sendMail({
    from: `"Praedico Notifications" <${ENV.EMAIL_USER}>`,
    to: allRecipients.join(', '),
    subject: '🔔 New Student Registration - Approval Required',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .content { background: #e3f2fd; padding: 30px; border-radius: 10px; border-left: 5px solid #2196F3; }
          .button { display: inline-block; padding: 12px 30px; background: #2196F3; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
          .info-box { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <h2 style="color: #1976D2;">📋 New Student Registration</h2>
            <div class="info-box">
              <p><strong>📧 Student Email:</strong> ${studentEmail}</p>
              <p><strong>👤 Student Name:</strong> ${studentName}</p>
              <p><strong>🏫 Organization:</strong> ${organization.organizationName}</p>
              <p><strong>📚 Department:</strong> ${department.departmentName} (${department.departmentCode})</p>
            </div>
            <p>A new student has registered and selected your department. Please review and approve/reject their registration from your dashboard.</p>
            <center>
              <a href="${ENV.FRONTEND_URL}/dashboard" class="button">View Dashboard</a>
            </center>
          </div>
        </div>
      </body>
      </html>
    `
  });
};

// Student Approval Email (Updated)
export const sendStudentApprovalEmail = async (email: string, name: string) => {
  await transporter.sendMail({
    from: `"Praedico Team" <${ENV.EMAIL_USER}>`,
    to: email,
    subject: '✅ Your Registration Has Been Approved!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .content { background: #e8f5e9; padding: 30px; border-radius: 10px; border-left: 5px solid #4CAF50; }
          .button { display: inline-block; padding: 15px 40px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <h2 style="color: #2E7D32;">🎉 Congratulations ${name}!</h2>
            <p>Great news! Your registration has been <strong>approved</strong> by your organization.</p>
            <p>You now have full access to Praedico's paper trading platform and can start your trading journey.</p>
            <center>
              <a href="${ENV.FRONTEND_URL}/login" class="button">Login & Start Trading</a>
            </center>
            <p style="margin-top: 20px;">Happy Trading! 🚀</p>
          </div>
        </div>
      </body>
      </html>
    `
  });
};

// Student Rejection Email (Updated)
export const sendStudentRejectionEmail = async (
  email: string,
  name: string,
  reason?: string
) => {
  await transporter.sendMail({
    from: `"Praedico Team" <${ENV.EMAIL_USER}>`,
    to: email,
    subject: '❌ Registration Status Update',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .content { background: #ffebee; padding: 30px; border-radius: 10px; border-left: 5px solid #f44336; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <h2 style="color: #c62828;">Registration Status Update</h2>
            <p>Dear ${name},</p>
            <p>We regret to inform you that your registration was <strong>not approved</strong> by your organization.</p>
            ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
            <p>Please contact your organization administrator or department coordinator for more information or clarification.</p>
            <p>If you believe this is an error, please reach out to your organization directly.</p>
          </div>
        </div>
      </body>
      </html>
    `
  });
};

// =====================================================
// COMPANY EMPLOYEE INVITE EMAIL
// =====================================================

export const sendEmployeeInviteEmail = async (
  email: string,
  name: string,
  token: string
) => {
  const inviteLink = `${ENV.FRONTEND_URL}/admin/verify-employee/${token}`;

  await transporter.sendMail({
    from: `"Team Praedico" <${ENV.EMAIL_USER}>`,
    to: email,
    subject: `🚀 You've been invited to join Praedico Admin Portal`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Employee Invitation</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f7fa;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 40px 30px; text-align: center;">
                    <img src="${LOGO_URL}" alt="Praedico Logo" style="max-width: 200px; height: auto; margin-bottom: 20px; background-color: white; padding: 10px; border-radius: 8px;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700;">You're Invited! 🎉</h1>
                    <p style="color: #c4b5fd; margin: 8px 0 0 0; font-size: 15px;">Welcome to the Praedico Admin Portal</p>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <h2 style="color: #1e293b; font-size: 20px; margin: 0 0 16px 0;">Hi ${name} 👋</h2>
                    <p style="color: #475569; font-size: 15px; line-height: 1.7; margin: 0 0 20px 0;">
                      You've been invited to join the <strong>Praedico Admin Portal</strong> as an employee. Click the button below to set your password and activate your account.
                    </p>
                    <!-- CTA -->
                    <table role="presentation" style="width: 100%; margin: 24px 0;">
                      <tr>
                        <td align="center">
                          <a href="${inviteLink}"
                             style="display: inline-block;
                                    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                                    color: #ffffff;
                                    text-decoration: none;
                                    padding: 16px 44px;
                                    border-radius: 8px;
                                    font-size: 16px;
                                    font-weight: 700;
                                    box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4);">
                            🔑 Set Password & Login
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 8px 0 0 0;">
                      Or copy this link: <a href="${inviteLink}" style="color: #4f46e5; text-decoration: none; word-break: break-all;">${inviteLink}</a>
                    </p>
                    <!-- Warning -->
                    <table role="presentation" style="width: 100%; margin-top: 32px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
                      <tr>
                        <td style="padding: 14px 16px;">
                          <p style="color: #92400e; font-size: 13px; margin: 0; line-height: 1.5;">
                            ⏳ <strong>This invite link expires in 48 hours.</strong> If you didn't expect this email, please ignore it.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f8fafc; padding: 24px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                      © 2026 Praedico Global Research Pvt Ltd. All rights reserved.<br>
                      Made with ❤️ by Team Sambhav & Arjun
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `
  });
};

// =====================================================
// BACKWARD COMPATIBILITY (OLD INSTITUTE FUNCTIONS)
// =====================================================
// These are kept for backward compatibility with existing code
// They will redirect to the new organization functions

export const sendInstituteVerificationEmail = sendOrganizationVerificationEmail;
export const sendStudentApprovalNotificationToInstitutes = async (
  instituteId: string,
  studentEmail: string,
  studentName: string
) => {
  // This is the old function signature - we'll just call it without department
  // In practice, this shouldn't be used anymore, but keeping for safety
  console.warn('⚠️ sendStudentApprovalNotificationToInstitutes is deprecated. Use sendStudentApprovalNotificationToOrganization instead.');
};

// =====================================================
// COMPANY STAFF PORTAL — PASSWORD RESET EMAIL
// =====================================================

export const sendCompanyPasswordResetEmail = async (
  email: string,
  name: string,
  token: string
) => {
  const resetLink = `${ENV.FRONTEND_URL}/admin/reset-password/${token}`;

  await transporter.sendMail({
    from: `"Team Praedico" <${ENV.EMAIL_USER}>`,
    to: email,
    subject: '🔐 Reset Your Praedico Staff Portal Password',
    html: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f7fa;">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">

              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 40px 30px; text-align: center;">
                  <img src="${LOGO_URL}" alt="Praedico Global Research Logo" style="max-width: 200px; height: auto; margin-bottom: 20px; background-color: white; padding: 10px; border-radius: 8px;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700;">Staff Portal — Password Reset 🔐</h1>
                  <p style="color: #c4b5fd; margin: 8px 0 0 0; font-size: 14px;">Restricted Access Portal · Praedico Admin</p>
                </td>
              </tr>

              <!-- Content Body -->
              <tr>
                <td style="padding: 40px 30px;">
                  <h2 style="color: #1e293b; font-size: 20px; margin: 0 0 16px 0;">Hi ${name} 👋</h2>
                  <p style="color: #475569; font-size: 15px; line-height: 1.7; margin: 0 0 20px 0;">
                    We received a request to reset the password for your <strong>Praedico Staff Portal</strong> account. Click the button below to create a new password:
                  </p>

                  <!-- CTA Button -->
                  <table role="presentation" style="width: 100%; margin: 24px 0;">
                    <tr>
                      <td align="center">
                        <a href="${resetLink}"
                           style="display: inline-block;
                                  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                                  color: #ffffff;
                                  text-decoration: none;
                                  padding: 16px 44px;
                                  border-radius: 8px;
                                  font-size: 16px;
                                  font-weight: 700;
                                  box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4);">
                          🔑 Reset My Password
                        </a>
                      </td>
                    </tr>
                  </table>

                  <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 8px 0 24px 0;">
                    Or copy this link: <a href="${resetLink}" style="color: #4f46e5; text-decoration: none; word-break: break-all;">${resetLink}</a>
                  </p>

                  <!-- Security Warnings -->
                  <table role="presentation" style="width: 100%; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
                    <tr>
                      <td style="padding: 14px 16px;">
                        <p style="color: #92400e; font-size: 13px; margin: 0 0 8px 0; line-height: 1.5;">
                          ⏳ <strong>This link expires in 1 hour.</strong>
                        </p>
                        <p style="color: #92400e; font-size: 13px; margin: 0; line-height: 1.5;">
                          If you didn't request this reset, please ignore this email — your password will remain unchanged.
                        </p>
                      </td>
                    </tr>
                  </table>

                  <!-- Security tip -->
                  <table role="presentation" style="width: 100%; margin-top: 16px; background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
                    <tr>
                      <td style="padding: 12px 16px;">
                        <p style="color: #1e40af; font-size: 13px; margin: 0; line-height: 1.5;">
                          💡 <strong>Security Tip:</strong> Never share your password or this link with anyone. Praedico will never ask for your password via email.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; padding: 24px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                    © 2026 Praedico Global Research Pvt Ltd. All rights reserved.<br>
                    Made with ❤️ by Team Sambhav &amp; Arjun
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `
  });
};


// =====================================================
// PAYMENT CONFIRMATION EMAIL
// =====================================================

interface PaymentConfirmationOptions {
  to: string;
  name: string;
  planName: string;
  duration: number;
  amountPaise: number;
  razorpayPaymentId: string;
  expiresAt: Date;
}

export const sendPaymentConfirmationEmail = async (opts: PaymentConfirmationOptions) => {
  const { to, name, planName, duration, amountPaise, razorpayPaymentId, expiresAt } = opts;

  const amountRupees = (amountPaise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const durationLabel = duration === 1 ? '1 Month' : `${duration} Months`;
  const expiryStr = expiresAt.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const planEmoji = planName === 'Diamond' ? '💎' : planName === 'Gold' ? '🥇' : '⚡';

  await transporter.sendMail({
    from: `"Praedico Billing" <${ENV.EMAIL_USER}>`,
    to,
    subject: `${planEmoji} Payment Confirmed — ${planName} Plan Activated`,
    html: `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Payment Confirmed</title></head>
    <body style="margin:0;padding:0;font-family:'Segoe UI',sans-serif;background:#f4f7fa;">
      <table role="presentation" style="width:100%;background:#f4f7fa;">
        <tr><td align="center" style="padding:40px 0;">
          <table role="presentation" style="width:600px;max-width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.1);">
            <tr>
              <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:40px 30px;text-align:center;">
                <img src="${LOGO_URL}" alt="Praedico" style="max-width:200px;height:auto;margin-bottom:20px;background:#fff;padding:10px;border-radius:8px;">
                <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;">Payment Confirmed ✅</h1>
                <p style="color:#c4b5fd;margin:8px 0 0;font-size:15px;">Your ${planName} plan is now active</p>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 30px 0;">
                <h2 style="color:#1e293b;font-size:20px;margin:0 0 12px;">Hi ${name} 👋</h2>
                <p style="color:#475569;font-size:15px;line-height:1.7;margin:0;">Thank you for your purchase! Your <strong>${planName} membership</strong> is now active. Here is your receipt:</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 30px;">
                <table role="presentation" style="width:100%;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
                  <tr><td style="padding:20px 24px;">
                    <p style="color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0 0 16px;">Payment Receipt</p>
                    <table role="presentation" style="width:100%;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:12px;">
                      <tr><td style="color:#64748b;font-size:14px;padding:4px 0;">Plan</td><td style="color:#0f172a;font-size:14px;font-weight:700;text-align:right;padding:4px 0;">${planEmoji} ${planName}</td></tr>
                    </table>
                    <table role="presentation" style="width:100%;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:12px;">
                      <tr><td style="color:#64748b;font-size:14px;padding:4px 0;">Duration</td><td style="color:#0f172a;font-size:14px;font-weight:600;text-align:right;padding:4px 0;">${durationLabel}</td></tr>
                    </table>
                    <table role="presentation" style="width:100%;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:12px;">
                      <tr><td style="color:#64748b;font-size:14px;padding:4px 0;">Amount Paid</td><td style="color:#0f172a;font-size:16px;font-weight:800;text-align:right;padding:4px 0;">₹${amountRupees}</td></tr>
                    </table>
                    <table role="presentation" style="width:100%;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:12px;">
                      <tr><td style="color:#64748b;font-size:14px;padding:4px 0;">Access Until</td><td style="color:#16a34a;font-size:14px;font-weight:700;text-align:right;padding:4px 0;">${expiryStr}</td></tr>
                    </table>
                    <table role="presentation" style="width:100%;">
                      <tr><td style="color:#64748b;font-size:14px;padding:4px 0;">Transaction ID</td><td style="color:#475569;font-size:11px;font-family:monospace;text-align:right;padding:4px 0;word-break:break-all;">${razorpayPaymentId}</td></tr>
                    </table>
                  </td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 30px 32px;text-align:center;">
                <a href="${ENV.FRONTEND_URL}/user/premium" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;padding:16px 44px;border-radius:8px;font-size:16px;font-weight:700;box-shadow:0 4px 16px rgba(79,70,229,.4);">🚀 Go to Dashboard</a>
                <p style="color:#94a3b8;font-size:12px;margin:16px 0 0;">No auto-renewal · One-time payment · Keep this email as your receipt</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 30px 24px;">
                <table role="presentation" style="width:100%;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;">
                  <tr><td style="padding:12px 16px;"><p style="color:#1e40af;font-size:13px;margin:0;line-height:1.5;">💬 <strong>Need help?</strong> Contact us at <a href="mailto:support@praedico.com" style="color:#1d4ed8;text-decoration:none;">support@praedico.com</a>.</p></td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#f8fafc;padding:24px 30px;text-align:center;border-top:1px solid #e2e8f0;">
                <p style="color:#94a3b8;font-size:12px;margin:0;">© 2026 Praedico Global Research Pvt Ltd. All rights reserved.<br>Secured by <strong>Razorpay</strong> · No recurring charges</p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
    `
  });
};

// =====================================================
// INDIVIDUAL USER SUBSCRIPTION EXPIRY EMAIL
// =====================================================

export const sendUserSubscriptionExpiryEmail = async (
  email: string,
  name: string,
  daysRemaining: number,
  planName: string,
  expiryDateStr: string
) => {
  const isExpired       = daysRemaining < 0;
  const isExpiringToday = daysRemaining === 0;

  const title = isExpired
    ? '⚠️ Your Praedico Subscription Has Expired'
    : isExpiringToday
    ? '⚠️ Your Praedico Subscription Expires Today'
    : `⏳ ${daysRemaining}-Day Reminder — Praedico Subscription`;

  const headerColor = isExpired ? '#ef4444' : isExpiringToday ? '#f97316' : '#f59e0b';

  const message = isExpired
    ? `Your <strong>${planName}</strong> membership expired on <strong>${expiryDateStr}</strong>. Renew now to restore your access.`
    : isExpiringToday
    ? `Your <strong>${planName}</strong> membership expires <strong>today</strong> (${expiryDateStr}). Renew now to avoid interruption.`
    : `Your <strong>${planName}</strong> membership will expire in <strong>${daysRemaining} day${daysRemaining === 1 ? '' : 's'}</strong> (on ${expiryDateStr}).`;

  await transporter.sendMail({
    from: `"Praedico Billing" <${ENV.EMAIL_USER}>`,
    to: email,
    subject: title,
    html: `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Subscription Expiry</title></head>
    <body style="margin:0;padding:0;font-family:'Segoe UI',sans-serif;background:#f4f7fa;">
      <table role="presentation" style="width:100%;background:#f4f7fa;">
        <tr><td align="center" style="padding:40px 0;">
          <table role="presentation" style="width:600px;max-width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.1);">
            <tr>
              <td style="background:linear-gradient(135deg,${headerColor},#991b1b);padding:40px 30px;text-align:center;">
                <img src="${LOGO_URL}" alt="Praedico" style="max-width:200px;height:auto;margin-bottom:20px;background:#fff;padding:10px;border-radius:8px;">
                <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;">${planName} Plan — Expiry Notice</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 30px;">
                <h2 style="color:#1e293b;font-size:20px;margin:0 0 12px;">Hi ${name} 👋</h2>
                <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 24px;">${message}</p>
                <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 28px;">Renew your plan to continue enjoying paper trading, AI analysis, and all your ${planName} benefits.</p>
                <table role="presentation" style="width:100%;margin-bottom:28px;">
                  <tr><td align="center">
                    <a href="${ENV.FRONTEND_URL}/user/premium" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;padding:16px 44px;border-radius:8px;font-size:16px;font-weight:700;box-shadow:0 4px 16px rgba(79,70,229,.4);">🔄 Renew My Plan</a>
                  </td></tr>
                </table>
                <table role="presentation" style="width:100%;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;">
                  <tr><td style="padding:12px 16px;"><p style="color:#1e40af;font-size:13px;margin:0;line-height:1.5;">💬 Questions? Contact us at <a href="mailto:support@praedico.com" style="color:#1d4ed8;text-decoration:none;">support@praedico.com</a>.</p></td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#f8fafc;padding:24px 30px;text-align:center;border-top:1px solid #e2e8f0;">
                <p style="color:#94a3b8;font-size:12px;margin:0;">© 2026 Praedico Global Research Pvt Ltd. All rights reserved.<br>No auto-renewals · One-time payments only</p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
    `
  });
};
