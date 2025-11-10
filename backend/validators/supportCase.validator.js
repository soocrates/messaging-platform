import Joi from 'joi';

export const supportCaseSchema = Joi.object({
  helpType: Joi.string().valid('technical', 'account', 'other').required(),
  service: Joi.string().min(1).max(200).required(),
  category: Joi.string().min(1).max(200).required(),
  severity: Joi.string().valid('low', 'medium', 'high').required(),
  subject: Joi.string().min(1).max(500).required(),
  description: Joi.string().min(1).max(5000).required(),
  contactMethod: Joi.string().valid('chat', 'email', 'call').required(),
  userSessionId: Joi.string().optional()
});