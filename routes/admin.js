// routes/admin.js
const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { authenticate, authorize } = require("../middleware/auth");

router.use(authenticate, authorize("admin"));

router.get("/__ping", (req, res) => res.json({ ok: true, route: "/api/admin" }));
router.get("/overview", adminController.getAdminOverview);
router.get("/users", adminController.listUsers);
router.patch("/users/:id/role", adminController.updateUserRole);
router.patch("/users/:id/status", adminController.updateUserStatus);
router.get("/projects", adminController.listProjects);
router.patch("/projects/:id/status", adminController.setProjectStatus);
router.get("/finance/summary", adminController.financeSummary);
router.get("/finance/invoices", adminController.listInvoices);
router.patch("/finance/invoices/:id/status", adminController.updateInvoiceStatus);
router.get("/finance/payouts", adminController.listPayouts);
router.patch("/finance/payouts/:id/status", adminController.updatePayoutStatus);
router.get("/settings", adminController.getSettings);
router.patch("/settings", adminController.updateSettings);
router.get("/health", adminController.systemHealth);

module.exports = router;
