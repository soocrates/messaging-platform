# Messaging Platform (WebSocket Chat)

Secure, real-time Node.js WebSocket chat backend with DynamoDB and Postgres persistence, optional AWS Cognito authentication, and a simple frontend demo.

## Project Structure
```
.
├── server.js
├── package.json
├── public/
│   ├── index.html
│   └── client.js
├── modules/
│   ├── sessionManager.js
│   ├── aws/
│   │   └── lexConnect.js
│   └── db/
│       ├── index.js
│       ├── dynamo.js
│       └── postgres.js
├── utils/
│   ├── auth.js
│   ├── security.js
│   └── logger.js
├── scripts/
│   ├── setup-postgres.sql
│   └── setup-dynamodb.sh
├── .env (create from .env.sample)
└── README.md
```

## Prerequisites
- Node.js 18+
- Postgres (local or remote)
- DynamoDB table (existing table or create one using the setup script)
- Optional: AWS Cognito (if `REQUIRE_AUTH=true`)

## Environment Setup
Create `.env` from `.env.sample` and set values:

```
PORT=8080
HOST=0.0.0.0
ALLOWED_ORIGINS=http://localhost:8080
SESSION_HMAC_SECRET=<long_random_secret>

# Cognito (optional)
REQUIRE_AUTH=false
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=

# DynamoDB
AWS_REGION=us-east-1
DYNAMO_TABLE=ChatMessages
# DYNAMO_ENDPOINT=http://localhost:8000

# Postgres
PGHOST=localhost
PGPORT=5432
PGDATABASE=chatdb
PGUSER=chatuser
PGPASSWORD=yourpassword
PGSSL=false
```

## How to Run
1) Install dependencies
```
npm install
```

2) Initialize Postgres schema
```
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -f scripts/setup-postgres.sql
```

3) Create DynamoDB table (optional - skip if you already have a table)
```
chmod +x scripts/setup-dynamodb.sh
./scripts/setup-dynamodb.sh
```
Note: Ensure your existing DynamoDB table has `sessionId` (String) as partition key and `ts` (Number) as sort key.

4) Start the server
```
npm start
```

5) Open the demo UI
```
http://localhost:8080
```

## Using the App
- New session: leave Session ID/Token blank and click Connect. The server responds with `sessionId` and `token`.
- Reconnect: reuse Session ID and Token.
- History: click "Load History". The client sends `x-session-id` and `x-session-token`. If `REQUIRE_AUTH=true`, include a Cognito ID token (paste it into the UI) for both WebSocket connect and history requests.

## API Reference
WebSocket connect:
```
ws://host:port/?sessionId=<id>&token=<hmac>&idToken=<cognitoIdToken>
```

REST history:
```
GET /history/:sessionId
Headers:
  x-session-id: <sessionId>
  x-session-token: <hmac>
  Authorization: Bearer <idToken>   # required if REQUIRE_AUTH=true
```
