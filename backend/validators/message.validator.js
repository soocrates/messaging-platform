import Joi from 'joi';

export const messageSchema = Joi.object({
  type: Joi.string().valid('message', 'ping').required(),
  content: Joi.when('type', { 
    is: 'message', 
    then: Joi.string().min(1).max(2000).required(), 
    otherwise: Joi.forbidden() 
  })
});