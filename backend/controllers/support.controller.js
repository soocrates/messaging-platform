import { createSupportCase, updateCaseStatus } from '../../modules/db/supportCases.js';
import { notifyAgents } from '../services/agentNotification.service.js';
import { generateContextualQuestions } from '../services/questionGeneration.service.js';
import { supportCaseSchema } from '../validators/supportCase.validator.js';
import { logger } from '../../utils/logger.js';

export async function createCase(req, res) {
  try {
    const { error, value } = supportCaseSchema.validate(req.body, { stripUnknown: true });
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const caseData = await createSupportCase(value);
    
    // Notify agents based on contact method
    if (value.contactMethod === 'call' || value.contactMethod === 'email') {
      notifyAgents({
        type: value.contactMethod,
        caseId: caseData.case_id,
        subject: value.subject,
        severity: value.severity,
        timestamp: Date.now()
      });
      logger.info('Agent notification sent', { 
        caseId: caseData.case_id, 
        method: value.contactMethod 
      });
    }

    res.status(201).json({
      success: true,
      caseId: caseData.case_id,
      message: 'Support case created successfully',
      contactMethod: value.contactMethod
    });
  } catch (err) {
    logger.error('Support case creation failed', { error: err.message });
    res.status(500).json({ error: 'Failed to create support case' });
  }
}

export async function pauseCase(req, res) {
  try {
    const { caseId } = req.params;
    const updated = await updateCaseStatus(caseId, 'paused');
    
    if (!updated) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }
    
    res.json({ success: true, caseId, status: 'paused' });
  } catch (err) {
    logger.error('Case pause failed', { error: err.message });
    res.status(500).json({ error: 'Failed to pause case' });
  }
}

export async function getContextualQuestions(req, res) {
  try {
    const { contactMethod, userSessionId } = req.body;
    
    if (!contactMethod || !['chat', 'email', 'call'].includes(contactMethod)) {
      res.status(400).json({ error: 'Invalid contact method' });
      return;
    }

    const questions = await generateContextualQuestions(contactMethod, userSessionId);

    res.json({ 
      success: true, 
      questions,
      contactMethod 
    });
  } catch (err) {
    logger.error('Failed to generate questions', { error: err.message });
    // Return default questions on error
    const defaultQuestions = req.body.contactMethod === 'chat' 
      ? ['How can we help you today?', 'What service are you having issues with?']
      : ['What can we help you with?'];
    res.json({ 
      success: true, 
      questions: defaultQuestions, 
      contactMethod: req.body.contactMethod 
    });
  }
}