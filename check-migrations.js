const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://testyourself_user:pgzsud5ixJRTHMIXdz8wuGDXtLA5MLl1@dpg-d8i90r6q1p3s73efrub0-a.virginia-postgres.render.com/testyourself?sslmode=require',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  const result = await client.query(
    `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at`
  );
  console.table(result.rows);
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });