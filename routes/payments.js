const router = require('express').Router();

router.get('/health', (_req, res) => res.json({ ok: true, route: 'payments' }));

module.exports = router;
