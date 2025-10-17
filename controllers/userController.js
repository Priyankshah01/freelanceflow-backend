// controllers/userController.js
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const User = require('../models/User');

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const parseCSV = (val) =>
  String(val || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

/* =========================
   LIST / FIND USERS (NEW)
   ========================= */

/**
 * GET /api/users
 * Auth required (so we can show more in the future if desired)
 * Query params:
 *  - role: 'freelancer' | 'client' | 'admin'
 *  - q: free text across name/email/profile.title/profile.bio
 *  - skills: CSV (e.g. "React,Node")
 *  - minRate, maxRate: hourly range
 *  - location: substring match on profile.location
 *  - availability: 'available' | 'busy' | 'away'
 *  - sort: 'best' | '-ratings.average' | 'ratings.average' | '-earnings.total' |
 *          'profile.hourlyRate' | '-profile.hourlyRate' | (any raw field or -field)
 *  - page, limit
 */
exports.listUsers = async (req, res) => {
  try {
    const {
      role,
      q,
      skills,
      minRate,
      maxRate,
      location,
      availability,
      sort = 'best',
      page = 1,
      limit = 12
    } = req.query;

    const pageNum = Math.max(1, Number(page) || 1);
    const lim = Math.min(100, Math.max(1, Number(limit) || 12));
    const skip = (pageNum - 1) * lim;

    const filter = {};
    if (role) filter.role = role;

    if (q) {
      const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { name: rx },
        { email: rx },
        { 'profile.title': rx },
        { 'profile.bio': rx }
      ];
    }

    const skillArr = parseCSV(skills);
    if (skillArr.length) {
      filter['profile.skills'] = { $in: skillArr };
    }

    const min = minRate !== undefined && minRate !== '' ? Number(minRate) : undefined;
    const max = maxRate !== undefined && maxRate !== '' ? Number(maxRate) : undefined;
    if (Number.isFinite(min) || Number.isFinite(max)) {
      filter['profile.hourlyRate'] = {};
      if (Number.isFinite(min)) filter['profile.hourlyRate'].$gte = min;
      if (Number.isFinite(max)) filter['profile.hourlyRate'].$lte = max;
    }

    if (availability) {
      filter['profile.availability'] = availability;
    }

    if (location) {
      const rxLoc = new RegExp(String(location).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter['profile.location'] = rxLoc;
    }

    // Sorting
    let sortBy = {};
    switch (sort) {
      case 'best':
        sortBy = { 'ratings.average': -1, 'earnings.total': -1, createdAt: -1 };
        break;
      case '-ratings.average':
        sortBy = { 'ratings.average': -1 };
        break;
      case 'ratings.average':
        sortBy = { 'ratings.average': 1 };
        break;
      case '-earnings.total':
        sortBy = { 'earnings.total': -1 };
        break;
      case 'profile.hourlyRate':
        sortBy = { 'profile.hourlyRate': 1 };
        break;
      case '-profile.hourlyRate':
        sortBy = { 'profile.hourlyRate': -1 };
        break;
      default: {
        const s = String(sort);
        if (s.startsWith('-')) sortBy[s.slice(1)] = -1;
        else sortBy[s] = 1;
      }
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -resetToken -resetTokenExp')
        .sort(sortBy)
        .skip(skip)
        .limit(lim),
      User.countDocuments(filter)
    ]);

    return res.json({
      message: 'OK',
      data: { users },
      pagination: {
        page: pageNum,
        limit: lim,
        total,
        totalPages: Math.ceil(total / lim)
      }
    });
  } catch (e) {
    console.error('listUsers error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /api/users/:id
 * Private (authenticated) – richer than public profile if you want
 */
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid user id' });

    const user = await User.findById(id).select('-password -resetToken -resetTokenExp');
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.json({ message: 'OK', data: { user } });
  } catch (e) {
    console.error('getUserById error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* =========================
   YOUR EXISTING HANDLERS
   ========================= */

// @desc    Get user profile (self)
// @route   GET /api/users/profile
// @access  Private
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');

    res.status(200).json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile'
    });
  }
};

// @desc    Update user profile (self)
// @route   PUT /api/users/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user._id;
    const updateData = { ...req.body };

    // Prevent sensitive updates
    delete updateData.password;
    delete updateData.email;
    delete updateData.role;
    delete updateData.earnings;
    delete updateData.ratings;

    if (updateData.profile) {
      const user = await User.findById(userId);
      updateData.profile = {
        ...(user.profile ? user.profile.toObject() : {}),
        ...updateData.profile
      };
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    console.error('Update profile error:', error);

    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error updating profile'
    });
  }
};

