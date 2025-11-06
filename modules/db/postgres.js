import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'chatdb',
  user: process.env.PGUSER || 'chatuser',
  password: process.env.PGPASSWORD || '',
  ssl: process.env.PGSSL === 'true'
});

export async function saveMessagePostgres(message) {
  const text = `
    INSERT INTO chat_messages (session_id, sender, content, ts)
    VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
  `;
  const values = [message.sessionId, message.sender, message.content, message.timestamp];
  const client = await pool.connect();
  try {
    await client.query(text, values);
  } finally {
    client.release();
  }
}

export async function getHistoryPostgres(sessionId) {
  const text = `
    SELECT session_id, sender, content, extract(epoch from ts) * 1000 as timestamp_ms
    FROM chat_messages
    WHERE session_id = $1
    ORDER BY ts ASC
  `;
  const client = await pool.connect();
  try {
    const res = await client.query(text, [sessionId]);
    return res.rows.map(r => ({
      sessionId: r.session_id,
      sender: r.sender,
      content: r.content,
      timestamp: Math.round(Number(r.timestamp_ms))
    }));
  } finally {
    client.release();
  }
}

