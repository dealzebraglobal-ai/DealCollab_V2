const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });

async function run() {
  const res = await pool.query("SELECT raw_payload FROM whatsapp_inbound_events WHERE id = '85e0a85f-c759-484c-a577-6e1ef367f309'");
  console.log(JSON.stringify(res.rows[0]?.raw_payload, null, 2));
  await pool.end();
}

run().catch(console.error);
