const { ZDSLite } = require('./dist');
const Database = require('better-sqlite3');
const fs = require('fs');

const dbPath = './performance-test.db';

// Clean up previous database file if it exists
const cleanup = () => {
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
};

const NUM_RECORDS = 50000;
const records = [];
for (let i = 0; i < NUM_RECORDS; i++) {
  records.push({
    name: `User ${i}`,
    email: `user${i}@example.com`,
    age: Math.floor(Math.random() * 50) + 20, // Age between 20 and 70
    status: i % 10 === 0 ? 'inactive' : 'active',
  });
}

const searchEmail = `user${Math.floor(NUM_RECORDS / 2)}@example.com`;

async function runPerformanceTest() {
  console.log(`--- 🚀 ZDSLite vs. Raw better-sqlite3 Performance Test (${NUM_RECORDS} records) ---`);

  // --- Test 1: Bulk Insert ---
  console.log('\n--- Test 1: Bulk Insert ---');
  cleanup();
  
  // ZDSLite Insert
  const dsliteInsertDb = new ZDSLite(dbPath);
  await dsliteInsertDb.create('users', { name: 'TEXT', email: 'TEXT', age: 'INTEGER', status: 'TEXT' });
  console.time('ZDSLite Insert');
  await dsliteInsertDb.insert('users', records);
  console.timeEnd('ZDSLite Insert');
  dsliteInsertDb.close();

  // Raw better-sqlite3 Insert
  cleanup();
  const rawInsertDb = new Database(dbPath);
  rawInsertDb.exec('CREATE TABLE users (name TEXT, email TEXT, age INTEGER, status TEXT)');
  const insertStmt = rawInsertDb.prepare('INSERT INTO users (name, email, age, status) VALUES (@name, @email, @age, @status)');
  const insertMany = rawInsertDb.transaction((items) => {
    for (const item of items) insertStmt.run(item);
  });

  console.time('Raw better-sqlite3 Insert');
  insertMany(records);
  console.timeEnd('Raw better-sqlite3 Insert');
  rawInsertDb.close();


  // --- Setup for Query Tests ---
  const db = new ZDSLite(dbPath);
  await db.create('users', { name: 'TEXT', email: 'TEXT UNIQUE', age: 'INTEGER', status: 'TEXT' });
  await db.createIndex('users', ['email']);
  await db.createIndex('users', ['status']);
  await db.insert('users', records);
  db.close();


  // --- Test 2: Simple Search (Indexed) ---
  console.log('\n--- Test 2: Simple Search (Indexed "email") ---');
  
  // ZDSLite Search
  const dsliteSearchDb = new ZDSLite(dbPath);
  console.time('ZDSLite Search');
  await dsliteSearchDb.search('users', { query: { term: { email: searchEmail } } });
  console.timeEnd('ZDSLite Search');
  dsliteSearchDb.close();

  // Raw better-sqlite3 Search
  const rawSearchDb = new Database(dbPath);
  const selectStmt = rawSearchDb.prepare('SELECT * FROM users WHERE email = ?');
  console.time('Raw better-sqlite3 Search');
  selectStmt.get(searchEmail);
  console.timeEnd('Raw better-sqlite3 Search');
  rawSearchDb.close();


  // --- Test 3: Match Search (LIKE) ---
  console.log('\n--- Test 3: Match Search (LIKE on "name") ---');

  // ZDSLite Match
  const dsliteMatchDb = new ZDSLite(dbPath);
  console.time('ZDSLite Match');
  await dsliteMatchDb.search('users', { query: { match: { name: 'User 12345' } } });
  console.timeEnd('ZDSLite Match');
  dsliteMatchDb.close();

  // Raw better-sqlite3 LIKE
  const rawLikeDb = new Database(dbPath);
  const likeStmt = rawLikeDb.prepare("SELECT * FROM users WHERE name LIKE ? AND name LIKE ?");
  console.time('Raw better-sqlite3 LIKE');
  likeStmt.all('%User%', '%12345%');
  console.timeEnd('Raw better-sqlite3 LIKE');
  rawLikeDb.close();


  // --- Test 4: Aggregation ---
  console.log('\n--- Test 4: Aggregation (GROUP BY) ---');

  // ZDSLite Aggregate
  const dsliteAggDb = new ZDSLite(dbPath);
  console.time('ZDSLite Aggregate');
  await dsliteAggDb.aggregate('users', {
    aggs: {
      group_by: ['status'],
      metrics: { user_count: { count: '*' } }
    }
  });
  console.timeEnd('ZDSLite Aggregate');
  dsliteAggDb.close();

  // Raw better-sqlite3 GROUP BY
  const rawAggDb = new Database(dbPath);
  const aggStmt = rawAggDb.prepare('SELECT status, COUNT(*) as user_count FROM users GROUP BY status');
  console.time('Raw better-sqlite3 GROUP BY');
  aggStmt.all();
  console.timeEnd('Raw better-sqlite3 GROUP BY');
  rawAggDb.close();

  cleanup(); // Final cleanup
}

runPerformanceTest().catch(console.error);