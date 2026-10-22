const jwt = require('jsonwebtoken');

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      name: user.name,
      phone: user.phone,
      email: user.email,
    },
    process.env.JWT_SECRET || 'profarmer_super_secure_jwt_secret_key_2026_rural_saas',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '30d',
    }
  );
};

module.exports = generateToken;
