const PDFDocument = require('pdfkit');

/**
 * Generate Itemized Tax Invoice PDF
 */
const generateInvoicePDF = (booking, res) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });

  // Stream directly to response
  doc.pipe(res);

  const primaryGreen = '#02200C';
  const accentGreen = '#17351F';
  const lightBg = '#F6FBF1';
  const textDark = '#1F2937';
  const textMuted = '#4B5563';

  // Header Banner
  doc.rect(40, 40, 515, 60).fill(primaryGreen);
  doc.fillColor('#FFFFFF').fontSize(18).font('Helvetica-Bold').text('PRO-FARMER TECHNOLOGIES', 55, 55);
  doc.fontSize(9).font('Helvetica').text('Rural Marketplace & Agricultural Mechanization Platform', 55, 78);
  doc.fontSize(8).text('GSTIN: 03AABCU9603R1ZM | CIN: U01100PB2025PTC054112', 320, 58, { align: 'right', width: 220 });
  doc.text('Support: support@profarmer.in | +91 1800-FARM-001', 320, 72, { align: 'right', width: 220 });

  // Invoice Title & Meta
  doc.fillColor(primaryGreen).fontSize(16).font('Helvetica-Bold').text('TAX INVOICE', 40, 115);
  doc.fillColor(textMuted).fontSize(9).font('Helvetica');
  doc.text(`Invoice No: INV-${booking.bookingNumber}`, 40, 135);
  doc.text(`Date of Issue: ${new Date(booking.createdAt).toLocaleDateString('en-IN')}`, 40, 148);
  doc.text(`Place of Supply: Punjab (03)`, 40, 161);

  doc.text(`Booking Ref: #${booking.bookingNumber}`, 350, 135, { align: 'right', width: 205 });
  doc.text(`Scheduled Date: ${new Date(booking.scheduledDate).toLocaleDateString('en-IN')}`, 350, 148, { align: 'right', width: 205 });
  doc.text(`Payment Status: ${booking.payment?.status?.toUpperCase() || 'PAID'}`, 350, 161, { align: 'right', width: 205 });

  // Divider
  doc.strokeColor('#D1D5DB').lineWidth(1).moveTo(40, 180).lineTo(555, 180).stroke();

  // Billed To & Service Provider Columns
  const colY = 195;
  // Left: Farmer Details
  doc.fillColor(accentGreen).fontSize(10).font('Helvetica-Bold').text('BILLED TO (FARMER / CLIENT):', 40, colY);
  doc.fillColor(textDark).fontSize(9).font('Helvetica');
  doc.text(`Farmer: ${booking.farmerId?.name || 'Valued Farmer'}`, 40, colY + 16);
  doc.text(`Phone: ${booking.farmerId?.phone || 'N/A'}`, 40, colY + 28);
  doc.text(`Parcel: ${booking.parcelDetails?.name || 'Primary Farm'} (${booking.parcelDetails?.acreage || 1} Acres)`, 40, colY + 40);
  doc.text(`Location: ${booking.parcelDetails?.village || 'Village'}, Tehsil ${booking.parcelDetails?.tehsil || 'Tehsil'}`, 40, colY + 52);
  doc.text(`District: ${booking.parcelDetails?.district || 'Punjab'}`, 40, colY + 64);

  // Right: Service Provider & Machine
  doc.fillColor(accentGreen).fontSize(10).font('Helvetica-Bold').text('SERVICE PARTNER & ASSET:', 320, colY);
  doc.fillColor(textDark).fontSize(9).font('Helvetica');
  doc.text(`Partner: ${booking.providerId?.name || 'Assigned Certified Partner'}`, 320, colY + 16);
  doc.text(`Mobile: ${booking.providerId?.phone || 'Verified on Network'}`, 320, colY + 28);
  doc.text(`Service: ${booking.serviceId?.name || 'Agricultural Mechanization'}`, 320, colY + 40);
  doc.text(`SAC Code: 998611 (Agricultural Support Services)`, 320, colY + 52);

  // Divider
  doc.strokeColor('#D1D5DB').lineWidth(1).moveTo(40, 275).lineTo(555, 275).stroke();

  // Table Header
  const tableHeaderY = 285;
  doc.rect(40, tableHeaderY, 515, 22).fill(lightBg);
  doc.fillColor(primaryGreen).fontSize(9).font('Helvetica-Bold');
  doc.text('SL', 45, tableHeaderY + 6);
  doc.text('DESCRIPTION OF SERVICE', 75, tableHeaderY + 6);
  doc.text('SAC', 290, tableHeaderY + 6);
  doc.text('ACREAGE', 345, tableHeaderY + 6);
  doc.text('RATE (₹)', 415, tableHeaderY + 6);
  doc.text('AMOUNT (₹)', 480, tableHeaderY + 6, { align: 'right', width: 70 });

  // Table Row 1: Core Service
  const row1Y = 315;
  doc.fillColor(textDark).fontSize(9).font('Helvetica');
  doc.text('1', 45, row1Y);
  doc.text(`${booking.serviceId?.name || 'Farm Service'} (${booking.parcelDetails?.cropType || 'Kharif/Rabi'})`, 75, row1Y, { width: 205 });
  doc.text('998611', 290, row1Y);
  doc.text(`${booking.pricing?.units || booking.parcelDetails?.acreage || 1} Acres`, 345, row1Y);
  doc.text(`₹${booking.pricing?.unitPrice || 0}`, 415, row1Y);
  doc.text(`₹${booking.pricing?.baseAmount || 0}`, 480, row1Y, { align: 'right', width: 70 });

  // Table Row 2: Platform Convenience Fee
  let nextRowY = row1Y + 25;
  if (booking.pricing?.platformFee > 0) {
    doc.text('2', 45, nextRowY);
    doc.text('Technology & Network Facilitation Fee', 75, nextRowY, { width: 205 });
    doc.text('998319', 290, nextRowY);
    doc.text('1 Unit', 345, nextRowY);
    doc.text(`₹${booking.pricing.platformFee}`, 415, nextRowY);
    doc.text(`₹${booking.pricing.platformFee}`, 480, nextRowY, { align: 'right', width: 70 });
    nextRowY += 25;
  }

  // Row Divider
  doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(40, nextRowY + 5).lineTo(555, nextRowY + 5).stroke();

  // Financial Summary Box
  const summaryY = nextRowY + 15;
  const leftX = 320;

  doc.fillColor(textMuted).fontSize(9).font('Helvetica');
  doc.text('Subtotal Base Amount:', leftX, summaryY);
  doc.text(`₹${booking.pricing?.baseAmount || 0}`, 480, summaryY, { align: 'right', width: 70 });

  if (booking.pricing?.couponDiscount > 0) {
    doc.text('Promotional Subsidy / Discount:', leftX, summaryY + 16);
    doc.fillColor('#15803D').text(`- ₹${booking.pricing.couponDiscount}`, 480, summaryY + 16, { align: 'right', width: 70 });
    doc.fillColor(textMuted);
  }

  doc.text('Agri-Services GST (Section 12 Exempt):', leftX, summaryY + 32);
  doc.text('₹0.00', 480, summaryY + 32, { align: 'right', width: 70 });

  doc.text('Platform GST (18% on tech fee):', leftX, summaryY + 48);
  doc.text(`₹${booking.pricing?.taxes || 0}`, 480, summaryY + 48, { align: 'right', width: 70 });

  // Total Net Box
  const totalBoxY = summaryY + 68;
  doc.rect(leftX - 10, totalBoxY, 245, 26).fill(lightBg);
  doc.fillColor(primaryGreen).fontSize(11).font('Helvetica-Bold');
  doc.text('TOTAL AMOUNT PAID:', leftX, totalBoxY + 7);
  doc.text(`₹${booking.pricing?.totalAmount || 0}`, 470, totalBoxY + 7, { align: 'right', width: 80 });

  // Payment Breakdown Note
  const payInfoY = summaryY + 110;
  doc.rect(40, payInfoY, 260, 60).fill('#F9FAFB');
  doc.strokeColor('#E5E7EB').rect(40, payInfoY, 260, 60).stroke();
  doc.fillColor(accentGreen).fontSize(8).font('Helvetica-Bold').text('PAYMENT SETTLEMENT DETAILS', 50, payInfoY + 8);
  doc.fillColor(textDark).fontSize(8).font('Helvetica');
  doc.text(`Payment Mode: ${(booking.payment?.method || 'UPI').toUpperCase()}`, 50, payInfoY + 22);
  doc.text(`Transaction Ref: ${booking.payment?.transactionId || 'PRO-TXN-' + booking.bookingNumber}`, 50, payInfoY + 34);
  doc.text(`Escrow / Payout Status: Settled via Smart Escrow`, 50, payInfoY + 46);

  // Footer & Digital Validation
  doc.fontSize(8).fillColor(textMuted).text('This is a computer-generated digital tax invoice authorized under IT Act 2000. No physical signature required.', 40, 740, { align: 'center', width: 515 });
  doc.fillColor(primaryGreen).fontSize(8).font('Helvetica-Bold').text('PRO-FARMER TECHNOLOGIES PVT LTD • EMPOWERING RURAL INDIA', 40, 755, { align: 'center', width: 515 });

  doc.end();
};

