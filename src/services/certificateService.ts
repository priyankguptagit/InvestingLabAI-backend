import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { CertificateModel } from '../models/certificate';
import { CounterModel } from '../models/counter';
import { Types } from 'mongoose';
import axios from 'axios';

class CertificateService {
  private async fetchImage(url: string): Promise<Buffer> {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data, 'binary');
  }

  // Helper method to safely get the next sequence value atomically
  private async getNextSequenceValue(sequenceName: string): Promise<number> {
    const sequenceDocument = await CounterModel.findOneAndUpdate(
      { _id: sequenceName },
      { $inc: { sequence_value: 1 } },
      { new: true, upsert: true }
    );
    return sequenceDocument.sequence_value;
  }

  public async generateCertificate(params: {
    userId: Types.ObjectId | string;
    organizationId?: Types.ObjectId | string;
    userName: string;
    planName: string;
    startDate: Date;
    endDate: Date;
    organizationLogoUrl?: string; // Optional custom logo
  }): Promise<void> {
    try {
      // 1. Create a sequential, unique certificate number
      const year = new Date().getFullYear();
      const sequenceName = `certificateId_${year}`;
      const sequenceValue = await this.getNextSequenceValue(sequenceName);
      
      // Pad with leading zeros to 5 digits (e.g., 00001, 00042)
      const paddedSequence = String(sequenceValue).padStart(5, '0');
      const certNumber = `PGR-${year}-${paddedSequence}`;

      // 2. Define directory and filename
      const publicDir = path.join(process.cwd(), 'public');
      const certsDir = path.join(publicDir, 'certificates');
      if (!fs.existsSync(certsDir)) {
        fs.mkdirSync(certsDir, { recursive: true });
      }

      const fileName = `${certNumber}.pdf`;
      const filePath = path.join(certsDir, fileName);

      // 3. Create a new PDF document (margin 0 to prevent accidental page breaks)
      const doc = new PDFDocument({
        layout: 'landscape',
        size: 'A4',
        margin: 0,
      });

      // Write to file
      doc.pipe(fs.createWriteStream(filePath));

      // --- Draw Professional Certificate Layout --- //

      const margin = 40;
      const width = doc.page.width;
      const height = doc.page.height;
      const innerWidth = width - (margin * 2);
      const innerHeight = height - (margin * 2);

      // 1. Watermark (Background Image)
      let defaultLogoBuffer: Buffer | null = null;
      try {
        const defaultLogoUrl = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ4NaZy6n9TIVU0PRqpQ9mW-9yZLiPVajx2zg&s';
        defaultLogoBuffer = await this.fetchImage(defaultLogoUrl);

        // Draw huge watermark in the center
        const wmWidth = 350;
        doc.save()
           .opacity(0.1) // Adjust opacity here
           .image(defaultLogoBuffer, width/2 - wmWidth/2, height/2 - wmWidth/2, { width: wmWidth })
           .restore();
      } catch (err) {
        console.error('Failed to load watermark logo', err);
      }

      // 2. Borders
      // Outer sharp border
      doc.rect(margin, margin, innerWidth, innerHeight).lineWidth(2).stroke('#0f172a'); 
      // Inner elegant thin border
      doc.rect(margin + 6, margin + 6, innerWidth - 12, innerHeight - 12).lineWidth(0.5).stroke('#cbd5e1'); 

      // 3. Top Accent Gradient Bar
      const grad = doc.linearGradient(margin + 6, margin + 6, width - margin - 6, margin + 6 + 18);
      grad.stop(0, '#0284c7').stop(1, '#059669'); // Cyan/Blue to Emerald
      doc.rect(margin + 6, margin + 6, innerWidth - 12, 18).fill(grad);

      // Reset text color
      doc.fillColor('#0f172a');

      // 4. Header & Logos
      const logoY = margin + 35;
      
      // Praedico Logo (Left)
      if (defaultLogoBuffer) {
        doc.image(defaultLogoBuffer, margin + 50, logoY, { width: 80 });
      }

      // Credential Details (Top Middle - Side by Side)
      const issueDateStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
      
      // Left side of middle center: Certificate ID
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#64748b').text(`Certificate ID: `, width/2 - 220, logoY + 30, { continued: true })
         .font('Helvetica').fillColor('#0f172a').text(`${certNumber}`, { continued: false });
         
      // Right side of middle center: Issue Date  
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#64748b').text(`Issue Date: `, width/2 + 60, logoY + 30, { continued: true })
         .font('Helvetica').fillColor('#0f172a').text(`${issueDateStr}`, { continued: false });

      // Organization Logo (Right)
      try {
        const secondaryLogoUrl = params.organizationLogoUrl || 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ4NaZy6n9TIVU0PRqpQ9mW-9yZLiPVajx2zg&s';
        const secondaryLogo = await this.fetchImage(secondaryLogoUrl);
        doc.image(secondaryLogo, width - margin - 130, logoY, { width: 80 });
      } catch (err) {
        console.error('Failed to load secondary logo', err);
      }

      // 5. Title & Hierarchy
      doc.font('Times-Bold')
         .fontSize(38)
         .fillColor('#0f172a')
         .text('CERTIFICATE OF EXCELLENCE', 0, 180, { align: 'center', characterSpacing: 2 } as any);

      doc.font('Helvetica')
         .fontSize(12)
         .fillColor('#64748b')
         .text('THIS CREDENTIAL IS PROUDLY PRESENTED TO', 0, 240, { align: 'center', characterSpacing: 4 } as any);

      // 6. User Name
      doc.font('Times-Italic')
         .fontSize(46)
         .fillColor('#0f172a')
         .text(params.userName, 0, 275, { align: 'center' });
      
      // Horizontal Rule under name
      doc.moveTo(width / 2 - 220, 335)
         .lineTo(width / 2 + 220, 335)
         .lineWidth(1)
         .stroke('#cbd5e1');

      // 7. Achievement Description
      doc.font('Helvetica')
         .fontSize(15)
         .fillColor('#475569')
         .text('In recognition of successfully mastering real-world financial dynamics and portfolio management as part of the', 0, 365, { align: 'center' });
      
      doc.font('Helvetica-Bold')
         .fontSize(24)
         .fillColor('#0369a1') // Strong Ocean Blue
         .text(`${params.planName} Program`, 0, 395, { align: 'center' });

      // 8. Important Dates & Premium Duration Text
      const diffTime = Math.abs(params.endDate.getTime() - params.startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const months = Math.round(diffDays / 30);
      let durationText = `${months} Months`;
      if (months === 1) durationText = 'One Month';
      else if (months === 3) durationText = 'Three Months';
      else if (months === 6) durationText = 'Six Months';
      else if (months === 12) durationText = 'One Year';

      const startDateStr = params.startDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
      const endDateStr = params.endDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
      
      doc.font('Helvetica')
         .fontSize(13)
         .fillColor('#64748b')
         .text(`For a duration of ${durationText} (${startDateStr} to ${endDateStr})`, 0, 440, { align: 'center' });

      // 9. Footer (Signature Box centered at bottom)
      const footerY = height - margin - 75;

      // Center Footer (Authorized Signature)
      doc.moveTo(width / 2 - 140, footerY + 20)
         .lineTo(width / 2 + 140, footerY + 20)
         .lineWidth(1)
         .stroke('#0f172a');
      
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text('Praedico Global Research', width / 2 - 150, footerY + 35, { width: 300, align: 'center' });
      doc.font('Helvetica').fontSize(11).fillColor('#64748b').text('Authorized Issuing Body', width / 2 - 150, footerY + 55, { width: 300, align: 'center' });

      // End PDF stream
      doc.end();

      // 4. Save to Database
      await CertificateModel.create({
        user: params.userId,
        organization: params.organizationId,
        certificateNumber: certNumber,
        certificateUrl: `/public/certificates/${fileName}`,
        startDate: params.startDate,
        endDate: params.endDate,
        issuedAt: new Date(),
        planName: params.planName,
        type: 'subscription_expiry'
      });

      console.log(`Certificate ${certNumber} generated for ${params.userName}`);
    } catch (error) {
      console.error('Error generating certificate:', error);
      throw error;
    }
  }
}

export default new CertificateService();
