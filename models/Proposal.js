// models/Proposal.js
const mongoose = require('mongoose');

const { Schema } = mongoose;

/* -------- Subschemas -------- */
const MilestoneSchema = new Schema(
  {
    description: { type: String, trim: true },
    amount: { type: Number, min: [0, 'Milestone amount cannot be negative'] },
    dueDate: { type: Date }
  },
  { _id: false }
);

const AttachmentSchema = new Schema(
  {
    filename: { type: String, trim: true },
    url: {
      type: String,
      trim: true
      // match: [/^https?:\/\/.+/i, 'Attachment URL must start with http(s)://']
    },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const QuestionSchema = new Schema(
  {
    question: { type: String, trim: true },
    answer: { type: String, trim: true }
  },
  { _id: false }
);

/* -------- Main schema -------- */
const proposalSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    freelancer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    coverLetter: {
      type: String,
      required: [true, 'Cover letter is required'],
      maxlength: [1500, 'Cover letter cannot exceed 1500 characters'],
      trim: true
    },
    bidAmount: {
      type: Number,
      required: [true, 'Bid amount is required'],
      min: [1, 'Bid amount must be positive']
    },
    timeline: { type: String, required: [true, 'Timeline is required'], trim: true },
    milestones: [MilestoneSchema],
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'withdrawn'],
      default: 'pending'
      // ❌ removed: index: true (duplicate with schema.index below)
    },
    attachments: [AttachmentSchema],
    questions: [QuestionSchema],
    submittedAt: { type: Date, default: Date.now },
    respondedAt: Date,
    clientResponse: { type: String, trim: true }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, getters: true },
    toObject: { virtuals: true, getters: true }
  }
);

/* -------- Indexes -------- */
proposalSchema.index({ project: 1 });
proposalSchema.index({ freelancer: 1 });
proposalSchema.index({ status: 1 });          // ✅ keep this one
proposalSchema.index({ createdAt: -1 });
proposalSchema.index({ project: 1, freelancer: 1 }, { unique: true }); // prevents duplicates

/* -------- Virtuals -------- */
proposalSchema.virtual('timeAgo').get(function () {
  const submitted = this.submittedAt ? new Date(this.submittedAt) : null;
  if (!submitted) return null;
  const diffMs = Date.now() - submitted.getTime();
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (sec < 60) return `${sec}s ago`;
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  return `${day}d ago`;
});

proposalSchema.virtual('milestonesTotal').get(function () {
  if (!Array.isArray(this.milestones)) return 0;
  return this.milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
});

/* -------- Hooks -------- */
proposalSchema.pre('save', function (next) {
  if (!this.submittedAt) this.submittedAt = new Date();
  next();
});

/* -------- Output transform -------- */
function baseTransform(doc, ret) {
  ret.id = ret._id;
  delete ret._id;
  delete ret.__v;
  return ret;
}

proposalSchema.set('toJSON', { virtuals: true, getters: true, transform: baseTransform });
proposalSchema.set('toObject', { virtuals: true, getters: true, transform: baseTransform });

/* -------- Model -------- */
const Proposal = mongoose.models.Proposal || mongoose.model('Proposal', proposalSchema);
module.exports = Proposal;
