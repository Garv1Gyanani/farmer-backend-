const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { uploadToS3 } = require('../services/s3Service');

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const generatePdfBuffer = (title, subtitle, fields, footerText) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // Header Banner
      doc.rect(0, 0, doc.page.width, 90).fill('#17351F');

      doc
        .fillColor('#FFFFFF')
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('PROFARMER VERIFIED ECOSYSTEM', 40, 25);

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#A3D9A5')
        .text('Department of Rural Mechanization & Agricultural Digital Identity', 40, 52);

      // Document Title Box
      doc.moveDown(3);
      doc
        .fillColor('#17351F')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(title.toUpperCase(), 40, 110);

      doc
        .fontSize(11)
        .font('Helvetica-Oblique')
        .fillColor('#555555')
        .text(subtitle, 40, 132);

      // Divider
      doc.strokeColor('#2E7D32').lineWidth(2).moveTo(40, 150).lineTo(555, 150).stroke();

      // Fields Key-Value Table
      let currentY = 170;
      fields.forEach((item, index) => {
        const bg = index % 2 === 0 ? '#F4F7F4' : '#FFFFFF';
        doc.rect(40, currentY - 4, 515, 26).fill(bg);

        doc
          .fillColor('#333333')
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(item.label, 50, currentY + 2, { width: 180 });

        doc
          .fillColor('#111111')
          .fontSize(10)
          .font('Helvetica')
          .text(item.value, 240, currentY + 2, { width: 300 });

        currentY += 28;
      });

      // Verification Watermark / Seal
      currentY += 20;
      doc.rect(40, currentY, 515, 60).fillAndStroke('#E8F5E9', '#2E7D32');
      doc
        .fillColor('#1B5E20')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('OFFICIALLY VERIFIED & DIGITALLY ATTESTED', 55, currentY + 12);
      doc
        .fillColor('#2E7D32')
        .fontSize(9)
        .font('Helvetica')
        .text(
          `Digital Record ID: ${Math.random().toString(36).substring(2, 10).toUpperCase()} • Verified on: ${new Date().toLocaleDateString('en-IN')}`,
          55,
          currentY + 32
        );

      // Footer
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#888888')
        .text(footerText || 'This document is issued for digital verification on the ProFarmer Multi-Role Marketplace.', 40, 780, {
          align: 'center',
          width: 515,
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

const createAllSeedPdfs = async () => {
  console.log('[SeedPdfs] Generating real PDF KYC documents...');

  // 1. Aadhaar Card
  const aadhaarBuffer = await generatePdfBuffer(
    'Aadhaar National Identity Verification',
    'Unique Identification Authority of India (UIDAI) — Farmer KYC Proof',
    [
      { label: 'Document Type', value: 'Government of India National Identity (Aadhaar)' },
      { label: 'Aadhaar Number', value: 'XXXX-XXXX-8821' },
      { label: 'Holder Name', value: 'Sukhwinder Singh' },
      { label: 'Father / Guardian Name', value: 'Gurcharan Singh' },
      { label: 'Date of Birth', value: '14/08/1982' },
      { label: 'Gender', value: 'Male' },
      { label: 'Permanent Address', value: 'Village Bhedpura, Tehsil Nabha, District Patiala, Punjab - 147201' },
      { label: 'Mobile Linked', value: '+91 98765 43210' },
      { label: 'Authentication Mode', value: 'Biometric & OTP Attested (Level 3 Tier-1)' },
    ],
    'Issued under The Aadhaar (Targeted Delivery of Financial and Other Subsidies, Benefits and Services) Act, 2016.'
  );
  fs.writeFileSync(path.join(uploadsDir, 'sample_aadhaar.pdf'), aadhaarBuffer);
  console.log('[SeedPdfs] Written sample_aadhaar.pdf');

  // 2. Land Record 7/12
  const landBuffer = await generatePdfBuffer(
    'Digital Land Registry & Record of Rights (Form 7/12)',
    'Department of Revenue & Land Records, Government of Punjab',
    [
      { label: 'Khatauni / Khewat No.', value: 'Khewat No. 142, Khatoni No. 288' },
      { label: 'Farmer / Cultivator', value: 'Sukhwinder Singh S/o Gurcharan Singh' },
      { label: 'Village & Tehsil', value: 'Bhedpura, Nabha Sub-Division' },
      { label: 'Total Holding Acreage', value: '18.5 Acres (7.48 Hectares)' },
      { label: 'Soil Classification', value: 'Class-I Fertile Loamy Alluvium' },
      { label: 'Irrigation Entitlement', value: 'Canal Distributary No. 4 & Licensed Tube-well 15 HP' },
      { label: 'Encumbrance / Lien', value: 'Nil (Clean Title, Verified by Sub-Registrar Nabha)' },
      { label: 'Survey Khasra Numbers', value: '124//12(4-0), 124//13(4-8), 124//14(4-0), 125//1(5-12)' },
    ],
    'Certified copy of digital land revenue records for agricultural machinery subsidy and service dispatch.'
  );
  fs.writeFileSync(path.join(uploadsDir, 'sample_land_record.pdf'), landBuffer);
  console.log('[SeedPdfs] Written sample_land_record.pdf');

  // 3. Vehicle RC (Machinery)
  const rcBuffer = await generatePdfBuffer(
    'Certificate of Registration (Agricultural Vehicle / Heavy Equipment)',
    'Ministry of Road Transport and Highways (MoRTH) — Commercial Fleet Verification',
    [
      { label: 'Registration Number', value: 'PB-11-BV-4920' },
      { label: 'Registered Fleet Owner', value: 'Majha Agro Machineries Hub (Gurpreet Singh)' },
      { label: 'Vehicle Class', value: 'Agricultural Tractor 4WD with Heavy Hydraulics' },
      { label: 'Maker / Model', value: 'John Deere 5310 4WD PowerTech CRDI' },
      { label: 'Horsepower Rating', value: '55 HP Engine Output @ 2100 RPM' },
      { label: 'Chassis / Frame Number', value: 'MB1KDA25NHE492019' },
      { label: 'Engine Number', value: '3029TP018247' },
      { label: 'Fitness Certificate Valid Upto', value: '18/11/2031' },
      { label: 'Insurance Coverage', value: 'Commercial Comprehensive Agro-Fleet Policy (Active)' },
    ],
    'Official transport registration under the Central Motor Vehicles Rules for custom hiring agricultural fleet operations.'
  );
  fs.writeFileSync(path.join(uploadsDir, 'sample_rc.pdf'), rcBuffer);
  console.log('[SeedPdfs] Written sample_rc.pdf');

  // 4. Commercial Driving License
  const dlBuffer = await generatePdfBuffer(
    'Commercial Heavy Machinery Driving Licence',
    'Licensing Authority — Regional Transport Office (RTO) Patiala',
    [
      { label: 'Licence Number', value: 'PB-11-20150039281' },
      { label: 'Operator Full Name', value: 'Gurpreet Singh' },
      { label: 'Date of Issue', value: '10/04/2015' },
      { label: 'Valid Till (Transport Class)', value: '09/04/2030' },
      { label: 'Vehicle Categories Endorsed', value: 'TRANS (Heavy Transport), TRACTOR (Agri Tractor), HARVESTER' },
      { label: 'Blood Group', value: 'B+ Positive' },
      { label: 'Certified Safety Training', value: 'Punjab Agricultural University Mechanized Safety Clearance' },
    ],
    'Authorized to operate high-capacity agricultural harvesters, laser leveling rigs and commercial tractors.'
  );
  fs.writeFileSync(path.join(uploadsDir, 'sample_dl.pdf'), dlBuffer);
  console.log('[SeedPdfs] Written sample_dl.pdf');

  // Upload all 4 to S3 storage bucket as well
  try {
    console.log('[SeedPdfs] Uploading verified PDFs to Supabase S3 bucket...');
    await uploadToS3(aadhaarBuffer, 'sample_aadhaar.pdf', 'application/pdf', 'kyc/seed');
    await uploadToS3(landBuffer, 'sample_land_record.pdf', 'application/pdf', 'kyc/seed');
    await uploadToS3(rcBuffer, 'sample_rc.pdf', 'application/pdf', 'kyc/seed');
    await uploadToS3(dlBuffer, 'sample_dl.pdf', 'application/pdf', 'kyc/seed');
    console.log('[SeedPdfs] Successfully uploaded all seed KYC PDFs to Supabase S3 bucket!');
  } catch (s3Err) {
    console.warn('[SeedPdfs] S3 upload notice:', s3Err.message);
  }
};

if (require.main === module) {
  createAllSeedPdfs()
    .then(() => {
      console.log('[SeedPdfs] All real KYC PDFs generated successfully!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[SeedPdfs] Error generating seed PDFs:', err);
      process.exit(1);
    });
}

module.exports = { createAllSeedPdfs };
