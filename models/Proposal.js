// models/Proposal.js
const mongoose = require('mongoose');

/* --------------------------- Subdocument Schemas --------------------------- */

const MilestoneSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    amount: { type: Number, min: 0, required: true },
    dueDate: { type: Date }
  },
  { _id: false }
);

const AttachmentSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    url: { type: String, trim: true, required: true },
    size: { type: Number, min: 0 }
  },
  { _id: false }
);

const QuestionSchema = new mongoose.Schema(
  {
    prompt: { type: String, trim: true, required: true },
    answer: { type: String, trim: true }
  },
  { _id: false }
);

/* -------------------------------- Main Model ------------------------------ */

const ProposalSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true
    },
    freelancer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    coverLetter: { type: String, trim: true, required: true },
    bidAmount: { type: Number, min: 1, required: true },
    timeline: { type: String, trim: true, required: true },

    milestones: [MilestoneSchema],
    attachments: [AttachmentSchema],
    questions: [QuestionSchema],

    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'withdrawn'],
      default: 'pending',
      index: true
    },

    clientResponse: { type: String, trim: true },
    respondedAt: { type: Date }
  },
  { timestamps: true }
);

// Prevent duplicate freelancer applications to the same project
ProposalSchema.index({ project: 1, freelancer: 1 }, { unique: true });

/* ------------------------------- Export Model ------------------------------ */

module.exports =
  mongoose.models.Proposal || mongoose.model('Proposal', ProposalSchema);
