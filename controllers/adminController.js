const User = require("../models/User");
const Project = require("../models/Project");

let Payment = null;
try {
  Payment = require("../models/Payments"); // optional, ok if missing
} catch (_) {}

/** Optional Audit model (safe if missing) */
let Audit = null;
try {
  Audit = require("../models/Audit"); // define if you have one
} catch (_) {}

let Payout = null;
try {
  Payout = require("../models/Payout");
} catch (_) {}

exports.getAdminOverview = async (req, res) => {
  try {
    // --- Basic counts ---
    const [userCount, projectCount] = await Promise.all([
      User.countDocuments({}),
      Project.countDocuments({}),
    ]);

    // --- Revenue (Invoices grouped by status) ---
    let revenueAgg = [];
    if (Payment) {
      revenueAgg = await Payment.aggregate([
        { $match: Payment.schema.paths.type ? { type: "invoice" } : {} },
        {
          $group: {
            _id: "$status",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]);
    }

    // --- Payouts grouped by status ---
    let payoutsAgg = [];
    const PayoutModel = Payout || Payment;
    if (PayoutModel) {
      const match =
        PayoutModel === Payment && Payment.schema.paths.type
          ? { type: "payout" }
          : {};
      payoutsAgg = await PayoutModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$status",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]);
    }

    // --- 7-day trend: projects created per day ---
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const trend7d = await Project.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      counts: {
        users: userCount,
        projects: projectCount,
      },
      revenue: revenueAgg,
      payouts: payoutsAgg,
      trend7d,
    });
  } catch (err) {
    console.error("admin.getAdminOverview error:", err);
    res.status(500).json({ error: "Failed to load admin overview" });
  }
};

/* ---------------- Helpers ---------------- */
const toInt = (v, d = 1) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) || n <= 0 ? d : n;
};

/* ---------------- Overview ---------------- */
exports.getOverview = async (req, res) => {
  try {
    const [users, projects] = await Promise.all([
      User.countDocuments({}),
      Project.countDocuments({}),
    ]);

    // 7-day project creation trend
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const trend7d = await Project.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // revenue/payouts (use Payments if available)
    let revenue = [{ _id: "paid", total: 0, count: 0 }];
    let payouts = [{ _id: "sent", total: 0, count: 0 }];

    if (Payment) {
      const payAgg = await Payment.aggregate([
        {
          $group: {
            _id: "$status",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]);
      revenue = payAgg;
      // If you add a real payouts source later, replace this:
      payouts = [{ _id: "sent", total: 0, count: 0 }];
    }

    return res.json({
      counts: { users, projects },
      revenue,
      payouts,
      trend7d,
    });
  } catch (err) {
    console.error("admin.getOverview error:", err);
    res.status(500).json({ error: "Failed to load overview" });
  }
};

/* ---------------- Users ---------------- */
exports.listUsers = async (req, res) => {
  try {
    const { q = "", role, status, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (q) {
      filter.$or = [
        { name: new RegExp(q, "i") },
        { email: new RegExp(q, "i") },
      ];
    }
    if (role) filter.role = role;
    if (status) filter.status = status; // e.g., "active" / "suspended"

    const _page = toInt(page, 1);
    const _limit = toInt(limit, 20);
    const skip = (_page - 1) * _limit;

    const [items, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(_limit)
        .select("-password")
        .lean()
        .exec(),
      User.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: _page,
      pages: Math.max(1, Math.ceil(total / _limit)),
    });
  } catch (err) {
    console.error("admin.listUsers error:", err);
    res.status(500).json({ error: "Failed to list users" });
  }
};

exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!["admin", "client", "freelancer"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    )
      .select("-password")
      .lean()
      .exec();

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user);
  } catch (err) {
    console.error("admin.updateUserRole error:", err);
    res.status(500).json({ error: "Failed to update role" });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body; // "active" | "suspended"
    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    )
      .select("-password")
      .lean()
      .exec();

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user);
  } catch (err) {
    console.error("admin.updateUserStatus error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
};

/* ---------------- Projects ---------------- */
// IMPORTANT: NO populate calls here to avoid StrictPopulateError.
// Add only the exact paths your schema has later, if needed.
exports.listProjects = async (req, res) => {
  try {
    const { status, from, to, page = 1, limit = 12 } = req.query;

    // Build filter
    const filter = {};
    if (status) filter.status = status;

    // Date range on createdAt (supports one-sided or both)
    const createdAt = {};
    if (from) {
      const d = new Date(from);
      if (!isNaN(d.getTime())) createdAt.$gte = d;
    }
    if (to) {
      // include the entire 'to' day if only YYYY-MM-DD is given
      const end = new Date(to);
      if (!isNaN(end.getTime())) {
        // push to end of day
        end.setHours(23, 59, 59, 999);
        createdAt.$lte = end;
      }
    }
    if (Object.keys(createdAt).length) filter.createdAt = createdAt;

    // Pagination
    const _page = Math.max(parseInt(page, 10) || 1, 1);
    const _limit = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 100);
    const skip = (_page - 1) * _limit;

    // Query + (best-effort) populates
    let query = Project.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(_limit);

    // Only populate if the path exists in your schema (prevents StrictPopulateError)
    const schemaPaths = Project.schema?.paths || {};
    const maybePopulate = (path, select) =>
      schemaPaths[path] ? query.populate(path, select) : query;

    query = maybePopulate("client", "name email");
    query = maybePopulate("clientId", "name email");
    query = maybePopulate("freelancer", "name email");
    query = maybePopulate("freelancerId", "name email");
    query = maybePopulate("assignee", "name email");

    const [items, total] = await Promise.all([
      query.exec(),
      Project.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: _page,
      pages: Math.max(1, Math.ceil(total / _limit)),
    });
  } catch (err) {
    console.error("admin.listProjects error:", err);
    res.status(500).json({ error: "Failed to list projects" });
  }
};

