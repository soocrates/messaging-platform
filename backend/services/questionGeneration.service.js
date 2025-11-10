import { getHistoryForSession } from '../../modules/db/index.js';
import { getCasesByStatus } from '../../modules/db/supportCases.js';
import { logger } from '../../utils/logger.js';

export async function generateContextualQuestions(contactMethod, userEmail) {
  const questions = [];

  // If user has previous session, analyze their history
  if (userEmail) {
    try {
      const history = await getHistoryForSession(userEmail, 50);
      
      // Analyze previous conversations
      const recentMessages = history.slice(-10);
      const userMessages = recentMessages.filter(m => m.sender === 'user');
      const mentionedServices = new Set();
      const mentionedIssues = [];

      userMessages.forEach(msg => {
        const content = msg.content.toLowerCase();
        
        // Extract service mentions
        if (content.includes('ec2') || content.includes('s3') || 
            content.includes('lambda') || content.includes('rds') || 
            content.includes('dynamodb')) {
          if (content.includes('ec2')) mentionedServices.add('EC2');
          if (content.includes('s3')) mentionedServices.add('S3');
          if (content.includes('lambda')) mentionedServices.add('Lambda');
          if (content.includes('rds')) mentionedServices.add('RDS');
          if (content.includes('dynamodb')) mentionedServices.add('DynamoDB');
        }
        
        // Extract issue types
        if (content.includes('error') || content.includes('issue') || 
            content.includes('problem')) {
          mentionedIssues.push(msg.content);
        }
      });

      // Generate contextual questions based on history
      if (mentionedServices.size > 0) {
        const services = Array.from(mentionedServices).join(', ');
        questions.push(`I see you've been working with ${services}. What specific issue are you experiencing?`);
      } else if (userMessages.length > 0) {
        questions.push('Based on your previous conversations, how can we help you today?');
      }

      if (mentionedIssues.length > 0) {
        questions.push('Is this related to the issue you mentioned earlier?');
      }

      // Check for recent support cases
      const recentCases = await getCasesByStatus('open');
      const userCases = recentCases.filter(c => c.userEmail === userEmail);
      
      if (userCases.length > 0) {
        questions.push(`I notice you have ${userCases.length} open case(s). Is this related to any of them?`);
      }
    } catch (err) {
      logger.error('Failed to analyze user history', { error: err.message });
    }
  }

  // Add default questions if no contextual questions generated
  if (questions.length === 0) {
    if (contactMethod === 'chat') {
      questions.push('How can we help you today?');
      questions.push('What service or feature are you having issues with?');
      questions.push('Can you describe the problem in more detail?');
    } else {
      questions.push('What can we help you with?');
    }
  } else {
    // Add follow-up questions
    questions.push('Can you provide more details about your issue?');
  }

  return questions;
}