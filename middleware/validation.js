const { validationResult } = require('express-validator');

exports.handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
};
