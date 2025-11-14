### 🚀 DSLite

DSLite (DSL-ite) is a lightweight Node.js library that acts as a Query Builder Abstraction Layer for SQLite (using `better-sqlite3`). It allows you to build and query your SQLite database using a familiar, JSON-based DSL (Domain Specific Language).

The goal of this project is to bring the power and flexibility of a complex query DSL to the simplicity and speed of SQLite.

-----

### ✨ Features

  * **Familiar DSL Syntax:** Use `query`, `bool`, `match`, `term`, `range`, `exists`, and more.
  * **Full CRUD Support:** `create`, `insert`, `update`, `delete`, and `drop`.
  * **Powerful Querying:** `search` and `aggregate` (Group By) capabilities.
  * **JOINs Support:** Easily connect data across multiple tables.
  * **JSON Field Querying:** Query and update data nested inside JSON columns (`meta->>path`).
  * **Transactions:** `db.transaction(...)` support for guaranteed data integrity.
  * **Indexing:** Create and drop indices (`createIndex`, `dropIndex`) for maximum performance.
  * **TypeScript-first:** Built with TypeScript, providing full auto-complete and type-safety.
  * **Secure:** Built-in protection against SQL Injection for both values (via Prepared Statements) and identifiers (via validation).

-----

### 🛡️ Security First

DSLite is designed with security as a top priority, providing robust protection against SQL injection attacks.

1.  **Value Injection (100% Secure)**
    All data values provided in queries (e.g., in `term`, `match`, `range`, or `update` clauses) are **always** handled using **prepared statements**. This means that user-supplied data is sent to the database engine separately from the SQL command, making it impossible for a malicious value to be executed as code.

    ```javascript
    // SAFE: The value 'admin'--' is treated as a literal string, not code.
    await db.search('users', { query: { term: { name: "admin'--" } } });
    ```

2.  **Identifier Injection (Secure by Validation)**
    All schema identifiers—such as table names, column names, and aliases—are rigorously validated against a strict whitelist (`/^[a-zA-Z0-9_]+$/`). If an identifier contains any potentially dangerous characters (e.g., `;`, `'`, `     `), DSLite will immediately throw a `DSLiteValidationError` to prevent the query from ever reaching the database.

    ```javascript
    // THROWS ERROR: This will fail validation before running.
    await db.create("users; DROP TABLE users; --", { id: 'INTEGER' });
    ```

-----

### ⚡ Performance

While DSLite provides a powerful abstraction layer, it's important to understand its performance characteristics compared to writing raw `better-sqlite3` queries. A benchmark was run on a standard developer machine with **50,000 records**.

| Operation | DSLite | Raw `better-sqlite3` | Analysis |
| :--- | :--- | :--- | :--- |
| **Bulk Insert** | \~51ms | \~87ms | DSLite's internal transaction logic is highly optimized, leading to excellent performance. |
| **Simple Search (Indexed)** | \~0.35ms | \~0.02ms | For ultra-fast indexed lookups, the DSL parsing adds a small, fixed overhead. |
| **Match Search (LIKE)** | \~9.3ms | \~8.8ms | As query complexity increases, the DSL overhead becomes negligible. |
| **Aggregation (GROUP BY)**| \~5.0ms | \~4.0ms | Performance is very close, making the DSL a great choice for complex reports. |

**Conclusion:** DSLite introduces a minimal, sub-millisecond overhead on most queries in exchange for a safer, more readable, and more maintainable codebase. For the vast majority of applications, this trade-off is highly beneficial.

-----

### 📦 Installation

DSLite requires `better-sqlite3` as a peer dependency. This gives you control over the specific version of `better-sqlite3` used in your project.

You must install both libraries:

```bash
# Install the libraries
npm install dslite better-sqlite3

# (For TypeScript users) Install types
npm install @types/better-sqlite3 --save-dev
```

-----

### 🚀 Quick Start

Here is a basic example of how to use DSLite:

