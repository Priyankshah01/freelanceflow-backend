// routes/admin.js
const express = require("express");
const router = express.Router();

const adminController = require("../controllers/adminController");
const { authenticate, authorize } = require("../middleware/auth");

// Protect ALL admin routes with auth + admin role
router.use(authenticate, authorize("admin"));

router.get("/__ping", (req, res) => {
  res.json({ ok: true, route: "/api/admin", ts: new Date().toISOString() });
});

// Overview (use the richer one)
router.get("/overview", adminController.getAdminOverview);

// Users
router.get("/users", adminController.listUsers);
router.patch("/users/:id/role", adminController.updateUserRole);
router.patch("/users/:id/status", adminController.updateUserStatus);

// Projects
router.get("/projects", adminController.listProjects);
router.patch("/projects/:id/status", adminController.setProjectStatus);

// Finance
router.get("/finance/summary", adminController.financeSummary);
router.get("/finance/invoices", adminController.listInvoices);
router.patch("/finance/invoices/:id/status", adminController.updateInvoiceStatus);
router.get("/finance/payouts", adminController.listPayouts);
router.patch("/finance/payouts/:id/status", adminController.updatePayoutStatus);

// Settings & Health
router.get("/settings", adminController.getSettings);
router.patch("/settings", adminController.updateSettings);
router.get("/health", adminController.systemHealth);

module.exports = router;