// @desc    Update user avatar (self)
// @route   PUT /api/users/avatar
// @access  Private
exports.updateAvatar = async (req, res) => {
  try {
    const { avatar } = req.body;

    if (!avatar) {
      return res.status(400).json({
        success: false,
        message: 'Avatar URL is required'
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { avatar },
      { new: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'Avatar updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    console.error('Update avatar error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating avatar'
    });
  }
};

// @desc    Add skill (freelancer only)
// @route   POST /api/users/skills
// @access  Private
exports.addSkill = async (req, res) => {
  try {
    const { skill } = req.body;
    if (!skill || typeof skill !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid skill name is required' });
    }

    const user = await User.findById(req.user._id);
    if (user.role !== 'freelancer') {
      return res.status(403).json({ success: false, message: 'Only freelancers can add skills' });
    }

    if (!user.profile.skills) user.profile.skills = [];

    const skillLower = skill.toLowerCase().trim();
    const exists = user.profile.skills.find(s => s.toLowerCase() === skillLower);
    if (exists) {
      return res.status(400).json({ success: false, message: 'Skill already exists' });
    }

    user.profile.skills.push(skill.trim());
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Skill added successfully',
      data: { skills: user.profile.skills, user }
    });
  } catch (error) {
    console.error('Add skill error:', error);
    res.status(500).json({ success: false, message: 'Server error adding skill' });
  }
};

// @desc    Remove skill (freelancer only)
// @route   DELETE /api/users/skills/:skill
// @access  Private
exports.removeSkill = async (req, res) => {
  try {
    const { skill } = req.params;
    const user = await User.findById(req.user._id);

    if (user.role !== 'freelancer') {
      return res.status(403).json({ success: false, message: 'Only freelancers can remove skills' });
    }
    if (!user.profile.skills || user.profile.skills.length === 0) {
      return res.status(400).json({ success: false, message: 'No skills to remove' });
    }

    const skillLower = skill.toLowerCase();
    user.profile.skills = user.profile.skills.filter(s => s.toLowerCase() !== skillLower);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Skill removed successfully',
      data: { skills: user.profile.skills, user }
    });
  } catch (error) {
    console.error('Remove skill error:', error);
    res.status(500).json({ success: false, message: 'Server error removing skill' });
  }
};

// @desc    Add portfolio item (freelancer only)
// @route   POST /api/users/portfolio
// @access  Private
exports.addPortfolioItem = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { title, description, imageUrl, projectUrl, technologies } = req.body;

    const user = await User.findById(req.user._id);
    if (user.role !== 'freelancer') {
      return res.status(403).json({ success: false, message: 'Only freelancers can add portfolio items' });
    }

    const portfolioItem = {
      title: title.trim(),
      description: description.trim(),
      imageUrl: imageUrl || null,
      projectUrl: projectUrl || null,
      technologies: Array.isArray(technologies) ? technologies : []
    };

    if (!user.profile.portfolio) user.profile.portfolio = [];
    user.profile.portfolio.push(portfolioItem);
    await user.save();

    res.status(201).json({
      success: true,
      message: 'Portfolio item added successfully',
      data: { portfolio: user.profile.portfolio, user }
    });
  } catch (error) {
    console.error('Add portfolio error:', error);
    res.status(500).json({ success: false, message: 'Server error adding portfolio item' });
  }
};

// @desc    Remove portfolio item (freelancer only)
// @route   DELETE /api/users/portfolio/:index
// @access  Private
exports.removePortfolioItem = async (req, res) => {
  try {
    const { index } = req.params;
    const portfolioIndex = parseInt(index, 10);

    if (isNaN(portfolioIndex) || portfolioIndex < 0) {
      return res.status(400).json({ success: false, message: 'Invalid portfolio index' });
    }

    const user = await User.findById(req.user._id);
    if (user.role !== 'freelancer') {
      return res.status(403).json({ success: false, message: 'Only freelancers can remove portfolio items' });
    }

    if (!user.profile.portfolio || portfolioIndex >= user.profile.portfolio.length) {
      return res.status(400).json({ success: false, message: 'Portfolio item not found' });
    }

    user.profile.portfolio.splice(portfolioIndex, 1);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Portfolio item removed successfully',
      data: { portfolio: user.profile.portfolio, user }
    });
  } catch (error) {
    console.error('Remove portfolio error:', error);
    res.status(500).json({ success: false, message: 'Server error removing portfolio item' });
  }
};

// @desc    Get public user profile (safe fields)
// @route   GET /api/users/public/:id
// @access  Public
exports.getPublicProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -email -earnings -emailVerificationToken -passwordResetToken');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, data: { user } });
  } catch (error) {
    console.error('Get public profile error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(500).json({ success: false, message: 'Server error fetching profile' });
  }
};
