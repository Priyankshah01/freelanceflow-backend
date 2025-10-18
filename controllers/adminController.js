// routes/admin.js
const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");

// Optional requireAdmin guard (use yours if available)
let requireAdmin = (_req, _res, next) => next();
try {
  requireAdmin = require("../middleware/requireAdmin");
} catch (_) {
  console.warn("⚠️  requireAdmin middleware not found; admin routes are unprotected in dev.");
}

router.get("/__ping", (req, res) => {
  res.json({ ok: true, route: "/api/admin", ts: new Date().toISOString() });
});

// Overview (pick ONE; this uses the richer version)
router.get("/overview", requireAdmin, adminController.getAdminOverview);

// Users
router.get("/users", requireAdmin, adminController.listUsers);
router.patch("/users/:id/role", requireAdmin, adminController.updateUserRole);
router.patch("/users/:id/status", requireAdmin, adminController.updateUserStatus);

// Projects
router.get("/projects", requireAdmin, adminController.listProjects);
router.patch("/projects/:id/status", requireAdmin, adminController.setProjectStatus);

// Finance
router.get("/finance/summary", requireAdmin, adminController.financeSummary);
router.get("/finance/invoices", requireAdmin, adminController.listInvoices);
router.patch("/finance/invoices/:id/status", requireAdmin, adminController.updateInvoiceStatus);
router.get("/finance/payouts", requireAdmin, adminController.listPayouts);
router.patch("/finance/payouts/:id/status", requireAdmin, adminController.updatePayoutStatus);

// Settings & Health
router.get("/settings", requireAdmin, adminController.getSettings);
router.patch("/settings", requireAdmin, adminController.updateSettings);
router.get("/health", requireAdmin, adminController.systemHealth);

module.exports = router;