```javascript
// example.js
const { DSLite } = require('dslite'); // or import { DSLite } from 'dslite';
const fs = require('fs');

const dbPath = './mydb.sqlite';
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); // Clear old DB (if any)

// 1. Create a DSLite Instance
const db = new DSLite(dbPath);

(async () => {
  // 2. Create a table
  await db.create('users', {
    id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
    name: 'TEXT',
    age: 'INTEGER',
    status: 'TEXT'
  });

  // 3. Insert data (Bulk Insert)
  await db.insert('users', [
    { name: 'Alice', age: 30, status: 'active' },
    { name: 'Bob', age: 25, status: 'active' },
    { name: 'Charlie', age: 35, status: 'inactive' }
  ]);

  // 4. Search for data
  console.log('Finding active users over 25:');
  
  const results = await db.search('users', {
    query: {
      bool: {
        must: [
          { term: { status: 'active' } }
        ],
        filter: [
          { range: { age: { gt: 25 } } }
        ]
      }
    },
    sort: [
      { age: 'asc' }
    ]
  });

  console.log(JSON.stringify(results, null, 2));
  /*
  [
    { "id": 1, "name": "Alice", "age": 30, "status": "active" }
  ]
  */
})();
```

-----

### 📖 DSL Query Syntax Reference

The `dslQuery` object used in `search` and `aggregate` consists of the following parts:

#### 1\. The Query Clause (`query: { ... }`)

This defines the conditions (SQL `WHERE`) (a `DslQueryClause` object).

  * **`term: { field: value }`**
    Exact match (SQL: `field = ?`)
    `{ "term": { "status": "active" } }`

  * **`terms: { field: [val1, val2] }`**
    Match any value in the array (SQL: `field IN (?, ?)`)
    `{ "terms": { "id": [1, 2, 5] } }`

  * **`match: { field: "query words" }`**
    Tokenizes the query string and finds documents containing all terms (AND).
    `{ "match": { "description": "fast laptop" } }`
    (SQL: `description LIKE '%fast%' AND description LIKE '%laptop%'`)

  * **`match_phrase: { field: "query phrase" }`**
    Matches the exact phrase (SQL: `field LIKE '%fast laptop%'`)
    `{ "match_phrase": { "description": "fast laptop" } }`

  * **`multi_match: { query: "...", fields: [...] }`**
    Performs a `match` query across multiple fields (OR).
    `{ "multi_match": { "query": "fast", "fields": ["name", "description"] } }`

  * **`range: { field: { op: value } }`**
    Finds numbers or dates within a range (Operators: `gt`, `gte`, `lt`, `lte`).
    `{ "range": { "age": { "gte": 18, "lt": 65 } } }`

  * **`exists: { field: "field_name" }`**
    Finds documents where the field has a non-null value (SQL: `field IS NOT NULL`).
    `{ "exists": { "field": "status" } }`

  * **`bool: { ... }`**
    Combines multiple queries.

      * `must`: All queries must be true (AND).
      * `filter`: Same as `must` (AND).
      * `must_not`: All queries must be false (NOT).
      * `should`: At least one query should be true (OR). (Only applies if `must/filter` are not used).

    <!-- end list -->

    ```json
    {
      "bool": {
        "must": [ { "term": { "status": "active" } } ],
        "must_not": [ { "exists": { "field": "banned_at" } } ],
        "should": [
          { "term": { "category": "electronics" } },
          { "term": { "category": "books" } }
        ]
      }
    }
    ```

#### 2\. JSON Path Querying (`"field->>path"`)

You can use the `"column_name->>json.path"` syntax as a "field name" in **all** parts of the DSL (term, range, sort, group\_by, metrics).

```json
// Find WHERE meta->>'$.details.cpu' = 'm3'
{ "term": { "meta->>details.cpu": "m3" } }

// Sort ORDER BY meta->>'$.price' DESC"
"sort": [ { "meta->>price": "desc" } ]

// Group GROUP BY meta->>'$.category'
"aggs": { "group_by": ["meta->>category"] }
```

#### 3\. Joining Tables (`join: [ ... ]`)

Defines table joins.

```json
"join": [
  {
    "type": "LEFT", // (INNER, LEFT, RIGHT, FULL)
    "target": "users", // Table to join
    "on": {
      "left": "posts.user_id", // Field from main table
      "right": "users.id"      // Field from target table
    }
  }
]
```

#### 4\. Selecting Fields (`_source: [ ... ]`)

Specifies which columns to `SELECT` (default is `SELECT *`).

```json
"_source": [
  "id",
  "name",
  "posts.title", // Field from a joined table
  "users.name as author_name" // Aliasing a field
]
```

#### 5\. Aggregations (`aggs: { ... }`)

