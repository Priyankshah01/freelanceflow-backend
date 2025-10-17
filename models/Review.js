const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  project:    { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  reviewer:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewee:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating:     { type: Number, required: true, min: 1, max: 5 },
  headline:   { type: String, maxlength: 120 },
  comment:    { type: String, maxlength: 2000 },
  // prevent duplicate review per project and reviewer->reviewee pair
}, { timestamps: true });

reviewSchema.index({ project: 1, reviewer: 1, reviewee: 1 }, { unique: true });
reviewSchema.index({ reviewee: 1, createdAt: -1 });
reviewSchema.index({ rating: -1 });

module.exports = mongoose.model('Review', reviewSchema);