exports.setProjectStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = [
      "open",
      "in_progress",
      "completed",
      "archived",
      "flagged",
    ];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    )
      .lean()
      .exec();

    if (!project) return res.status(404).json({ error: "Project not found" });

    res.json(project);
  } catch (err) {
    console.error("admin.setProjectStatus error:", err);
    res.status(500).json({ error: "Failed to update project status" });
  }
};

/* ---------------- Finance ---------------- */
exports.financeSummary = async (req, res) => {
  try {
    if (Payment) {
      const invoices = await Payment.aggregate([
        {
          $group: {
            _id: "$status",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]);
      return res.json({
        invoices,
        payouts: [{ _id: "sent", total: 0, count: 0 }],
      });
    }

    return res.json({
      invoices: [{ _id: "paid", total: 0, count: 0 }],
      payouts: [{ _id: "sent", total: 0, count: 0 }],
    });
  } catch (err) {
    console.error("admin.financeSummary error:", err);
    res.status(500).json({ error: "Failed to load finance summary" });
  }
};

/* ---------------- Audits ---------------- */
// If you don't have an Audit model yet, return an empty paginated list.
exports.listAudits = async (req, res) => {
  // If you don’t have an Audit model yet, return an empty paginated list
  if (!Audit) {
    return res.json({ items: [], total: 0, page: 1, pages: 1 });
  }

  try {
    const { q = "", from, to, page = 1, limit = 30 } = req.query;

    const filter = {};

    // Keyword search on action + targetId (tunable)
    if (q && typeof q === "string" && q.trim()) {
      const rx = new RegExp(q.trim(), "i");
      filter.$or = [{ action: rx }, { targetId: rx }];
      // If you store user/email etc, you can extend:
      // filter.$or.push({ "user.email": rx }, { "user.name": rx })
    }

    // Date range on createdAt
    const createdAt = {};
    if (from) {
      const d = new Date(from);
      if (!isNaN(d.getTime())) createdAt.$gte = d;
    }
    if (to) {
      const end = new Date(to);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        createdAt.$lte = end;
      }
    }
    if (Object.keys(createdAt).length) filter.createdAt = createdAt;

    // Pagination
    const _page = Math.max(parseInt(page, 10) || 1, 1);
    const _limit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 200);
    const skip = (_page - 1) * _limit;

    const [items, total] = await Promise.all([
      Audit.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(_limit)
        .lean()
        .exec(),
      Audit.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: _page,
      pages: Math.max(1, Math.ceil(total / _limit)),
    });
  } catch (err) {
    console.error("admin.listAudits error:", err);
    res.status(500).json({ error: "Failed to list audit logs" });
  }
};

exports.getSettings = async (req, res) => {
  try {
    res.json(__ADMIN_SETTINGS__);
  } catch (err) {
    console.error("admin.getSettings error:", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const body = req.body || {};
    // whitelist fields
    const allowed = [
      "siteName",
      "supportEmail",
      "allowSignup",
      "enablePayouts",
      "maintenanceMode",
      "force2FA",
      "sessionTimeoutMin",
    ];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        __ADMIN_SETTINGS__[k] = body[k];
      }
    }
    res.json(__ADMIN_SETTINGS__);
  } catch (err) {
    console.error("admin.updateSettings error:", err);
    res.status(500).json({ error: "Failed to update settings" });
  }
};

/** Helper: parse positive int with bounds */
const toPage = (v, d = 1) => Math.max(parseInt(v, 10) || d, 1);
const toLimit = (v, d = 12, max = 100) =>
  Math.min(Math.max(parseInt(v, 10) || d, 1), max);

