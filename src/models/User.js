const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ['farmer', 'agent', 'provider', 'admin'],
      required: [true, 'Role is required'],
      default: 'farmer',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'pending_verification', 'suspended', 'rejected', 'action_needed'],
      default: 'pending_verification',
      index: true,
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    preferredLanguage: {
      type: String,
      default: 'en',
    },
    fcmTokens: [
      {
        token: String,
        platform: { type: String, enum: ['android', 'ios', 'web'] },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
