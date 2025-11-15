import { ZDSLite, ZDSLiteValidationError, ZDSLiteQueryError } from './index';
import { validate as validateUUID } from 'uuid';

describe('ZDSLite Unit Tests', () => {
  let db: ZDSLite;
  const dbPath = ':memory:';

  // Setup a new in-memory database before each test
  beforeEach(async () => {
    db = new ZDSLite(dbPath);
    await db.create('users', {
      id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
      name: 'TEXT NOT NULL',
      age: 'INTEGER',
      email: 'TEXT UNIQUE',
      status: 'TEXT',
    });
    await db.insert('users', [
      { id: 1, name: 'Alice', age: 30, email: 'alice@example.com', status: 'active' },
      { id: 2, name: 'Bob', age: 45, email: 'bob@example.com', status: 'active' },
      { id: 3, name: 'Charlie', age: 28, email: 'charlie@example.com', status: 'inactive' },
    ]);
  });

  // Teardown the database connection after each test
  afterEach(() => {
    db.close();
  });

  describe('Constructor and Validation', () => {
    it('should connect to an in-memory database', () => {
      expect(db).toBeInstanceOf(ZDSLite);
    });

    it('should throw ZDSLiteValidationError for invalid table names', async () => {
      // Use async/await with expect().rejects for promises
      await expect(db.create('invalid-table!', { id: 'INTEGER' }))
        .rejects.toThrow(ZDSLiteValidationError);
    });

    it('should throw ZDSLiteValidationError for invalid column names', async () => {
      await expect(db.create('test', { 'invalid-column!': 'TEXT' }))
        .rejects.toThrow(ZDSLiteValidationError);
    });
  });

  describe('DML: Insert, Update, Delete, Upsert', () => {
    it('should insert a single document', async () => {
      const result = await db.insert('users', { name: 'David', age: 50, email: 'david@example.com' });
      expect(result.acknowledged).toBe(true);
      expect((result as any).insertedCount).toBe(1);

      const users = await db.search('users', { query: { term: { email: 'david@example.com' } } });
      expect(users.length).toBe(1);
      expect(users[0].name).toBe('David');
    });

    it('should auto-generate UUID for a primary key', async () => {
      await db.create('posts', {
        id: 'UUID PRIMARY KEY',
        title: 'TEXT NOT NULL'
      });

      const insertResult = await db.insert('posts', { title: 'My First Post' });
      expect(insertResult.acknowledged).toBe(true);
      expect((insertResult as any).insertedCount).toBe(1);

      const posts = await db.search('posts', { query: { term: { title: 'My First Post' } } });
      expect(posts.length).toBe(1);
      expect(posts[0].id).toBeDefined();
      // Check if the generated ID is a valid UUID
      expect(validateUUID(posts[0].id)).toBe(true);
    });

    it('should update documents', async () => {
      const result = await db.update('users', { status: 'pending' }, { term: { name: 'Alice' } });
      expect(result.acknowledged).toBe(true);
      expect((result as any).updatedCount).toBe(1);

      const user = await db.search('users', { query: { term: { id: 1 } } });
      expect(user[0].status).toBe('pending');
    });

    it('should delete documents', async () => {
      const result = await db.delete('users', { query: { term: { status: 'inactive' } } });
      expect(result.acknowledged).toBe(true);
      expect((result as any).deletedCount).toBe(1);

      const users = await db.search('users', { query: { term: { name: 'Charlie' } } });
      expect(users.length).toBe(0);
    });

    it('should upsert a new document (INSERT)', async () => {
      const result = await db.upsert('users', { name: 'Eve', age: 25, email: 'eve@example.com' }, 'email');
      expect(result.acknowledged).toBe(true);
      expect((result as any).changes).toBe(1);

      const users = await db.search('users', { query: { term: { email: 'eve@example.com' } } });
      expect(users.length).toBe(1);
    });

    it('should upsert an existing document (UPDATE)', async () => {
      // First, ensure Alice exists
      const initialUser = await db.search('users', { query: { term: { email: 'alice@example.com' } } });
      expect(initialUser[0].age).toBe(30);

      // Now, upsert with the same email but different age
      const result = await db.upsert('users', { email: 'alice@example.com', name: 'Alice', age: 31 }, 'email');
      expect(result.acknowledged).toBe(true);
      expect((result as any).changes).toBe(1);

      const updatedUser = await db.search('users', { query: { term: { email: 'alice@example.com' } } });
      expect(updatedUser.length).toBe(1);
      expect(updatedUser[0].age).toBe(31);
    });
  });

  describe('Hashing', () => {
    const plainPassword = 'my-secret-password';

    beforeEach(async () => {
      await db.create('customers', {
        id: 'INTEGER PRIMARY KEY',
        username: 'TEXT UNIQUE',
        password: 'HASHED'
      });
    });

    it('should automatically hash a password on insert', async () => {
      await db.insert('customers', { id: 1, username: 'testuser', password: plainPassword });
      const user = await db.search('customers', { query: { term: { id: 1 } } });

      expect(user.length).toBe(1);
      expect(user[0].password).not.toBe(plainPassword);
      expect(user[0].password).toMatch(/^zdslite-scrypt:v1:64:[a-f0-9]+:[a-f0-9]+$/); // algorithm:version:keylength:salt:hash
    });

    it('should automatically hash a password on update', async () => {
      await db.insert('customers', { id: 1, username: 'testuser', password: 'old-password' });
      await db.update('customers', { password: plainPassword }, { term: { id: 1 } });
      const user = await db.search('customers', { query: { term: { id: 1 } } });

      expect(user[0].password).not.toBe(plainPassword);
      expect(user[0].password).toMatch(/^zdslite-scrypt:v1:64:/);
    });

    it('should automatically hash a password on upsert', async () => {
      // Test INSERT part of upsert
      await db.upsert('customers', { username: 'newuser', password: plainPassword }, 'username');
      const user = await db.search('customers', { query: { term: { username: 'newuser' } } });
      expect(user[0].password).not.toBe(plainPassword);
      expect(user[0].password).toMatch(/^zdslite-scrypt:v1:64:/);
    });

    it('should correctly verify a valid password', async () => {
      await db.insert('customers', { id: 1, username: 'testuser', password: plainPassword });
      const user = await db.search('customers', { query: { term: { id: 1 } } });
      const storedHash = user[0].password;

      expect(db.verifyPassword(plainPassword, storedHash)).toBe(true);
    });

    it('should reject an invalid password', async () => {
      await db.insert('customers', { id: 1, username: 'testuser', password: plainPassword });
      const user = await db.search('customers', { query: { term: { id: 1 } } });
      const storedHash = user[0].password;

      expect(db.verifyPassword('wrong-password', storedHash)).toBe(false);
    });

    it('needsRehash should return false for a current hash', async () => {
      await db.insert('customers', { id: 1, username: 'testuser', password: plainPassword });
      const user = await db.search('customers', { query: { term: { id: 1 } } });
      expect(db.needsRehash(user[0].password)).toBe(false);
    });

    it('needsRehash should return true for an outdated hash', () => {
      // Simulate old formats
      const oldHash_v0 = 'old-scrypt:v0:64:somesalt:somehash';
      const oldHash_wrongKeyLength = 'dslite-scrypt:v1:32:somesalt:somehash';
      const invalidFormat = 'somesalt:somehash';
      expect(db.needsRehash(oldHash_v0)).toBe(true);
      expect(db.needsRehash(oldHash_wrongKeyLength)).toBe(true);
      expect(db.needsRehash(invalidFormat)).toBe(true);
    });
  });

  describe('Querying: Search and Aggregate', () => {
    it('should search with a term query', async () => {
      const users = await db.search('users', { query: { term: { name: 'Alice' } } });
      expect(users.length).toBe(1);
      expect(users[0].id).toBe(1);
    });

    it('should search with a bool query (must, filter, range)', async () => {
      const users = await db.search('users', {
        query: {
          bool: {
            must: [{ term: { status: 'active' } }],
            filter: [{ range: { age: { gt: 40 } } }]
          }
        }
      });
      expect(users.length).toBe(1);
      expect(users[0].name).toBe('Bob');
    });

    it('should search with a must_not exists query', async () => {
      // Insert a user with a null age
      await db.insert('users', { name: 'Frank', email: 'frank@example.com', status: 'active' });
      const users = await db.search('users', {
        query: {
          bool: {
            must_not: [{ exists: { field: 'age' } }]
          }
        }
      });
      expect(users.length).toBe(1);
      expect(users[0].name).toBe('Frank');
    });

    it('should perform an aggregation', async () => {
      const result = await db.aggregate('users', {
        aggs: {
          group_by: ['status'],
          metrics: {
            user_count: { count: '*' },
            avg_age: { avg: 'age' }
          }
        },
        sort: [{ user_count: 'desc' }]
      });

      expect(result.length).toBe(2);
      expect(result[0].status).toBe('active');
      expect(result[0].user_count).toBe(2);
      expect(result[0].avg_age).toBe((30 + 45) / 2);

      expect(result[1].status).toBe('inactive');
      expect(result[1].user_count).toBe(1);
    });
  });

  describe('Advanced Queries', () => {
    beforeEach(async () => {
      // Create a second table for JOIN tests
      await db.create('orders', {
        order_id: 'INTEGER PRIMARY KEY',
        user_id: 'INTEGER',
        item: 'TEXT',
        quantity: 'INTEGER'
      });
      await db.insert('orders', [
        { user_id: 1, item: 'Laptop', quantity: 1 }, // Alice
        { user_id: 1, item: 'Mouse', quantity: 2 },  // Alice
        { user_id: 2, item: 'Keyboard', quantity: 1 } // Bob
      ]);
    });

    it('should perform a JOIN with _source and aliasing', async () => {
      const results = await db.search('users', {
        _source: ['users.name as user_name', 'orders.item'],
        join: [{
          type: 'LEFT',
          target: 'orders',
          on: { left: 'users.id', right: 'orders.user_id' }
        }],
        query: {
          term: { 'users.name': 'Alice' }
        },
        sort: [{ 'orders.item': 'asc' }]
      });

      expect(results.length).toBe(2);
      expect(results[0]).toEqual({ user_name: 'Alice', item: 'Laptop' });
      expect(results[1]).toEqual({ user_name: 'Alice', item: 'Mouse' });
    });

    it('should search with a multi_match query', async () => {
      const users = await db.search('users', {
        query: {
          multi_match: { query: 'alice', fields: ['name', 'email'] }
        }
      });
      expect(users.length).toBe(1);
      expect(users[0].name).toBe('Alice');
    });

    it('should search with a terms query', async () => {
      const users = await db.search('users', {
        query: {
          terms: { id: [1, 3] }
        },
        sort: [{ id: 'asc' }]
      });
      expect(users.length).toBe(2);
      expect(users[0].name).toBe('Alice');
      expect(users[1].name).toBe('Charlie');
    });

    it('should handle pagination with size and from', async () => {
      const page1 = await db.search('users', { sort: [{ id: 'asc' }], size: 2, from: 0 });
      expect(page1.length).toBe(2);
      expect(page1[0].name).toBe('Alice');
      const page2 = await db.search('users', { sort: [{ id: 'asc' }], size: 2, from: 2 });
      expect(page2.length).toBe(1);
      expect(page2[0].name).toBe('Charlie');
    });
  });

  describe('Transactions', () => {
    it('should commit a successful transaction', async () => {
      await db.transaction(async (tx) => {
        await tx.insert('users', { name: 'Grace', email: 'grace@example.com' });
        await tx.update('users', { status: 'archived' }, { term: { name: 'Charlie' } });
      });

      const grace = await db.search('users', { query: { term: { name: 'Grace' } } });
      const charlie = await db.search('users', { query: { term: { name: 'Charlie' } } });

      expect(grace.length).toBe(1);
      expect(charlie[0].status).toBe('archived');
    });

    it('should rollback a failed transaction', async () => {
      const initialCharlie = await db.search('users', { query: { term: { name: 'Charlie' } } });
      expect(initialCharlie[0].status).toBe('inactive');

      const initialUserCount = (await db.search('users', {})).length;
      expect(initialUserCount).toBe(3);

      // Mock console.error to prevent logging during this expected failure
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // This transaction will fail because of a UNIQUE constraint violation (duplicate email)
      const txPromise = db.transaction(async (tx) => {
        await tx.update('users', { status: 'archived' }, { term: { name: 'Charlie' } });
        // This line will throw a ZDSLiteQueryError
        await tx.insert('users', { name: 'Duplicate Bob', email: 'bob@example.com' });
      });

      // Check that the promise rejects with the correct error type
      await expect(txPromise).rejects.toThrow(ZDSLiteQueryError);

      // Restore the original console.error implementation
      consoleErrorSpy.mockRestore();

      // Verify that the changes were rolled back
      const finalCharlie = await db.search('users', { query: { term: { name: 'Charlie' } } });
      const allUsers = await db.search('users', {});

      // Charlie's status should NOT have changed
      expect(finalCharlie[0].status).toBe('inactive');
      // 'Duplicate Bob' should not exist
      expect(allUsers.length).toBe(initialUserCount);
      expect(allUsers.find(u => u.name === 'Duplicate Bob')).toBeUndefined();
    });
  });
});