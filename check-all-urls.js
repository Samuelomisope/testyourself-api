const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  const res = await client.query(
    `SELECT id, "fileUrl",
            split_part(split_part("fileUrl", '.wasabisys.com/', 2), '/', 1) AS prefix
     FROM "StudyMaterial"
     WHERE "fileUrl" ILIKE '%wasabisys%'
     ORDER BY prefix`
  );

  for (const row of res.rows) {
    console.log(`[${row.prefix}] ${row.fileUrl}`);
  }

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
