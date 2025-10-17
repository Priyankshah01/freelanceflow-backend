// models/Project.js
const mongoose = require('mongoose');

const { Schema } = mongoose;

const projectSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Project title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Project description is required'],
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    client: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    /**
     * Canonical DB field for the assigned freelancer.
     * We also expose a virtual alias "assignedFreelancer" that maps to this field.
     */
    freelancer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // NEW: list of invitations sent by the client
    invitedFreelancers: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        note: { type: String, trim: true, maxlength: 1000 },
        invitedAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],

    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: [
        'web-development',
        'mobile-development',
        'ui-ux-design',
        'graphic-design',
        'content-writing',
        'digital-marketing',
        'data-science',
        'devops',
        'blockchain',
        'ai-ml',
        'consulting',
        'other',
      ],
    },

    subcategory: {
      type: String,
      required: false,
    },

    skills: [
      {
        type: String,
        required: true,
      },
    ],

    budget: {
      type: {
        type: String,
        enum: ['fixed', 'hourly'],
        required: true,
      },
      amount: {
        type: Number,
        required: function () {
          return this.budget.type === 'fixed';
        },
        min: [5, 'Budget must be at least $5'],
      },
      hourlyRate: {
        min: {
          type: Number,
          required: function () {
            return this.budget.type === 'hourly';
          },
        },
        max: {
          type: Number,
          required: function () {
            return this.budget.type === 'hourly';
          },
        },
      },
    },

    timeline: {
      duration: {
        type: String,
        enum: ['less-than-1-month', '1-3-months', '3-6-months', 'more-than-6-months'],
        required: true,
      },
      startDate: {
        type: Date,
        default: Date.now,
      },
      endDate: {
        type: Date,
      },
    },

    experienceLevel: {
      type: String,
      enum: ['entry', 'intermediate', 'expert'],
      required: true,
    },

    projectSize: {
      type: String,
      enum: ['small', 'medium', 'large'],
      required: true,
    },

    status: {
      type: String,
      enum: ['draft', 'open', 'in-progress', 'completed', 'cancelled', 'dispute'],
      default: 'open',
    },

    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },

    attachments: [
      {
        filename: String,
        url: String,
        size: Number,
        uploadedAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],

    requirements: {
      type: [String],
      default: [],
    },

    deliverables: {
      type: [String],
      default: [],
    },

    proposalCount: {
      type: Number,
      default: 0,
    },

    viewCount: {
      type: Number,
      default: 0,
    },

    applicationDeadline: {
      type: Date,
    },

    isUrgent: {
      type: Boolean,
      default: false,
    },

    isRemote: {
      type: Boolean,
      default: true,
    },

    location: {
      type: String,
      default: 'Remote',
    },

    milestones: [
      {
        title: String,
        description: String,
        amount: Number,
        dueDate: Date,
        status: {
          type: String,
          enum: ['pending', 'in-progress', 'completed', 'approved'],
          default: 'pending',
        },
      },
    ],

    tags: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],

    featured: {
      type: Boolean,
      default: false,
    },

    workCompleted: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* --------------------------- Indexes --------------------------- */
projectSchema.index({ client: 1 });
projectSchema.index({ freelancer: 1 });
projectSchema.index({ category: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ createdAt: -1 });
projectSchema.index({ 'budget.amount': 1 });
projectSchema.index({ 'budget.hourlyRate.min': 1, 'budget.hourlyRate.max': 1 });
projectSchema.index({ skills: 1 });
projectSchema.index({ featured: -1, createdAt: -1 });
projectSchema.index({ experienceLevel: 1 });
projectSchema.index({ projectSize: 1 });
projectSchema.index({ isUrgent: -1, createdAt: -1 });
projectSchema.index({ 'invitedFreelancers.user': 1 }); // NEW index

/* ----------------------- Text Index for search ----------------------- */
projectSchema.index({
  title: 'text',
  description: 'text',
  skills: 'text',
  tags: 'text',
});

/* ---------------------------- Virtuals ---------------------------- */
// Budget display
projectSchema.virtual('budgetDisplay').get(function () {
  if (this.budget.type === 'fixed') {
    return `$${this.budget.amount}`;
  } else {
    return `$${this.budget.hourlyRate.min}-$${this.budget.hourlyRate.max}/hr`;
  }
});

// Human-readable time since posted
projectSchema.virtual('timeAgo').get(function () {
  const now = new Date();
  const posted = new Date(this.createdAt);
  const diffTime = Math.abs(now - posted);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffTime / (1000 * 60));

  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
});

/**
 * Virtual alias:
 * assignedFreelancer <-> freelancer
 */
projectSchema
  .virtual('assignedFreelancer')
  .get(function () {
    return this.freelancer;
  })
  .set(function (val) {
    this.freelancer = val;
  });

/* ----------------------------- Hooks ----------------------------- */
projectSchema.pre('save', function (next) {
  // keep for future logic if you want to auto-maintain proposalCount
  next();
});

/* ----------------------------- Statics ----------------------------- */
projectSchema.statics.findBySkills = function (skills) {
  return this.find({
    status: 'open',
    skills: { $in: skills },
  }).sort({ createdAt: -1 });
};

projectSchema.statics.findFeatured = function () {
  return this.find({
    status: 'open',
    featured: true,
  })
    .sort({ createdAt: -1 })
    .limit(10);
};

/* ---------------------------- Methods ---------------------------- */
projectSchema.methods.isActive = function () {
  return this.status === 'open' || this.status === 'in-progress';
};

projectSchema.methods.incrementViews = function () {
  this.viewCount += 1;
  return this.save();
};

module.exports = mongoose.model('Project', projectSchema);
