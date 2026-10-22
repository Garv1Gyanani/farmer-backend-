const nodemailer = require('nodemailer');

const SMTP_USER = process.env.SMTP_USER || 'garvdivanextechnologies@gmail.com';
const SMTP_PASS = process.env.SMTP_PASS || 'jdvwevaihxoxlwpe';

// Transporter configuration using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

/**
 * Sends real OTP email via Gmail SMTP
 */
const sendOtpEmail = async (toEmail, otpCode, name = 'Farmer') => {
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background-color: #f6fbf1; border-radius: 16px; border: 1px solid #c0eac2;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #02200c; margin: 0; font-size: 26px;">🌱 ProFarmer</h2>
        <p style="color: #426747; font-size: 13px; font-weight: 600; margin-top: 4px;">RURAL AGRICULTURAL MARKETPLACE</p>
      </div>
      <div style="background-color: #ffffff; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <h3 style="color: #17351f; margin-top: 0;">Verification Passcode</h3>
        <p style="color: #424842; font-size: 14px; line-height: 1.5;">Hello ${name},</p>
        <p style="color: #424842; font-size: 14px; line-height: 1.5;">Use the single-use passcode below to confirm your identity on ProFarmer:</p>
        
        <div style="text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #02200c; background-color: #f1f5eb; padding: 12px 24px; border-radius: 8px; border: 1px dashed #426747; display: inline-block;">
            ${otpCode}
          </span>
        </div>

        <p style="color: #727971; font-size: 12px; margin-bottom: 0;">This passcode is valid for 10 minutes. Do not share this code with anyone for safety.</p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #727971; font-size: 11px;">
        <p>© 2026 ProFarmer AgriTech Platform • Secured with SSL & TLS Encryption</p>
      </div>
    </div>
  `;

  const mailOptions = {
    from: `"ProFarmer Support" <${SMTP_USER}>`,
    to: toEmail,
    subject: `Your ProFarmer Verification Passcode: ${otpCode}`,
    html: htmlContent,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = {
  sendOtpEmail,
};
