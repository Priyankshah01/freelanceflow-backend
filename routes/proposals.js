// routes/proposalsjs
const express = require('express');
const router = express.Router();
const { authenticate: protect } = require('../middleware/auth'); // alias to "protect"
const ctrl = require('../controllers/proposalController');

router.post('/', protect, ctrl.createProposal);
router.get('/', protect, ctrl.getProposals);
router.get('/mine', protect, ctrl.getMyProposals);
router.get('/mine-one', protect, ctrl.getMyProposalForProject);
router.get('/stats/my-projects', protect, ctrl.getMyProjectProposalStats);
router.get('/:id', protect, ctrl.getProposalById);
router.patch('/:id/status', protect, ctrl.updateProposalStatus);
router.patch('/:id/withdraw', protect, ctrl.withdrawProposal);
router.delete('/:id', protect, ctrl.deleteProposal);

module.exports = router;
