/**
 * Standard Phone Number Normalization Utility
 * Normalizes Indian and International numbers to standard +91XXXXXXXXXX format
 */

function normalizePhone(phone) {
  if (!phone) return '';
  let clean = String(phone).trim().replace(/[^\d+]/g, '');
  
  if (clean.startsWith('+91')) {
    return clean;
  }
  if (clean.startsWith('91') && clean.length === 12) {
    return `+${clean}`;
  }
  if (clean.startsWith('+')) {
    return clean;
  }
  clean = clean.replace(/^0+/, '');
  if (clean.length === 10) {
    return `+91${clean}`;
  }
  return clean.startsWith('+') ? clean : `+91${clean}`;
}

function getPhoneVariants(phone) {
  if (!phone) return [];
  const normalized = normalizePhone(phone);
  const raw10 = normalized.replace(/^\+91/, '').replace(/^\+/, '');
  return Array.from(
    new Set([
      normalized,
      raw10,
      `91${raw10}`,
      `0${raw10}`,
      `+91 ${raw10}`,
      phone.trim(),
    ])
  );
}

module.exports = {
  normalizePhone,
  getPhoneVariants,
};
