import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION || 'us-east-1';
const tableName = process.env.DYNAMO_TABLE || 'ChatMessages';

const clientConfig = { region };
if (process.env.DYNAMO_ENDPOINT) {
  clientConfig.endpoint = process.env.DYNAMO_ENDPOINT;
}
const ddb = new DynamoDBClient(clientConfig);
const docClient = DynamoDBDocumentClient.from(ddb);

export async function saveMessageDynamo(message) {
  const item = {
    sessionId: message.sessionId,
    ts: message.timestamp,
    sender: message.sender,
    content: message.content
  };

  await docClient.send(new PutCommand({
    TableName: tableName,
    Item: item
  }));
}

export async function getHistoryDynamo(sessionId) {
  const res = await docClient.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'sessionId = :sid',
    ExpressionAttributeValues: { ':sid': sessionId },
    ScanIndexForward: true
  }));

  return (res.Items || []).map((i) => ({
    sessionId: i.sessionId,
    sender: i.sender,
    content: i.content,
    timestamp: i.ts
  }));
}

