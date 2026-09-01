const { Pool } = require('pg');
const pool = new Pool({ 
  connectionString: (process.env.DATABASE_URL || '').replace(/:6543\//, ':5432/'),
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    const r = await pool.query("SELECT id FROM users WHERE id = $1 LIMIT 1", ['123456789']);
    console.log('RESULT:', r.rows);
  } catch (e) {
    console.error('ERROR TYPE:', e.constructor.name);
    console.error('ERROR CODE:', e.code);
    console.error('ERROR MSG:', e.message);
  } finally {
    await pool.end();
  }
}
test();
