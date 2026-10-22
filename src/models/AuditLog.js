const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    adminEmail: {
      type: String,
      default: '',
    },
    action: {
      type: String,
      required: true, // e.g. 'APPROVE_KYC', 'REJECT_KYC', 'APPROVE_PAYOUT', 'SUSPEND_USER', 'UPDATE_SERVICE'
      index: true,
    },
    targetType: {
      type: String,
      enum: ['farmer', 'agent', 'provider', 'booking', 'payout', 'service', 'system'],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
module.exports = AuditLog;
