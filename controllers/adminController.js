// controllers/adminController.js
const User = require("../models/User");
const Project = require("../models/Project");

let Payment = null;
try { Payment = require("../models/Payments"); } catch (_) {}
let Audit = null;
try { Audit = require("../models/Audit"); } catch (_) {}
let Payout = null;
try { Payout = require("../models/Payout"); } catch (_) {}

/* ================== Admin Settings (in-memory) ================== */
const DEFAULT_ADMIN_SETTINGS = {
  siteName: "FreelanceFlow",
  supportEmail: "support@example.com",
  allowSignup: true,
  enablePayouts: false,
  maintenanceMode: false,
  force2FA: false,
  sessionTimeoutMin: 60,
};
if (!global.__ADMIN_SETTINGS__) {
  global.__ADMIN_SETTINGS__ = { ...DEFAULT_ADMIN_SETTINGS };
}

/* ============================== Helpers ============================== */
const toInt = (v, d = 1) => { const n = parseInt(v, 10); return Number.isNaN(n) || n <= 0 ? d : n; };
const toPage = (v, d = 1) => Math.max(parseInt(v, 10) || d, 1);
const toLimit = (v, d = 12, max = 100) => Math.min(Math.max(parseInt(v, 10) || d, 1), max);

function buildCreatedAtRange(from, to) {
  const range = {};
  if (from) { const d = new Date(from); if (!isNaN(d.getTime())) range.$gte = d; }
  if (to) { const end = new Date(to); if (!isNaN(end.getTime())) { end.setHours(23,59,59,999); range.$lte = end; } }
  return Object.keys(range).length ? range : null;
}

/* ============================= Overview ============================= */
exports.getAdminOverview = async (req, res) => {
  try {
    const [userCount, projectCount] = await Promise.all([
      User.countDocuments({}),
      Project.countDocuments({}),
    ]);

    let revenueAgg = [];
    if (Payment) {
      revenueAgg = await Payment.aggregate([
        { $match: Payment.schema.paths.type ? { type: "invoice" } : {} },
        { $group: { _id: "$status", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]);
    }

    let payoutsAgg = [];
    const PayoutModel = Payout || Payment;
    if (PayoutModel) {
      const match = (PayoutModel === Payment && Payment.schema.paths.type) ? { type: "payout" } : {};
      payoutsAgg = await PayoutModel.aggregate([
        { $match: match },
        { $group: { _id: "$status", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]);
    }

    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const trend7d = await Project.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    res.json({ counts: { users: userCount, projects: projectCount }, revenue: revenueAgg, payouts: payoutsAgg, trend7d });
  } catch (err) {
    console.error("admin.getAdminOverview error:", err);
    res.status(500).json({ error: "Failed to load admin overview" });
  }
};

exports.getOverview = async (req, res) => {
  try {
    const [users, projects] = await Promise.all([User.countDocuments({}), Project.countDocuments({})]);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const trend7d = await Project.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    let revenue = [{ _id: "paid", total: 0, count: 0 }];
    let payouts = [{ _id: "sent", total: 0, count: 0 }];
    if (Payment) {
      const payAgg = await Payment.aggregate([{ $group: { _id: "$status", total: { $sum: "$amount" }, count: { $sum: 1 } } }]);
      revenue = payAgg;
    }
    res.json({ counts: { users, projects }, revenue, payouts, trend7d });
  } catch (err) {
    console.error("admin.getOverview error:", err);
    res.status(500).json({ error: "Failed to load overview" });
  }
};

/* ============================== Users ============================== */
exports.listUsers = async (req, res) => {
  try {
    const { q = "", role, status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (q) filter.$or = [{ name: new RegExp(q, "i") }, { email: new RegExp(q, "i") }];
    if (role) filter.role = role;
    if (status) filter.status = status;

    const _page = toInt(page, 1);
    const _limit = toInt(limit, 20);
    const skip = (_page - 1) * _limit;

    const [items, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(_limit).select("-password").lean().exec(),
      User.countDocuments(filter),
    ]);

    res.json({ items, total, page: _page, pages: Math.max(1, Math.ceil(total / _limit)) });
  } catch (err) {
    console.error("admin.listUsers error:", err);
    res.status(500).json({ error: "Failed to list users" });
  }
};

exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!["admin", "client", "freelancer"].includes(role)) return res.status(400).json({ error: "Invalid role" });

    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("-password").lean().exec();
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user);
  } catch (err) {
    console.error("admin.updateUserRole error:", err);
    res.status(500).json({ error: "Failed to update role" });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["active", "suspended"].includes(status)) return res.status(400).json({ error: "Invalid status" });

    const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true }).select("-password").lean().exec();
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user);
  } catch (err) {
    console.error("admin.updateUserStatus error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
};

/* ============================= Projects ============================= */
exports.listProjects = async (req, res) => {
  try {
    const { status, from, to, page = 1, limit = 12 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const createdAt = buildCreatedAtRange(from, to);
    if (createdAt) filter.createdAt = createdAt;

    const _page = Math.max(parseInt(page, 10) || 1, 1);
    const _limit = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 100);
    const skip = (_page - 1) * _limit;

    let query = Project.find(filter).sort({ createdAt: -1 }).skip(skip).limit(_limit);
    const schemaPaths = Project.schema?.paths || {};
    const maybePopulate = (p, sel) => (schemaPaths[p] ? query.populate(p, sel) : query);
    query = maybePopulate("client", "name email");
    query = maybePopulate("clientId", "name email");
    query = maybePopulate("freelancer", "name email");
    query = maybePopulate("freelancerId", "name email");
    query = maybePopulate("assignee", "name email");

    const [items, total] = await Promise.all([query.exec(), Project.countDocuments(filter)]);
    res.json({ items, total, page: _page, pages: Math.max(1, Math.ceil(total / _limit)) });
  } catch (err) {
    console.error("admin.listProjects error:", err);
    res.status(500).json({ error: "Failed to list projects" });
  }
};

exports.setProjectStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["open", "in_progress", "completed", "archived", "flagged"];
    if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const project = await Project.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean().exec();
    if (!project) return res.status(404).json({ error: "Project not found" });

    res.json(project);
  } catch (err) {
    console.error("admin.setProjectStatus error:", err);
    res.status(500).json({ error: "Failed to update project status" });
  }
};

