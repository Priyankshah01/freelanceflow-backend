// controllers/proposalController.js
const mongoose = require('mongoose');
const Proposal = require('../models/Proposal');
const Project = require('../models/Project');

/* ============================
   Helpers
   ============================ */

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const asNumber = (v) =>
  v === '' || v === null || v === undefined ? undefined : Number(v);

const buildError = (message, status = 400, errors = undefined) => {
  const err = new Error(message);
  err.status = status;
  if (errors) err.errors = errors;
  return err;
};

const handleControllerError = (res, e) => {
  // Duplicate key
  if (e && e.code === 11000) {
    return res.status(409).json({
      message: 'Duplicate proposal',
      errors: [
        {
          param: 'project',
          msg: 'You have already applied to this project'
        }
      ]
    });
  }
  // Mongoose validation
  if (e && e.name === 'ValidationError') {
    const errors = Object.keys(e.errors).map((k) => ({
      param: k,
      msg: e.errors[k].message
    }));
    return res.status(400).json({ message: 'Validation failed', errors });
  }
  const status = e?.status || 500;
  const payload = { message: e?.message || 'Server error' };
  if (e?.errors) payload.errors = e.errors;
  return res.status(status).json(payload);
};

const buildPagination = (req) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const canActAsClientOnProject = async (userId, projectId) => {
  if (!isValidId(projectId)) return false;
  const proj = await Project.findById(projectId).select('_id client');
  if (!proj) return false;
  return String(proj.client) === String(userId);
};

/* ============================
   Controllers
   ============================ */

/**
 * POST /api/proposals
 * Freelancer submits a proposal
 * body: { project, coverLetter, bidAmount, timeline, milestones?, attachments?, questions? }
 */
exports.createProposal = async (req, res) => {
  try {
    const userId = req.user?._id;
    const role = req.user?.role;
    if (!userId) throw buildError('Unauthorized', 401);
    if (role !== 'freelancer')
      throw buildError('Only freelancers can submit proposals', 403);

    const {
      project,
      coverLetter,
      bidAmount,
      timeline,
      milestones = [],
      attachments = [],
      questions = []
    } = req.body || {};

    if (!project || !isValidId(project))
      throw buildError('Valid project id is required', 400);
    if (!coverLetter || !String(coverLetter).trim())
      throw buildError('Cover letter is required', 400);
    const bid = asNumber(bidAmount);
    if (!Number.isFinite(bid) || bid < 1)
      throw buildError('Bid amount must be at least 1', 400);
    if (!timeline || !String(timeline).trim())
      throw buildError('Timeline is required', 400);

    // Ensure project exists (and optionally open)
    const proj = await Project.findById(project).select('_id status proposalCount');
    if (!proj) throw buildError('Project not found', 404);

    const proposal = await Proposal.create({
      project,
      freelancer: userId,
      coverLetter: String(coverLetter).trim(),
      bidAmount: bid,
      timeline: String(timeline).trim(),
      milestones,
      attachments,
      questions
    });

    // Optional: increment the project's proposalCount
    try {
      proj.proposalCount = (proj.proposalCount || 0) + 1;
      await proj.save();
    } catch (_) {
      // non-blocking
    }

    return res.status(201).json({
      message: 'Proposal submitted successfully',
      data: { proposal }
    });
  } catch (e) {
    return handleControllerError(res, e);
  }
};

/**
 * GET /api/proposals
 * Role-aware listing:
 *  - admin: all
 *  - client: proposals **to their projects** (filterable by project/status)
 *  - freelancer: their proposals
 * Query: project?, status?, page?, limit?, sort? (-createdAt by default)
 */
