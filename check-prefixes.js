const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  console.log('--- Distinct bucket-name prefixes found in legacy Wasabi URLs ---');
  const res = await client.query(
    `SELECT DISTINCT split_part(split_part("fileUrl", '.wasabisys.com/', 2), '/', 1) AS prefix
     FROM "StudyMaterial"
     WHERE "fileUrl" ILIKE '%wasabisys%'`
  );
  console.log(JSON.stringify(res.rows, null, 2));

  console.log('--- Count of legacy Wasabi vs other files ---');
  const counts = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE "fileUrl" ILIKE '%wasabisys%') AS wasabi_count,
       COUNT(*) AS total
     FROM "StudyMaterial"`
  );
  console.log(JSON.stringify(counts.rows, null, 2));

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
