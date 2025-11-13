const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },

  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email']
  },

  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },

  role: {
    type: String,
    enum: ['client', 'freelancer', 'admin'],
    required: [true, 'Role is required']
  },

  // ✅ NEW FIELD → REQUIRED FOR ADMIN PANEL
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active'
  },

  avatar: {
    type: String,
    default: null
  },

  profile: {
    skills: {
      type: [String],
      default: []
    },
    hourlyRate: {
      type: Number,
      min: [1, 'Hourly rate must be positive']
    },
    bio: {
      type: String,
      maxlength: [1000, 'Bio cannot exceed 1000 characters']
    },
    portfolio: [{
      title: String,
      description: String,
      imageUrl: String,
      projectUrl: String,
      technologies: [String]
    }],
    availability: {
      type: String,
      enum: ['available', 'busy', 'unavailable'],
      default: 'available'
    },

    // Client fields
    company: String,
    website: String,
    companySize: {
      type: String,
      enum: ['1-10', '11-50', '51-200', '201-500', '500+']
    },
    industry: String,

    // Common
    location: String,
    timezone: String,
    phone: String,
    languages: [{
      language: String,
      proficiency: {
        type: String,
        enum: ['basic', 'intermediate', 'advanced', 'native']
      }
    }]
  },

  ratings: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0,
      min: 0
    }
  },

  earnings: {
    total: {
      type: Number,
      default: 0,
      min: 0
    },
    pending: {
      type: Number,
      default: 0,
      min: 0
    },
    available: {
      type: Number,
      default: 0,
      min: 0
    }
  },

  isVerified: {
    type: Boolean,
    default: false
  },

  isActive: {
    type: Boolean,
    default: true
  },

  lastActive: {
    type: Date,
    default: Date.now
  },

  emailVerificationToken: String,
  emailVerifiedAt: Date,

  passwordResetToken: String,
  passwordResetExpires: Date,

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
userSchema.index({ role: 1 });
userSchema.index({ 'ratings.average': -1 });
userSchema.index({ 'profile.skills': 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// Virtual: profile completeness
userSchema.virtual('profileCompleteness').get(function() {
  let completeness = 30;

  if (this.avatar) completeness += 10;
  if (this.profile.bio) completeness += 10;
  if (this.profile.location) completeness += 10;

  if (this.role === 'freelancer') {
    if (this.profile.skills?.length > 0) completeness += 20;
    if (this.profile.hourlyRate) completeness += 10;
    if (this.profile.portfolio?.length > 0) completeness += 10;
  } else if (this.role === 'client') {
    if (this.profile.company) completeness += 20;
    if (this.profile.industry) completeness += 10;
    if (this.profile.companySize) completeness += 10;
  }

  return Math.min(completeness, 100);
});

// Password hashing
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Update rating
userSchema.methods.updateRating = function(newRating) {
  const currentTotal = this.ratings.average * this.ratings.count;
  this.ratings.count += 1;
  this.ratings.average = (currentTotal + newRating) / this.ratings.count;
  return this.save();
};

// Profile completeness check
userSchema.methods.isProfileComplete = function() {
  if (!this.profile.bio || !this.profile.location) return false;

  if (this.role === 'freelancer') {
    return (
      this.profile.skills?.length > 0 &&
      this.profile.hourlyRate
    );
  } else if (this.role === 'client') {
    return (
      this.profile.company &&
      this.profile.industry
    );
  }

  return true;
};

// Static: active users
userSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

// Static: freelancer skill search
userSchema.statics.findFreelancersBySkills = function(skills) {
  return this.find({
    role: 'freelancer',
    isActive: true,
    'profile.skills': { $in: skills }
  }).select('-password');
};

module.exports = mongoose.model('User', userSchema);
