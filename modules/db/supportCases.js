import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'chatdb',
  user: process.env.PGUSER || 'chatuser',
  password: process.env.PGPASSWORD || '',
  ssl: process.env.PGSSL === 'true'
});

export async function createSupportCase(caseData) {
  const caseId = `CASE-${uuidv4().substring(0, 8).toUpperCase()}`;
  const text = `
    INSERT INTO support_cases (
      case_id, help_type, service, category, severity, 
      subject, description, contact_method, userEmail, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open')
    RETURNING *
  `;
  const values = [
    caseId,
    caseData.helpType,
    caseData.service,
    caseData.category,
    caseData.severity,
    caseData.subject,
    caseData.description,
    caseData.contactMethod,
    caseData.userSessionId || null
  ];

  const client = await pool.connect();
  try {
    const res = await client.query(text, values);
    return res.rows[0];
  } finally {
    client.release();
  }
}

export async function updateCaseStatus(caseId, status, agentId = null) {
  const text = `
    UPDATE support_cases
    SET status = $1, agent_id = $2, updated_at = NOW()
    WHERE case_id = $3
    RETURNING *
  `;
  const client = await pool.connect();
  try {
    const res = await client.query(text, [status, agentId, caseId]);
    return res.rows[0];
  } finally {
    client.release();
  }
}

export async function getCaseByCaseId(caseId) {
  const text = `SELECT * FROM support_cases WHERE case_id = $1`;
  const client = await pool.connect();
  try {
    const res = await client.query(text, [caseId]);
    return res.rows[0] || null;
  } finally {
    client.release();
  }
}

export async function getCasesByStatus(status) {
  const text = `SELECT * FROM support_cases WHERE status = $1 ORDER BY created_at DESC`;
  const client = await pool.connect();
  try {
    const res = await client.query(text, [status]);
    return res.rows;
  } finally {
    client.release();
  }
}
