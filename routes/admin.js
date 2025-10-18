// routes/admin.js
const express = require("express");
const router = express.Router();

const adminController = require("../controllers/adminController");

// If you have a different admin auth middleware, import it and use that instead:
let requireAdmin = (_req, _res, next) => next();
try {
  // optional: use your actual auth guard
  // Example implementation below if you don't have one
  requireAdmin = require("../middleware/requireAdmin");
} catch (_) {
  // Fallback no-op; don't block in dev if middleware missing
  console.warn("⚠️  requireAdmin middleware not found; admin routes are unprotected in dev.");
}

router.get('/__ping', (req, res) => {
  res.json({ ok: true, route: '/api/admin', ts: new Date().toISOString() });
});
/**
 * IMPORTANT:
 * Do NOT prefix these with /api/admin — server.js already mounts at /api/admin
 */

// Overview
router.get("/overview", requireAdmin, adminController.getOverview);

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

// Audits
router.get("/audits", requireAdmin, adminController.listAudits);

// Settings & Health (if you added the Settings page)
router.get("/settings", requireAdmin, adminController.getSettings);
router.patch("/settings", requireAdmin, adminController.updateSettings);
router.get("/health", requireAdmin, adminController.systemHealth);

// Finance: invoices & payouts
router.get("/finance/invoices", requireAdmin, adminController.listInvoices);
router.patch("/finance/invoices/:id/status", requireAdmin, adminController.updateInvoiceStatus);

router.get("/finance/payouts", requireAdmin, adminController.listPayouts);
router.patch("/finance/payouts/:id/status", requireAdmin, adminController.updatePayoutStatus);


module.exports = router;