/* ============================== Finance ============================== */
exports.financeSummary = async (req, res) => {
  try {
    if (Payment) {
      const invoices = await Payment.aggregate([{ $group: { _id: "$status", total: { $sum: "$amount" }, count: { $sum: 1 } } }]);
      return res.json({ invoices, payouts: [{ _id: "sent", total: 0, count: 0 }] });
    }
    return res.json({ invoices: [{ _id: "paid", total: 0, count: 0 }], payouts: [{ _id: "sent", total: 0, count: 0 }] });
  } catch (err) {
    console.error("admin.financeSummary error:", err);
    res.status(500).json({ error: "Failed to load finance summary" });
  }
};

/* =============================== Audits =============================== */
exports.listAudits = async (req, res) => {
  if (!Audit) return res.json({ items: [], total: 0, page: 1, pages: 1 });
  try {
    const { q = "", from, to, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (q && typeof q === "string" && q.trim()) {
      const rx = new RegExp(q.trim(), "i");
      filter.$or = [{ action: rx }, { targetId: rx }];
    }
    const createdAt = buildCreatedAtRange(from, to);
    if (createdAt) filter.createdAt = createdAt;

    const _page = Math.max(parseInt(page, 10) || 1, 1);
    const _limit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 200);
    const skip = (_page - 1) * _limit;

    const [items, total] = await Promise.all([
      Audit.find(filter).sort({ createdAt: -1 }).skip(skip).limit(_limit).lean().exec(),
      Audit.countDocuments(filter),
    ]);

    res.json({ items, total, page: _page, pages: Math.max(1, Math.ceil(total / _limit)) });
  } catch (err) {
    console.error("admin.listAudits error:", err);
    res.status(500).json({ error: "Failed to list audit logs" });
  }
};

/* ============================== Settings ============================== */
exports.getSettings = async (_req, res) => {
  try { return res.json({ ...global.__ADMIN_SETTINGS__ }); }
  catch (err) { console.error("admin.getSettings error:", err); return res.status(500).json({ error: "Failed to load settings" }); }
};

