import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { fromIni } from '@aws-sdk/credential-provider-ini';

const region = process.env.AWS_REGION || 'us-east-1';
const tableName = process.env.DYNAMO_TABLE || 'ChatMessages_csas_core';

const clientConfig = { region };

if (process.env.AWS_PROFILE) {
  clientConfig.credentials = fromIni({ profile: process.env.AWS_PROFILE });
  console.log(`👤 Using AWS CLI profile: ${process.env.AWS_PROFILE}`);
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

