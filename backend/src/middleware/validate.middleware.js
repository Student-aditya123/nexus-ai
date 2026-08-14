'use strict';
const { validationResult } = require('express-validator');
const { AppError } = require('../utils/errors');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map(e => `${e.path}: ${e.msg}`).join('. ');
    return next(new AppError(messages, 400));
  }
  next();
};

module.exports = { validate };
