// routes/proposals.js
const express = require('express');
const router = express.Router();

let ProposalModel = null;
try {
  // If you have a real Proposal model, this will work.
  ProposalModel = require('../models/Proposal');
} catch {
  // No model? We'll fall back to stub data.
  ProposalModel = null;
}

const VALID_STATUSES = new Set(['pending', 'accepted', 'rejected']);

/**
 * GET /api/proposals?status=pending&limit=100
 * Returns proposals filtered by status (optional) with a limit (default 50).
 */
router.get('/', async (req, res, next) => {
  try {
    const status = String(req.query.status || '').toLowerCase().trim();
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);

    if (status && !VALID_STATUSES.has(status)) {
      const err = new Error('Invalid status. Use pending | accepted | rejected');
      err.statusCode = 400;
      throw err;
    }

    if (ProposalModel) {
      const filter = {};
      if (status) filter.status = status;
      const items = await ProposalModel.find(filter).sort({ createdAt: -1 }).limit(limit);
      return res.json({ success: true, count: items.length, data: items });
    }

    // ---- Stub fallback (no DB model present) ----
    const all = [
      { _id: 's1', title: 'Stub A', status: 'pending', createdAt: new Date() },
      { _id: 's2', title: 'Stub B', status: 'accepted', createdAt: new Date() },
      { _id: 's3', title: 'Stub C', status: 'rejected', createdAt: new Date() },
    ];
    const filtered = status ? all.filter(p => p.status === status) : all;
    return res.json({ success: true, count: Math.min(filtered.length, limit), data: filtered.slice(0, limit) });
  } catch (err) {
    next(err);
  }
});

/** Quick ping to verify mount */
router.get('/__ping', (req, res) => {
  res.json({ ok: true, route: '/api/proposals', ts: new Date().toISOString() });
});

module.exports = router;