Used only in `db.aggregate()`.

```json
"aggs": {
  // (Optional) Columns to GROUP BY
  "group_by": ["status", "meta->>category"], 
  
  // (Optional) Metrics to calculate
  "metrics": {
    "my_count_name": { "count": "*" },
    "total_stock": { "sum": "stock" },
    "avg_price": { "avg": "meta->>price" },
    "min_age": { "min": "age" },
    "max_age": { "max": "age" }
  }
}
```

#### 6\. Sorting & Pagination

  * **`sort: [ { field: "direction" } ]`**
    `direction` is `asc` (ascending) or `desc` (descending).
    `"sort": [ { "age": "desc" }, { "name": "asc" } ]`

  * **`size: number`**
    The maximum number of results to return (SQL `LIMIT`).
    `"size": 10`

  * **`from: number`**
    The number of results to skip (SQL `OFFSET`).
    `"from": 20` (e.g., page 3, if `size` is 10)

-----

### 📚 API Reference

`new DSLite(dbPath)`
Creates a new connection to the SQLite database.

  * `dbPath`: (string) The path to the `.sqlite` file (e.g., `./mydb.sqlite`) or `:memory:` for an in-memory database.

#### 🗄️ DDL (Data Definition Language)

  * **`async create(table, columns)`**
    Creates a new table (if it doesn't already exist).

    ```javascript
    await db.create('products', {
      id: 'INTEGER PRIMARY KEY',
      name: 'TEXT NOT NULL',
      meta: 'TEXT' // Used to store JSON
    });
    ```

  * **`async drop(table)`**
    Drops an entire table.

    ```javascript
    await db.drop('products');
    ```

  * **`async createIndex(table, fields, options = {})`**
    Creates an index on one or more columns to speed up queries.

    ```javascript
    // Create a simple index
    await db.createIndex('users', ['email']);
    // Create a unique index
    await db.createIndex('users', ['username'], { unique: true });
    // Create an index on a JSON field
    await db.createIndex('products', ['meta->>category']);
    ```

  * **`async dropIndex(indexName)`**
    Drops an index from the database.

    ```javascript
    await db.dropIndex('idx_users_email');
    ```

#### ✏️ DML (Data Manipulation Language)

  * **`async insert(table, data)`**
    Inserts a single document or an array of documents (bulk insert).

    ```javascript
    // Single row
    await db.insert('users', { name: 'David', age: 40 });
    // Multiple rows (bulk)
    await db.insert('users', [
      { name: 'Eve', age: 28 },
      { name: 'Frank', age: 50 }
    ]);
    // JSON objects are automatically stringified
    await db.insert('products', { name: 'Laptop', meta: { price: 1200 } });
    ```

  * **`async update(table, doc, query)`**
    Updates documents that match the `query` (must be a `DslQueryClause`).

    ```javascript
    // Update a standard field
    await db.update(
      'users',
      { status: 'pending' }, // SET
      { term: { name: 'Alice' } } // WHERE (DslQueryClause)
    );

    // Update a nested JSON field
    await db.update(
      'products',
      { "meta->>price": 1150, "meta->>stock": 10 }, // SET
      { term: { name: 'Laptop' } } // WHERE
    );
    ```

  * **`async delete(table, query)`**
    Deletes documents that match the `query` (must be nested inside a `query` object).

    ```javascript
    await db.delete('users', {
      query: { // 'query' key is required
        term: { status: 'inactive' }
      }
    });
    ```

#### 📊 Querying & Aggregation

  * **`async search(table, dslQuery)`**
    Searches for data using a complex DSL query (takes a `DslQuery` object).

    ```javascript
    const results = await db.search('posts', {
      _source: ["posts.title as post_title", "users.name as author"],
      query: {
        bool: {
          must: [ { term: { "posts.status": "published" } } ],
          must_not: [ { exists: { field: "users.banned_at" } } ]
        }
      },
      join: [
        {
          type: "LEFT",
          target: "users",
          on: { left: "posts.user_id", right: "users.id" }
        }
      ],
      sort: [ { "posts.id": "desc" } ],
      size: 10,
      from: 0 // (Offset)
    });
    ```

  * **`async aggregate(table, dslQuery)`**
    Performs an aggregation query (SQL `GROUP BY`) (takes a `DslQuery` object).

    ```javascript
    const stats = await db.aggregate('products', {
      query: { // (Optional) WHERE clause
        term: { "meta->>category": "electronics" }
      },
      aggs: {
        group_by: ["meta->>category", "status"], // GROUP BY
        metrics: {
          total_stock: { sum: "stock" },   // SUM(...)
          avg_price: { avg: "meta->>price" }, // AVG(...)
          item_count: { count: "*" }         // COUNT(*)
        }
      },
      sort: [
        { total_stock: "desc" } // Can sort by metric alias
      ]
    });
    ```

#### 🔏 Transactions

  * **`async transaction(callback)`**
    Executes a series of commands in a transaction. If any command throws an error, the entire transaction is automatically rolled back.
    ```javascript
    // Example: Transferring funds
    try {
      const txResult = await db.transaction(async (tx) => {
        // 'tx' is the db instance, bound to the transaction
        
        // 1. Debit Alice's account
        await tx.update('accounts', { balance: 700 }, { term: { id: 1 } });
        
        // 2. Credit Bob's account
        await tx.update('accounts', { balance: 800 }, { term: { id: 2 } });
        
        // 3. (Simulate) If this step fails...
        if (true) {
          throw new Error('Something went wrong!');
        }
        
        // 4. Log the transfer (This line will not be reached)
        await tx.insert('log', { message: 'Transfer complete' });
      });
      
      // (This line will not be reached if an error is thrown)
      console.log('Commit success:', txResult.committed);

    } catch (txError) {
      // The error is thrown, ROLLBACK is automatic.
      // Alice's and Bob's balances remain unchanged.
      console.error('Transaction failed:', txError.message);
    }
    ```

-----

### 🛡️ Error Handling

DSLite uses custom error classes that extend the base `DSLiteError`, allowing for precise `try...catch` blocks.

  * **`DSLiteValidationError`**: Thrown when input validation fails before a query is run. This includes invalid table/column names or missing required parameters.
  * **`DSLiteQueryError`**: Thrown when a database query fails during execution. This error contains a `cause` property with the original database driver error and a `sql` property with the failed SQL query, making debugging much easier.

You can catch these errors using `instanceof`:

```javascript
import { DSLite, DSLiteValidationError, DSLiteQueryError } from 'dslite';

const db = new DSLite(':memory:');

try {
  // This will throw a DSLiteValidationError
  await db.create('invalid-table-name!', { id: 'INTEGER' });

} catch (error) {
  if (error instanceof DSLiteValidationError) {
    console.error('Validation Error:', error.message);
  } else if (error instanceof DSLiteQueryError) {
    console.error('Query Execution Error:', error.message);
    // You can inspect the original error and the failed SQL
    console.error('Original Cause:', error.cause);
    console.error('Failed SQL:', error.sql);
  } else {
    console.error('An unexpected error occurred:', error);
  }
}
```

-----

### 🗺️ Roadmap

DSLite is fairly complete, but future features could include:

  * **FTS5 Integration:** True Full-Text Search support from SQLite to make `match` queries faster and smarter (e.g., stemming, ranking).
  * **Schema Migration:** A helper utility for managing schema updates.

-----

### 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".

**Reporting Bugs**

1.  Check the **Issues** tab to see if the bug has already been reported.
2.  If not, open a new issue.
3.  Please provide a clear title, a description of the bug, and **clear steps to reproduce** the issue.

**Pull Request Process**

1.  **Fork** the repository.
2.  **Clone** your fork locally: `git clone https://github.com/YOUR-USERNAME/dslite.git`
3.  **Install** dependencies: `npm install`
4.  **Create** your feature branch: `git checkout -b feature/MyAmazingFeature`
5.  **Make** your changes in the `src/` directory.
6.  **Add tests\!** Please add or update tests to cover your changes.
7.  **Ensure** all tests pass: `npm test`
8.  **Build** the project: `npm run build` (This ensures your TypeScript compiles correctly)
9.  **Commit** your changes: `git commit -m "feat: Add some amazing feature"`
10. **Push** to your branch: `git push origin feature/MyAmazingFeature`
11. **Open** a Pull Request against the `main` branch of the original repository.
12. **Provide** a clear description of your changes in the PR.

-----

### ✍️ Author

Created and maintained by **Zynapse Link**.

-----

### 📄 License

ISC