/**
 * Generate Agricultural Work Completion Certificate PDF
 */
const generateWorkCertificatePDF = (booking, res) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });

  doc.pipe(res);

  const primaryGreen = '#02200C';
  const goldAccent = '#B45309';
  const lightBg = '#F6FBF1';
  const textDark = '#1F2937';

  // Decorative Border
  doc.rect(25, 25, 545, 792).strokeColor('#17351F').lineWidth(2).stroke();
  doc.rect(30, 30, 535, 782).strokeColor('#C8ECCB').lineWidth(1).stroke();

  // Header
  doc.fillColor(primaryGreen).fontSize(20).font('Helvetica-Bold').text('PRO-FARMER TECHNOLOGIES', 40, 60, { align: 'center' });
  doc.fillColor(goldAccent).fontSize(14).font('Helvetica-Bold').text('CERTIFICATE OF AGRICULTURAL WORK COMPLETION', 40, 88, { align: 'center' });
  doc.fillColor('#4B5563').fontSize(9).font('Helvetica').text(`Certificate Serial: WCC-${booking.bookingNumber}`, 40, 108, { align: 'center' });

  // Watermark or badge
  doc.rect(190, 125, 215, 24).fill('#EBF5EE');
  doc.fillColor(primaryGreen).fontSize(9).font('Helvetica-Bold').text('OFFICIALLY VERIFIED VIA START-OTP', 190, 132, { align: 'center', width: 215 });

  // Certificate Statement
  const introY = 175;
  doc.fillColor(textDark).fontSize(10).font('Helvetica').lineGap(4);
  const certText = `This is to certify that the agricultural mechanization service detailed below was successfully executed and completed on-site in full compliance with ProFarmer precision agricultural standards and quality specifications.`;
  doc.text(certText, 55, introY, { width: 485, align: 'justify' });

  // Details Grid
  const gridY = 230;
  doc.rect(55, gridY, 485, 260).fill('#FAFAFA');
  doc.strokeColor('#D1D5DB').lineWidth(1).rect(55, gridY, 485, 260).stroke();

  const renderRow = (y, label1, val1, label2, val2) => {
    doc.fillColor('#6B7280').fontSize(8).font('Helvetica-Bold').text(label1.toUpperCase(), 70, y);
    doc.fillColor(textDark).fontSize(9).font('Helvetica').text(val1, 70, y + 12);

    doc.fillColor('#6B7280').fontSize(8).font('Helvetica-Bold').text(label2.toUpperCase(), 320, y);
    doc.fillColor(textDark).fontSize(9).font('Helvetica').text(val2, 320, y + 12);
  };

  renderRow(gridY + 15, 'Farmer Name', booking.farmerId?.name || 'Farmer', 'Phone Number', booking.farmerId?.phone || 'N/A');
  renderRow(gridY + 55, 'Service Executed', booking.serviceId?.name || 'Mechanized Agri Service', 'Crop Type', booking.parcelDetails?.cropType || 'General Crop');
  renderRow(gridY + 95, 'Farm Parcel Name', booking.parcelDetails?.name || 'Primary Parcel', 'Village / Cluster', `${booking.parcelDetails?.village || 'Village'}, Tehsil ${booking.parcelDetails?.tehsil || 'Tehsil'}`);
  renderRow(gridY + 135, 'Booked Acreage', `${booking.parcelDetails?.acreage || 1} Acres`, 'Acreage Completed', `${booking.completionSignoff?.acreageWorked || booking.parcelDetails?.acreage || 1} Acres`);
  renderRow(gridY + 175, 'Service Partner', booking.providerId?.name || 'Assigned Partner', 'Start-OTP Verified', `Code: ${booking.startOtp || '****'} [VERIFIED]`);
  renderRow(gridY + 215, 'Date Completed', booking.completionSignoff?.completedAt ? new Date(booking.completionSignoff.completedAt).toLocaleString('en-IN') : new Date().toLocaleDateString('en-IN'), 'Quality Rating', `${booking.completionSignoff?.farmerRating || 5.0} / 5.0 ⭐`);

  // Operator Notes & Signoff
  const notesY = 515;
  doc.rect(55, notesY, 485, 65).fill(lightBg);
  doc.fillColor(primaryGreen).fontSize(9).font('Helvetica-Bold').text('FIELD OPERATOR COMPLETION NOTES & TELEMETRY:', 65, notesY + 10);
  doc.fillColor(textDark).fontSize(8).font('Helvetica').text(
    booking.completionSignoff?.operatorNotes || 'Service completed strictly following field safety parameters, recommended spray dosage, and uniform coverage without mechanical damage to field bunds.',
    65,
    notesY + 25,
    { width: 465 }
  );

  // Signature Blocks
  const sigY = 620;

  // Partner / Operator
  doc.strokeColor('#9CA3AF').lineWidth(1).moveTo(80, sigY + 50).lineTo(220, sigY + 50).stroke();
  doc.fillColor(textDark).fontSize(9).font('Helvetica-Bold').text(booking.providerId?.name || 'Authorized Field Operator', 80, sigY + 55);
  doc.fillColor('#6B7280').fontSize(8).font('Helvetica').text('Certified Service Provider', 80, sigY + 68);

  // Digital Platform Stamp
  doc.rect(260, sigY + 10, 80, 50).strokeColor(primaryGreen).lineWidth(1.5).stroke();
  doc.fillColor(primaryGreen).fontSize(7).font('Helvetica-Bold').text('PROFARMER', 265, sigY + 20, { align: 'center', width: 70 });
  doc.text('DIGITALLY', 265, sigY + 30, { align: 'center', width: 70 });
  doc.text('AUTHENTICATED', 265, sigY + 40, { align: 'center', width: 70 });

  // Farmer Acknowledgement
  doc.strokeColor('#9CA3AF').lineWidth(1).moveTo(380, sigY + 50).lineTo(520, sigY + 50).stroke();
  doc.fillColor(textDark).fontSize(9).font('Helvetica-Bold').text(booking.farmerId?.name || 'Farmer Signatory', 380, sigY + 55);
  doc.fillColor('#6B7280').fontSize(8).font('Helvetica').text('OTP-Verified Beneficiary', 380, sigY + 68);

  // Footer
  doc.fillColor('#6B7280').fontSize(8).font('Helvetica').text('This certificate serves as official proof of service delivery for agricultural subsidy claims, crop insurance validation, and platform warranty.', 55, 740, { align: 'center', width: 485 });

  doc.end();
};

module.exports = {
  generateInvoicePDF,
  generateWorkCertificatePDF,
};