exports.updateSettings = async (req, res) => {
  try {
    const body = req.body || {};
    const allowed = ["siteName","supportEmail","allowSignup","enablePayouts","maintenanceMode","force2FA","sessionTimeoutMin"];
    const coerce = (k, v) => {
      switch (k) {
        case "allowSignup":
        case "enablePayouts":
        case "maintenanceMode":
        case "force2FA": return Boolean(v);
        case "sessionTimeoutMin": {
          const n = parseInt(v, 10);
          return Number.isFinite(n) && n >= 5 ? n : DEFAULT_ADMIN_SETTINGS.sessionTimeoutMin;
        }
        default: return v;
      }
    };
    for (const k of allowed) if (Object.prototype.hasOwnProperty.call(body, k)) global.__ADMIN_SETTINGS__[k] = coerce(k, body[k]);
    return res.json({ ...global.__ADMIN_SETTINGS__ });
  } catch (err) {
    console.error("admin.updateSettings error:", err);
    return res.status(500).json({ error: "Failed to update settings" });
  }
};

/* ======================= Invoices & Payouts ======================= */
exports.listInvoices = async (req, res) => {
  if (!Payment) return res.json({ items: [], total: 0, page: 1, pages: 1 });
  try {
    const { status, from, to, page = 1, limit = 12 } = req.query;
    const filter = {};
    if (Payment.schema?.paths?.type) filter.type = "invoice";
    if (status) filter.status = status;
    const createdAt = buildCreatedAtRange(from, to);
    if (createdAt) filter.createdAt = createdAt;

    const _page = toPage(page);
    const _limit = toLimit(limit, 12, 200);
    const skip = (_page - 1) * _limit;

    let query = Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(_limit);
    const paths = Payment.schema?.paths || {};
    const maybe = (p, sel) => (paths[p] ? query.populate(p, sel) : query);
    query = maybe("user", "name email"); query = maybe("project", "title");

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
    if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
    const inv = await Payment.findByIdAndUpdate(req.params.id, { status, updatedAt: new Date() }, { new: true });
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    res.json(inv);
  } catch (err) {
    console.error("admin.updateInvoiceStatus error:", err);
    res.status(500).json({ error: "Failed to update invoice" });
  }
};

exports.listPayouts = async (req, res) => {
  const Model = Payout || Payment;
  if (!Model) return res.json({ items: [], total: 0, page: 1, pages: 1 });
  try {
    const { status, from, to, page = 1, limit = 12 } = req.query;
    const filter = {};
    if (Model === Payment && Payment.schema?.paths?.type) filter.type = "payout";
    if (status) filter.status = status;
    const createdAt = buildCreatedAtRange(from, to);
    if (createdAt) filter.createdAt = createdAt;

    const _page = toPage(page);
    const _limit = toLimit(limit, 12, 200);
    const skip = (_page - 1) * _limit;

    let query = Model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(_limit);
    const paths = Model.schema?.paths || {};
    const maybe = (p, sel) => (paths[p] ? query.populate(p, sel) : query);
    query = maybe("freelancer", "name email"); query = maybe("user", "name email"); query = maybe("project", "title");

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
    if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
    const po = await Model.findByIdAndUpdate(req.params.id, { status, updatedAt: new Date() }, { new: true });
    if (!po) return res.status(404).json({ error: "Payout not found" });
    res.json(po);
  } catch (err) {
    console.error("admin.updatePayoutStatus error:", err);
    res.status(500).json({ error: "Failed to update payout" });
  }
};

/* ============================ Health ============================ */
exports.systemHealth = async (_req, res) => {
  try {
    const node = process.version;
    const uptimeSec = process.uptime ? process.uptime() : 0;
    let mongo = "unknown";
    try {
      const mongoose = require("mongoose");
      if (mongoose?.connection?.readyState === 1) mongo = "connected";
      else if (mongoose?.connection?.readyState === 2) mongo = "connecting";
      else if (mongoose?.connection?.readyState === 0) mongo = "disconnected";
      else if (mongoose?.connection?.readyState === 3) mongo = "disconnecting";
    } catch {}
    res.json({ status: "ok", node, uptimeSec, mongo });
  } catch (err) {
    console.error("admin.systemHealth error:", err);
    res.status(500).json({ status: "degraded" });
  }
};