exports.getProposals = async (req, res) => {
  try {
    const userId = req.user?._id;
    const role = req.user?.role;
    if (!userId) throw buildError('Unauthorized', 401);

    const { project, status, sort } = req.query;
    const { page, limit, skip } = buildPagination(req);
    const sortBy = sort || '-createdAt';

    let filter = {};

    if (role === 'admin') {
      if (project && isValidId(project)) filter.project = project;
      if (status) filter.status = status;
    } else if (role === 'client') {
      // proposals to projects owned by client
      const q = {};
      if (status) q.status = status;
      if (project && isValidId(project)) {
        const ok = await canActAsClientOnProject(userId, project);
        if (!ok) throw buildError('Forbidden: not your project', 403);
        filter = { project, ...q };
      } else {
        const myProjects = await Project.find({ client: userId }).select('_id');
        filter = { project: { $in: myProjects.map((p) => p._id) }, ...q };
      }
    } else {
      // freelancer: only their proposals
      filter.freelancer = userId;
      if (project && isValidId(project)) filter.project = project;
      if (status) filter.status = status;
    }

    const [items, total] = await Promise.all([
      Proposal.find(filter)
        .sort(sortBy)
        .skip(skip)
        .limit(limit)
        // Note: Project uses "timeline" (not "duration"), include status/freelancer for dashboards
        .populate('project', 'title budget timeline client status freelancer')
        .populate('freelancer', 'name profile'),
      Proposal.countDocuments(filter)
    ]);

    return res.json({
      message: 'OK',
      data: { proposals: items },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (e) {
    return handleControllerError(res, e);
  }
};

/**
 * GET /api/proposals/:id
 * Access rules:
 *  - Admin can see any
 *  - Freelancer can see if they own it
 *  - Client can see if it belongs to their project
 */
exports.getProposalById = async (req, res) => {
  try {
    const userId = req.user?._id;
    const role = req.user?.role;
    if (!userId) throw buildError('Unauthorized', 401);

    const { id } = req.params;
    if (!isValidId(id)) throw buildError('Invalid proposal id', 400);

    const proposal = await Proposal.findById(id)
      .populate('project', 'title client')
      .populate('freelancer', 'name profile');
    if (!proposal) throw buildError('Proposal not found', 404);

    if (role !== 'admin') {
      const isOwner =
        String(proposal.freelancer?._id || proposal.freelancer) ===
        String(userId);
      const isClient = await canActAsClientOnProject(
        userId,
        proposal.project?._id || proposal.project
      );
      if (!isOwner && !isClient) throw buildError('Forbidden', 403);
    }

    return res.json({ message: 'OK', data: { proposal } });
  } catch (e) {
    return handleControllerError(res, e);
  }
};

/**
 * GET /api/proposals/mine
 * Current user's proposals
 * (freelancer: their own; client: proposals to their projects; admin: all)
 * Accepts same query params as getProposals
 */
exports.getMyProposals = async (req, res) => {
  return exports.getProposals(req, res);
};

/**
 * GET /api/proposals/mine-one?project=:projectId
 * Current freelancer's proposal for a specific project (if any)
 */
exports.getMyProposalForProject = async (req, res) => {
  try {
    const userId = req.user?._id;
    const role = req.user?.role;
    if (!userId) throw buildError('Unauthorized', 401);
    if (role !== 'freelancer')
      throw buildError('Only freelancers can access this', 403);

    const { project } = req.query;
    if (!project || !isValidId(project))
      throw buildError('Valid project id is required', 400);

    const proposal = await Proposal.findOne({ project, freelancer: userId });
    return res.json({ message: 'OK', data: { proposal } });
  } catch (e) {
    return handleControllerError(res, e);
  }
};

/**
 * PATCH /api/proposals/:id/status
 * Client updates status of a proposal on **their** project
 * body: { status: 'accepted' | 'rejected', clientResponse? }
 *
 * When status === 'accepted':
 *   - Update the related Project:
 *       project.freelancer = proposal.freelancer
 *       project.status = 'in-progress'
 *
 * Edge-case: if a previously accepted proposal is later set to 'rejected':
 *   - Revert the related Project:
 *       project.freelancer = null
 *       project.status = 'open'
 */
exports.updateProposalStatus = async (req, res) => {
  try {
    const userId = req.user?._id;
    const role = req.user?.role;
    if (!userId) throw buildError('Unauthorized', 401);
    if (role !== 'client' && role !== 'admin') {
      throw buildError('Only clients or admins can update status', 403);
    }

    const { id } = req.params;
    if (!isValidId(id)) throw buildError('Invalid proposal id', 400);

    const { status, clientResponse } = req.body || {};
    if (!['accepted', 'rejected'].includes(status)) {
      throw buildError('Status must be accepted or rejected', 400, [
        { param: 'status', msg: 'Invalid status' }
      ]);
    }

    // Load proposal with project client to enforce ownership
    const proposal = await Proposal.findById(id).populate(
      'project',
      'client title status freelancer'
    );
    if (!proposal) throw buildError('Proposal not found', 404);

    if (role !== 'admin') {
      const isClientOwner = String(proposal.project.client) === String(userId);
      if (!isClientOwner) throw buildError('Forbidden: not your project', 403);
    }

    // Track previous status to handle edge-case transition accepted -> rejected
    const prevStatus = proposal.status;

    // Update proposal
    proposal.status = status;
    proposal.clientResponse = clientResponse
      ? String(clientResponse).trim()
      : proposal.clientResponse;
    proposal.respondedAt = new Date();
    await proposal.save();

    // ACCEPTED → assign and move project to in-progress
    if (status === 'accepted') {
      const project = await Project.findById(proposal.project._id);
      if (project) {
        project.freelancer = proposal.freelancer;
        project.status = 'in-progress';
        await project.save();
      }
    }

    // EDGE CASE: was accepted, now rejected → clear assignment and reopen project
    if (status === 'rejected' && prevStatus === 'accepted') {
      const project = await Project.findById(proposal.project._id);
      if (project) {
        // Only revert if the currently assigned freelancer is this proposal's freelancer
        if (
          project.freelancer &&
          String(project.freelancer) === String(proposal.freelancer)
        ) {
          project.freelancer = null;
          project.status = 'open';
          await project.save();
        }
      }
    }

    // Optional realtime notifications
    try {
      const io = req.app.get('io');
      if (io) {
        // Notify the freelancer
        io.to(`user:${proposal.freelancer}`).emit('proposal:status-updated', {
          proposalId: String(proposal._id),
          status: proposal.status,
          clientResponse: proposal.clientResponse || null,
          projectId: String(proposal.project._id),
          projectTitle: proposal.project.title
        });

        // Notify the client (optional)
        io.to(`user:${proposal.project.client}`).emit(
          'proposal:status-updated:client',
          {
            proposalId: String(proposal._id),
            status: proposal.status,
            projectId: String(proposal.project._id),
            projectTitle: proposal.project.title,
            revertedToOpen:
              status === 'rejected' && prevStatus === 'accepted' ? true : false
          }
        );
      }
    } catch (e) {
      console.warn('Socket emit failed:', e.message);
    }

    return res.json({ message: 'Status updated', data: { proposal } });
  } catch (e) {
    return handleControllerError(res, e);
  }
};

/**
 * PATCH /api/proposals/:id/withdraw
 * Freelancer withdraws their own proposal
 */
exports.withdrawProposal = async (req, res) => {
  try {
    const userId = req.user?._id;
    const role = req.user?.role;
    if (!userId) throw buildError('Unauthorized', 401);
    if (role !== 'freelancer' && role !== 'admin')
      throw buildError('Only freelancers or admins can withdraw', 403);

    const { id } = req.params;
    if (!isValidId(id)) throw buildError('Invalid proposal id', 400);

    const proposal = await Proposal.findById(id);
    if (!proposal) throw buildError('Proposal not found', 404);

    if (role !== 'admin') {
      const isOwner = String(proposal.freelancer) === String(userId);
      if (!isOwner) throw buildError('Forbidden: not your proposal', 403);
    }

    proposal.status = 'withdrawn';
    await proposal.save();

    return res.json({ message: 'Proposal withdrawn', data: { proposal } });
  } catch (e) {
    return handleControllerError(res, e);
  }
};

/**
 * DELETE /api/proposals/:id
 * Owner freelancer or admin can delete
 */
exports.deleteProposal = async (req, res) => {
  try {
    const userId = req.user?._id;
    const role = req.user?.role;
    if (!userId) throw buildError('Unauthorized', 401);

    const { id } = req.params;
    if (!isValidId(id)) throw buildError('Invalid proposal id', 400);

    const proposal = await Proposal.findById(id);
    if (!proposal) throw buildError('Proposal not found', 404);

    const isOwner = String(proposal.freelancer) === String(userId);
    if (!isOwner && role !== 'admin') throw buildError('Forbidden', 403);

    await proposal.deleteOne();

    return res.json({ message: 'Proposal deleted', data: { id } });
  } catch (e) {
    return handleControllerError(res, e);
  }
};

/**
 * GET /api/proposals/stats/my-projects
 * Returns counts grouped by project & status for the current client
 */
exports.getMyProjectProposalStats = async (req, res) => {
  try {
    const userId = req.user?._id;
    const role = req.user?.role;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (role !== 'client' && role !== 'admin')
      return res.status(403).json({ message: 'Forbidden' });

    // all projects owned by this client
    const projects = await Project.find({ client: userId }).select('_id title');
    const projectIds = projects.map((p) => p._id);

    if (!projectIds.length) {
      return res.json({ message: 'OK', data: { stats: [], projects: [] } });
    }

    const stats = await Proposal.aggregate([
      { $match: { project: { $in: projectIds } } },
      {
        $group: {
          _id: { project: '$project', status: '$status' },
          count: { $sum: 1 }
        }
      }
    ]);

    // map project titles
    const projMap = Object.fromEntries(
      projects.map((p) => [String(p._id), { id: String(p._id), title: p.title }])
    );

    const normalized = {};
    for (const row of stats) {
      const pid = String(row._id.project);
      if (!normalized[pid])
        normalized[pid] = {
          projectId: pid,
          title: projMap[pid]?.title || 'Untitled',
          total: 0,
          pending: 0,
          accepted: 0,
          rejected: 0,
          withdrawn: 0
        };
      normalized[pid][row._id.status] = row.count;
      normalized[pid].total += row.count;
    }

    return res.json({
      message: 'OK',
      data: {
        stats: Object.values(normalized),
        projects: projects.map((p) => ({ id: String(p._id), title: p.title }))
      }
    });
  } catch (e) {
    console.error('getMyProjectProposalStats error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
};
