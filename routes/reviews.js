const router = require('express').Router();

router.get('/', (_req, res) => res.json({ success: true, data: [] }));

module.exports = router;
