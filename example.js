const { DSLite } = require('./dist');
const fs = require('fs');

const dbPath = './mydb-ts.sqlite';
// Clean up previous database file for a fresh start
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const db = new DSLite(dbPath);

console.log('--- 🚀 Testing DSLite Library 🚀 ---');

(async () => {
  try {
    // --- 1. Schema and Index Management ---
    console.log('\n--- 1. Creating tables and indexes ---');
    await db.create('products', {
      id: 'INTEGER PRIMARY KEY',
      name: 'TEXT NOT NULL',
      description: 'TEXT',
      category: 'TEXT',
      price: 'INTEGER',
      status: 'TEXT'
    });
    await db.createIndex('products', ['category']);
    console.log('✅ "products" table and index created.');

    await db.create('inventory', {
      id: 'INTEGER PRIMARY KEY',
      product_id: 'INTEGER',
      stock: 'INTEGER',
      location: 'TEXT'
    });
    console.log('✅ "inventory" table created.');

    // --- 2. Inserting Data ---
    console.log('\n--- 2. Inserting data ---');
    await db.insert('products', [
      { id: 1, name: 'Laptop Pro', description: 'A fast new laptop.', category: 'electronics', price: 1200, status: 'active' },
      { id: 2, name: 'Gaming Mouse', description: 'A fast responsive mouse.', category: 'electronics', price: 75, status: 'active' },
      { id: 3, name: 'Old Monitor', description: 'A 1080p monitor.', category: 'electronics', price: 150, status: 'discontinued' },
      { id: 4, name: 'Office Chair', description: 'Ergonomic chair for long hours.', category: 'furniture', price: 350, status: 'active' },
      { id: 5, name: 'Desk Lamp', description: 'A bright LED lamp.', category: 'furniture', price: 45, status: null },
    ]);
    await db.insert('inventory', [
      { product_id: 1, stock: 50, location: 'Warehouse A' },
      { product_id: 2, stock: 200, location: 'Warehouse B' },
      { product_id: 4, stock: 100, location: 'Warehouse A' },
    ]);
    console.log('✅ Data inserted into both tables.');

    // --- 3. Basic and Complex Search Queries ---
    console.log('\n--- 3. Running search queries ---');

    console.log('\n▶️ Find "fast laptop" (match query):');
    const fastLaptop = await db.search('products', { query: { match: { description: 'fast laptop' } } });
    console.log(JSON.stringify(fastLaptop, null, 2));

    console.log('\n▶️ Find electronics cheaper than $100 (bool with filter and range):');
    const cheapElectronics = await db.search('products', {
      query: {
        bool: {
          filter: [
            { term: { category: 'electronics' } },
            { range: { price: { lt: 100 } } }
          ]
        }
      },
      sort: [{ price: 'desc' }]
    });
    console.log(JSON.stringify(cheapElectronics, null, 2));

    console.log('\n▶️ Find items with NULL status (must_not exists):');
    const nullStatus = await db.search('products', { query: { bool: { must_not: [{ exists: { field: 'status' } }] } } });
    console.log(JSON.stringify(nullStatus, null, 2));

    console.log('\n▶️ Find products using JOIN to get stock level:');
    const productsWithStock = await db.search('products', {
      _source: ['products.name as product_name', 'inventory.stock', 'inventory.location'],
      join: [{
        target: 'inventory',
        on: { left: 'products.id', right: 'inventory.product_id' }
      }],
      query: {
        range: { 'inventory.stock': { gte: 100 } }
      }
    });
    console.log(JSON.stringify(productsWithStock, null, 2));

    // --- 4. Aggregations ---
    console.log('\n--- 4. Running aggregations ---');
    console.log('\n▶️ Calculate average price and count per category:');
    const categoryAggs = await db.aggregate('products', {
      aggs: {
        group_by: ['category'],
        metrics: {
          product_count: { count: 'id' },
          average_price: { avg: 'price' }
        }
      },
      query: { term: { status: 'active' } } // Aggregate only on active products
    });
    console.log(JSON.stringify(categoryAggs, null, 2));

    // --- 5. Update and Delete ---
    console.log('\n--- 5. Running update and delete operations ---');

    console.log('\n▶️ Updating price for "Gaming Mouse":');
    const updateResult = await db.update(
      'products',
      { price: 80 }, // new values
      { term: { name: 'Gaming Mouse' } } // where clause
    );
    console.log(`✅ Documents updated: ${updateResult.updatedCount}`);
    const updatedMouse = await db.search('products', { query: { term: { id: 2 } } });
    console.log('After update:', JSON.stringify(updatedMouse, null, 2));

    console.log('\n▶️ Deleting "Old Monitor":');
    const deleteResult = await db.delete('products', {
      query: { term: { name: 'Old Monitor' } }
    });
    console.log(`✅ Documents deleted: ${deleteResult.deletedCount}`);

    // --- 6. Transactions ---
    console.log('\n--- 6. Testing transactions ---');
    console.log('\n▶️ Running a transaction that should succeed:');
    try {
      await db.transaction(async (tx) => {
        await tx.insert('products', { id: 6, name: 'New Keyboard', category: 'electronics', price: 120 });
        await tx.update('inventory', { stock: 190 }, { term: { product_id: 2 } });
      });
      console.log('✅ Transaction committed successfully.');
    } catch (e) {
      console.error('❌ Transaction failed:', e.message);
    }

    console.log('\n▶️ Running a transaction that should fail and rollback:');
    try {
      await db.transaction(async (tx) => {
        await tx.insert('products', { id: 7, name: 'Faulty Item' });
        // This will fail because 'name' is NOT NULL, but we are not providing it
        await tx.insert('products', { id: 8, price: 999 });
      });
    } catch (e) {
      console.error(`❌ Transaction correctly failed and rolled back: ${e.message}`);
      const faultyItem = await db.search('products', { query: { term: { id: 7 } } });
      console.log('Is faulty item in DB?', faultyItem.length > 0 ? 'Yes' : 'No');
    }

    console.log('\n--- ✅ All tests completed successfully! ---');

  } catch (error) {
    console.error('\n--- ❌ An unexpected error occurred ---');
    console.error(error);
  }
})();