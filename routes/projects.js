// routes/projects.js - COMPLETE & FIXED
const express = require('express');
const { body } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');

const {
  // PUBLIC/GENERAL
  getProjects,          // optional public browser (used by /browse)
  getCategories,

  // ROLE-AWARE / ACCESS-CONTROLLED
  listProjectsForUser,  // GET / (auth) with ?mine=client|freelancer&status=...
  getProjectById,       // GET /:id (auth)

  // CRUD
  createProject,
  updateProject,
  deleteProject,

  // INVITES
  inviteFreelancer
} = require('../controllers/projectController');

const router = express.Router(); // 👈 define router BEFORE using it

// quick health check for this router specifically
router.get('/__ping', (req, res) => res.json({ ok: true }));

/* -------------------- Validation for create/update -------------------- */
const projectValidation = [
  body('title')
    .trim()
    .isLength({ min: 10, max: 100 })
    .withMessage('Title must be between 10 and 100 characters'),

  body('description')
    .trim()
    .isLength({ min: 50, max: 5000 })
    .withMessage('Description must be between 50 and 5000 characters'),

  body('category')
    .isIn([
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
      'other'
    ])
    .withMessage('Invalid category'),

  body('skills')
    .isArray({ min: 1 })
    .withMessage('At least one skill is required'),

  body('budget.type')
    .isIn(['fixed', 'hourly'])
    .withMessage('Budget type must be fixed or hourly'),

  body('budget.amount')
    .if(body('budget.type').equals('fixed'))
    .isNumeric()
    .custom((value) => value >= 5)
    .withMessage('Fixed budget must be at least $5'),

  body('budget.hourlyRate.min')
    .if(body('budget.type').equals('hourly'))
    .isNumeric()
    .custom((value) => value >= 5)
    .withMessage('Minimum hourly rate must be at least $5'),

  body('budget.hourlyRate.max')
    .if(body('budget.type').equals('hourly'))
    .isNumeric()
    .custom((value, { req }) => {
      if (value <= req.body.budget.hourlyRate.min) {
        throw new Error('Maximum hourly rate must be greater than minimum');
      }
      return true;
    }),

  body('timeline.duration')
    .isIn(['less-than-1-month', '1-3-months', '3-6-months', 'more-than-6-months'])
    .withMessage('Invalid timeline duration'),

  body('experienceLevel')
    .isIn(['entry', 'intermediate', 'expert'])
    .withMessage('Invalid experience level'),

  body('projectSize')
    .isIn(['small', 'medium', 'large'])
    .withMessage('Invalid project size'),

  body('location')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Location cannot exceed 100 characters'),

  body('applicationDeadline')
    .optional()
    .isISO8601()
    .toDate()
    .custom((value) => {
      if (value <= new Date()) {
        throw new Error('Application deadline must be in the future');
      }
      return true;
    })
];

/* ----------------------------- Public Routes ----------------------------- */

// Optional public browser feed (keep if you want browse without auth)
// e.g. GET /api/projects/browse?q=...&category=...
router.get('/browse', getProjects);

// Public categories
router.get('/categories', getCategories);

/* -------------------------- Authenticated Routes ------------------------- */

// Role-aware listing (what your UI calls with ?mine=client&status=in-progress...)
router.get('/', authenticate, listProjectsForUser);

// Single project (ACL enforced in controller)
router.get('/:id', authenticate, getProjectById);

// Create project (client only)
router.post('/', authenticate, authorize('client'), projectValidation, createProject);

// Update project (owner/admin checked in controller)
router.put('/:id', authenticate, projectValidation, updateProject);

// Delete project (owner/admin checked in controller)
router.delete('/:id', authenticate, deleteProject);

// Invite freelancer (owner client or admin)
router.post('/:id/invite', authenticate, inviteFreelancer);

module.exports = router;
