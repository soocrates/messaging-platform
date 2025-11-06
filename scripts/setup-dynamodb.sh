#!/bin/bash
set -euo pipefail

AWS_REGION=${AWS_REGION:-us-east-1}
TABLE_NAME=${DYNAMO_TABLE:-ChatMessages}

aws dynamodb create-table \
  --table-name "$TABLE_NAME" \
  --attribute-definitions \
    AttributeName=sessionId,AttributeType=S \
    AttributeName=ts,AttributeType=N \
  --key-schema \
    AttributeName=sessionId,KeyType=HASH \
    AttributeName=ts,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region "$AWS_REGION" || true

