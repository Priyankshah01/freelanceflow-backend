// controllers/projectController.js
const mongoose = require('mongoose');
const Project = require('../models/Project');
const User = require('../models/User');

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const buildError = (message, status = 400) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const handleError = (res, e) => {
  const status = e?.status || 500;
  return res.status(status).json({ message: e?.message || 'Server error' });
};

const buildPagination = (req) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// Sort names the frontend sends → Mongo sort strings. Anything else uses newest first.
const SORT_OPTIONS = {
  newest: '-createdAt',
  oldest: 'createdAt',
  budget_high: '-budget.amount',
  budget_low: 'budget.amount',
  '-createdAt': '-createdAt',
  createdAt: 'createdAt',
};

/* =========================================================
 * GET /api/projects
 * =======================================================*/
const getProjects = async (req, res) => {
  try {
    const authUserId = req.user?._id;
    const role = req.user?.role;

    const {
      category,
      skills,
      status,
      mine,
      sort,
      budget_type,
      experience_level,
      project_size,
      timeline,
    } = req.query;
    // `search` is what the job board sends; `q` is kept for older callers
    const q = String(req.query.q || req.query.search || '');

    const { page, limit, skip } = buildPagination(req);
    const sortBy = SORT_OPTIONS[sort] || '-createdAt';

    const filter = {};

    if (q.trim()) {
      filter.$text = { $search: q.trim() };
    }

    if (category) filter.category = category;
    if (budget_type) filter['budget.type'] = budget_type;
    if (experience_level) filter.experienceLevel = experience_level;
    if (project_size) filter.projectSize = project_size;
    if (timeline) filter['timeline.duration'] = timeline;

    if (skills) {
      const arr = String(skills)
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (arr.length) filter.skills = { $in: arr };
    }

    if (status) filter.status = status;

    if (mine && authUserId) {
      if (mine === 'client') filter.client = authUserId;
      if (mine === 'freelancer') filter.freelancer = authUserId;
    } else if (!filter.status) {
      // the public job board only lists open projects
      filter.status = 'open';
    }

    const [items, total] = await Promise.all([
      Project.find(filter)
        .sort(sortBy)
        .skip(skip)
        .limit(limit)
        .populate('client', 'name email')
        .populate('freelancer', 'name email'),
      Project.countDocuments(filter),
    ]);

    return res.json({
      message: 'OK',
      data: { projects: items },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    return handleError(res, e);
  }
};

/* =========================================================
 * GET /api/projects/categories
 * =======================================================*/
const getCategories = async (_req, res) => {
  try {
    const STATIC = [
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
    ];
    const rows = await Project.aggregate([
      { $match: { category: { $in: STATIC } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(rows.map((r) => [r._id, r.count]));
    const categories = STATIC.map((c) => ({
      category: c,
      count: countMap[c] || 0,
    }));

    return res.json({ message: 'OK', data: { categories } });
  } catch (e) {
    return handleError(res, e);
  }
};

/* =========================================================
 * GET /api/projects/:id
 * =======================================================*/
const getProject = async (req, res) => {
  try {
    const userId = req.user?._id;
    const role = req.user?.role;
    const { id } = req.params;
    if (!isValidId(id)) throw buildError('Invalid project id', 400);

    const project = await Project.findById(id)
      .populate('client', 'name email')
      .populate('freelancer', 'name email');

    if (!project) throw buildError('Project not found', 404);

    if (!userId) {
      if (project.status !== 'open') throw buildError('Forbidden', 403);
    } else if (role !== 'admin') {
      const isClient =
        String(project.client) === String(userId) ||
        String(project.client?._id) === String(userId);
      const isAssignedFreelancer =
        String(project.freelancer) === String(userId) ||
        String(project.freelancer?._id) === String(userId);

      if (!isClient && !isAssignedFreelancer && project.status !== 'open') {
        throw buildError('Forbidden', 403);
      }
    }

    return res.json({ message: 'OK', data: { project } });
  } catch (e) {
    return handleError(res, e);
  }
};

/* =========================================================
 * POST /api/projects  (Client only)
 * =======================================================*/
const createProject = async (req, res) => {
  try {
    const userId = req.user?._id;
    const role = req.user?.role;
    if (!userId) throw buildError('Unauthorized', 401);
    if (role !== 'client' && role !== 'admin') throw buildError('Forbidden', 403);

    const payload = {
      ...req.body,
      client: role === 'admin' && req.body.client ? req.body.client : userId,
    };

    const project = await Project.create(payload);

    return res.status(201).json({
      message: 'Project created',
      data: { project },
    });
  } catch (e) {
    return handleError(res, e);
  }
};

/* =========================================================
 * PUT /api/projects/:id  (Owner client or admin)
 * =======================================================*/
const updateProject = async (req, res) => {
  try {
    const userId = req.user?._id;
    const role = req.user?.role;
    if (!userId) throw buildError('Unauthorized', 401);

    const { id } = req.params;
    if (!isValidId(id)) throw buildError('Invalid project id', 400);

    const project = await Project.findById(id);
    if (!project) throw buildError('Project not found', 404);

    const isOwner = String(project.client) === String(userId);
    if (!isOwner && role !== 'admin') throw buildError('Forbidden', 403);

    const update = { ...req.body };
    if (role !== 'admin') {
      delete update.client;
    }

    Object.assign(project, update);
    await project.save();

    const populated = await Project.findById(project._id)
      .populate('client', 'name email')
      .populate('freelancer', 'name email');

    return res.json({
      message: 'Project updated',
      data: { project: populated },
    });
  } catch (e) {
    return handleError(res, e);
  }
};

/* =========================================================
 * PATCH /api/projects/:id/status  (Owner client or admin)
 * 👈 THIS is what your frontend is calling
 * =======================================================*/
const updateProjectStatus = async (req, res) => {
  try {
    const userId = req.user?._id;
    const role = req.user?.role;
    if (!userId) throw buildError('Unauthorized', 401);

    const { id } = req.params;
    if (!isValidId(id)) throw buildError('Invalid project id', 400);

    const { status } = req.body || {};
    if (!status) throw buildError('Status is required', 400);

    const project = await Project.findById(id);
    if (!project) throw buildError('Project not found', 404);

    const isOwner = String(project.client) === String(userId);
    if (!isOwner && role !== 'admin') throw buildError('Forbidden', 403);

    // optionally: validate allowed statuses
    const allowed = ['open', 'in-progress', 'completed', 'cancelled', 'dispute'];
    if (!allowed.includes(status)) {
      throw buildError('Invalid status value', 400);
    }

    project.status = status;
    await project.save();

    const populated = await Project.findById(project._id)
      .populate('client', 'name email')
      .populate('freelancer', 'name email');

    return res.json({
      message: 'Status updated',
      data: { project: populated },
    });
  } catch (e) {
    return handleError(res, e);
  }
};

/* =========================================================
 * DELETE /api/projects/:id
 * =======================================================*/
const deleteProject = async (req, res) => {
  try {
    const userId = req.user?._id;
    const role = req.user?.role;
    if (!userId) throw buildError('Unauthorized', 401);

    const { id } = req.params;
    if (!isValidId(id)) throw buildError('Invalid project id', 400);

    const project = await Project.findById(id);
    if (!project) throw buildError('Project not found', 404);

    const isOwner = String(project.client) === String(userId);
    if (!isOwner && role !== 'admin') throw buildError('Forbidden', 403);

    await project.deleteOne();
    return res.json({ message: 'Project deleted', data: { id } });
  } catch (e) {
    return handleError(res, e);
  }
};

/* =========================================================
 * POST /api/projects/:id/invite
 * =======================================================*/
const inviteFreelancer = async (req, res) => {
  try {
    const userId = req.user?._id;
    const role = req.user?.role;
    if (!userId) throw buildError('Unauthorized', 401);

    const { id } = req.params;
    const { freelancerId, note } = req.body || {};

    if (!isValidId(id)) throw buildError('Invalid project id', 400);
    if (!isValidId(freelancerId)) throw buildError('Invalid freelancer id', 400);

    const project = await Project.findById(id);
    if (!project) throw buildError('Project not found', 404);

    const isOwner = String(project.client) === String(userId);
    if (!isOwner && role !== 'admin') throw buildError('Forbidden: not your project', 403);

    if (project.status !== 'open') {
      throw buildError('You can only invite freelancers to open projects', 400);
    }

    const freelancer = await User.findById(freelancerId).select('role name');
    if (!freelancer) throw buildError('Freelancer not found', 404);
    if (freelancer.role !== 'freelancer') {
      throw buildError('Selected user is not a freelancer', 400);
    }

    const alreadyInvited = (project.invitedFreelancers || []).some(
      (i) => String(i.user) === String(freelancerId)
    );
    if (alreadyInvited) {
      return res
        .status(409)
        .json({ message: 'Freelancer already invited to this project' });
    }

    project.invitedFreelancers = project.invitedFreelancers || [];
    project.invitedFreelancers.push({
      user: freelancerId,
      note: note ? String(note).trim() : '',
    });

    await project.save();

    return res.status(201).json({
      message: 'Invite sent',
      data: {
        projectId: String(project._id),
        invited: {
          user: String(freelancerId),
          note: note || '',
          invitedAt: new Date().toISOString(),
        },
      },
    });
  } catch (e) {
    return handleError(res, e);
  }
};

/* =========================================================
 * Exports
 * =======================================================*/
module.exports = {
  getProjects,
  getCategories,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  inviteFreelancer,
  // 👇 NEW
  updateProjectStatus,
  // aliases
  listProjectsForUser: getProjects,
  getProjectById: getProject,
};