/** Helper: build createdAt range from from/to */
function buildCreatedAtRange(from, to) {
  const range = {};
  if (from) {
    const d = new Date(from);
    if (!isNaN(d.getTime())) range.$gte = d;
  }
  if (to) {
    const end = new Date(to);
    if (!isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
  }
  return Object.keys(range).length ? range : null;
}

/* ================= INVOICES ================= */
exports.listInvoices = async (req, res) => {
  // If neither Payment nor any invoice store is available, return empty list
  if (!Payment) {
    return res.json({ items: [], total: 0, page: 1, pages: 1 });
  }

  try {
    const { status, from, to, page = 1, limit = 12 } = req.query;
    const filter = {};

    // Some codebases store both invoices & payouts in "Payments" collection with `type`
    // If `type` exists, we filter by type='invoice'. If not, we simply don't filter by type.
    if (Payment.schema?.paths?.type) filter.type = "invoice";

    if (status) filter.status = status;
    const createdAt = buildCreatedAtRange(from, to);
    if (createdAt) filter.createdAt = createdAt;

    const _page = toPage(page);
    const _limit = toLimit(limit, 12, 200);
    const skip = (_page - 1) * _limit;

    let query = Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(_limit);

    // Safe optional populates (common fields)
    const paths = Payment.schema?.paths || {};
    const maybe = (path, sel) => (paths[path] ? query.populate(path, sel) : query);
    query = maybe("user", "name email");
    query = maybe("project", "title");

    const [items, total] = await Promise.all([query.lean().exec(), Payment.countDocuments(filter)]);
    res.json({ items, total, page: _page, pages: Math.max(1, Math.ceil(total / _limit)) });
  } catch (err) {
    console.error("admin.listInvoices error:", err);
    res.status(500).json({ error: "Failed to list invoices" });
  }
};

exports.updateInvoiceStatus = async (req, res) => {
  if (!Payment) return res.status(404).json({ error: "Payments model not available" });
  try {
    const { status } = req.body;
    const allowed = ["paid", "pending", "failed", "refunded"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const update = { status };
    update.updatedAt = new Date();

    const inv = await Payment.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    res.json(inv);
  } catch (err) {
    console.error("admin.updateInvoiceStatus error:", err);
    res.status(500).json({ error: "Failed to update invoice" });
  }
};

/* ================= PAYOUTS ================= */
exports.listPayouts = async (req, res) => {
  // Prefer dedicated Payout model; otherwise fallback to Payment with type='payout'
  const Model = Payout || Payment;
  if (!Model) return res.json({ items: [], total: 0, page: 1, pages: 1 });

  try {
    const { status, from, to, page = 1, limit = 12 } = req.query;
    const filter = {};

    if (Model === Payment && Payment.schema?.paths?.type) {
      filter.type = "payout";
    }

    if (status) filter.status = status;
    const createdAt = buildCreatedAtRange(from, to);
    if (createdAt) filter.createdAt = createdAt;

    const _page = toPage(page);
    const _limit = toLimit(limit, 12, 200);
    const skip = (_page - 1) * _limit;

    let query = Model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(_limit);

    // Safe optional populates (freelancer/user field names vary)
    const paths = Model.schema?.paths || {};
    const maybe = (path, sel) => (paths[path] ? query.populate(path, sel) : query);

    // Try common references
    query = maybe("freelancer", "name email");
    query = maybe("user", "name email");
    query = maybe("project", "title");

    const [items, total] = await Promise.all([query.lean().exec(), Model.countDocuments(filter)]);
    res.json({ items, total, page: _page, pages: Math.max(1, Math.ceil(total / _limit)) });
  } catch (err) {
    console.error("admin.listPayouts error:", err);
    res.status(500).json({ error: "Failed to list payouts" });
  }
};

exports.updatePayoutStatus = async (req, res) => {
  const Model = Payout || Payment;
  if (!Model) return res.status(404).json({ error: "Payout model not available" });

  try {
    const { status } = req.body;
    const allowed = ["requested", "processing", "sent", "failed"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const update = { status };
    update.updatedAt = new Date();

    const po = await Model.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!po) return res.status(404).json({ error: "Payout not found" });

    res.json(po);
  } catch (err) {
    console.error("admin.updatePayoutStatus error:", err);
    res.status(500).json({ error: "Failed to update payout" });
  }
};

exports.systemHealth = async (req, res) => {
  try {
    const node = process.version;
    const uptimeSec = process.uptime ? process.uptime() : 0;

    // Check Mongo (best-effort)
    let mongo = "unknown";
    try {
      // If you use mongoose
      const mongoose = require("mongoose");
      if (mongoose?.connection?.readyState === 1) mongo = "connected";
      else if (mongoose?.connection?.readyState === 2) mongo = "connecting";
      else if (mongoose?.connection?.readyState === 0) mongo = "disconnected";
      else if (mongoose?.connection?.readyState === 3) mongo = "disconnecting";
    } catch {
      // ignore if mongoose not available in this context
    }

    res.json({
      status: "ok",
      node,
      uptimeSec,
      mongo,
    });
  } catch (err) {
    console.error("admin.systemHealth error:", err);
    res.status(500).json({ status: "degraded" });
  }
};

