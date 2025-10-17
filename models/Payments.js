const mongoose = require('mongoose');

/**
 * We track both platform-side payment doc and Stripe fields needed for idempotency.
 */
const paymentSchema = new mongoose.Schema({
  project:     { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  payer:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },   // usually client
  payee:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },   // usually freelancer

  amount:      { type: Number, required: true, min: 0 },
  currency:    { type: String, default: 'usd', uppercase: true },

  type:        { type: String, enum: ['milestone', 'escrow', 'release', 'refund'], required: true },
  milestoneId: { type: String, default: null },

  // Stripe bookkeeping
  provider:    { type: String, enum: ['stripe'], default: 'stripe' },
  stripePaymentIntentId: { type: String, index: true },
  stripeChargeId:        { type: String, index: true },
  stripeRefundId:        { type: String, index: true },

  status:      { type: String, enum: ['pending', 'requires_action', 'succeeded', 'failed', 'refunded'], default: 'pending' },
  failureReason: { type: String, default: null },

  meta: { type: Map, of: String } // arbitrary key-value (ip, ua, etc.)
}, { timestamps: true });

paymentSchema.index({ project: 1, createdAt: -1 });
paymentSchema.index({ payer: 1, createdAt: -1 });
paymentSchema.index({ payee: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
