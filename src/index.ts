import Database from 'better-sqlite3';
import {
  SqlValue, SqlResult, DslQueryClause, DslJoin, DslSort, DslQuery, DslRunResult,
  CreateResult, DropResult, IndexResult, InsertResult, UpdateResult, DeleteResult,
  UpsertResult, TxResult, ManualTxResult, BoolQuery, MatchQuery, MatchPhraseQuery, MultiMatchQuery,
  ExistsQuery, RangeQuery, TermQuery, TermsQuery
} from './types';

// Re-export types and errors for public API
export * from './types';
export * from './errors';
import { DSLiteValidationError, DSLiteQueryError } from './errors';

/**
 * The main class for interacting with a SQLite database using a JSON-based DSL.
 * It provides methods for schema management, CRUD operations, complex queries, and transactions.
 */
export class DSLite {
  private db: Database.Database;
  
  // Regex for validating safe identifiers.
  // Allows: letters, numbers, and underscores.
  private static readonly SAFE_IDENTIFIER_REGEX = /^[a-zA-Z0-9_]+$/;

  /**
   * Creates an instance of DSLite and connects to the database.
   * @param dbPath The path to the SQLite database file, or ':memory:' for an in-memory database.
   * @throws {Error} If the database connection fails.
   */
  constructor(dbPath: string) {
    try {
      this.db = new Database(dbPath);
    } catch (error: any) {
      console.error("Failed to connect to SQLite:", error);
      throw error;
    }
  }

  /**
   * Closes the database connection.
   */
  public close(): void {
    this.db.close();
  }

  // Identifier validation function.
  private _validateIdentifier(identifier: string, context: string = 'Identifier'): void {
    if (!DSLite.SAFE_IDENTIFIER_REGEX.test(identifier)) {
      // Throws a validation error if unsafe characters are found.
      throw new DSLiteValidationError(`Invalid characters detected in ${context}: ${identifier}`);
    }
  }

  /**
   * Executes a raw SQL query with parameters.
   * This is a low-level method. Prefer other DML methods where possible.
   * @param sql The raw SQL string to execute.
   * @param params An array of parameters to bind to the query.
   * @returns {DslRunResult} The result of the query execution. It includes an `error` property on failure.
   */
  public run(sql: string, params: SqlValue[] = []): DslRunResult {
    try {
      // Using .prepare() and params prevents SQL Injection for values.
      return this.db.prepare(sql).run(params as any);
    } catch (error: any) {
      console.error("Run query failed:", error, { sql, params });
      return { changes: 0, lastInsertRowid: 0, error: new DSLiteQueryError('Run query failed', { cause: error, sql }) };
    }
  }

  // --- Data Definition Language (DDL) Methods ---

  /**
   * Creates a new table in the database if it doesn't already exist.
   * @param table The name of the table to create.
   * @returns {Promise<CreateResult>} A promise that resolves with the creation result.
   * @throws {DSLiteValidationError} If table or column names are invalid.
   */
  public async create(table: string, columns: Record<string, string>): Promise<CreateResult> {
    if (!table || !columns || Object.keys(columns).length === 0) throw new DSLiteValidationError('Table and columns are required.');
    
    // SECURE: Validate the table name.
    this._validateIdentifier(table, 'table name');
    
    const defs = Object.entries(columns).map(([key, value]) => {
      // SECURE: Validate the column name.
      this._validateIdentifier(key, 'column name');
      // Note: The value (e.g., "TEXT NOT NULL") is considered developer input, not user input.
      // If this value came from a user, it would require stricter validation.
      return `\`${key}\` ${value}`;
    }).join(', ');
    
    const sql = `CREATE TABLE IF NOT EXISTS \`${table}\` (${defs})`;
    try { this.run(sql); return { acknowledged: true, table: table }; }
    catch (error: any) { return { acknowledged: false, error: new DSLiteQueryError('Create table failed', { cause: error, sql }) }; }
  }

  /**
   * Drops a table from the database if it exists.
   * @param table The name of the table to drop.
   * @returns {Promise<DropResult>} A promise that resolves with the drop result.
   * @throws {DSLiteValidationError} If the table name is invalid.
   */
  public async drop(table: string): Promise<DropResult> {
    if (!table) throw new DSLiteValidationError('Table name is required for drop.');
    // SECURE: Validate the table name.
    this._validateIdentifier(table, 'table name');
    const sql = `DROP TABLE IF EXISTS \`${table}\``;
    try { this.run(sql); return { acknowledged: true, table: table }; }
    catch (error: any) { return { acknowledged: false, error: new DSLiteQueryError('Drop table failed', { cause: error, sql }) }; }
  }

  /**
   * Creates an index on one or more columns to speed up queries.
   * @param table The name of the table to create the index on.
   * @param fields An array of column names to include in the index. Can include JSON accessors.
   * @param options Optional settings for the index.
   * @param options.unique If true, creates a UNIQUE index.
   * @param options.name A custom name for the index.
   * @returns {Promise<IndexResult>} A promise that resolves with the index creation result.
   */
  public async createIndex(table: string, fields: string[], options: { unique?: boolean; name?: string } = {}): Promise<IndexResult> {
    if (!table || !Array.isArray(fields) || fields.length === 0) throw new DSLiteValidationError('Table name and at least one field are required.');
    
    // SECURE: Validate the table name.
    this._validateIdentifier(table, 'table name');
    
    const indexName = options.name || `idx_${table}_${fields.join('_').replace(/->>/g, '_')}`;
    
    // SECURE: Validate the index name (in case it's user-defined).
    this._validateIdentifier(indexName, 'index name');
    
    // SECURE: Fields are validated by _quoteField.
    const quotedFields = fields.map(f => this._quoteField(f)).join(', ');
    
    const uniqueSql = options.unique === true ? 'UNIQUE' : '';
    const sql = `CREATE ${uniqueSql} INDEX IF NOT EXISTS \`${indexName}\` ON \`${table}\` (${quotedFields})`;
    try { this.run(sql); return { acknowledged: true, indexName: indexName }; }
    catch (error: any) { console.error("Create index failed:", error, { sql }); return { acknowledged: false, error: new DSLiteQueryError('Create index failed', { cause: error, sql }) }; }
  }

  /**
   * Drops an index from the database.
   * @param indexName The name of the index to drop.
   * @returns {Promise<IndexResult>} A promise that resolves with the index drop result.
   * @throws {DSLiteValidationError} If the index name is invalid.
   */
  public async dropIndex(indexName: string): Promise<IndexResult> {
    if (!indexName) throw new DSLiteValidationError('Index name is required for dropIndex.');
    // SECURE: Validate the index name.
    this._validateIdentifier(indexName, 'index name');
    const sql = `DROP INDEX IF EXISTS \`${indexName}\``;
    try { this.run(sql); return { acknowledged: true, indexName: indexName }; }
    catch (error: any) { console.error("Drop index failed:", error, { sql }); return { acknowledged: false, error: new DSLiteQueryError('Drop index failed', { cause: error, sql }) }; }
  }

  // --- Data Manipulation Language (DML) Methods ---

  /**
   * Inserts a single document or an array of documents into a table.
   * @param table The name of the table.
   * @param data A single data object or an array of objects to insert.
   * @returns {Promise<InsertResult>} A promise that resolves with the insert result.
   */
  public async insert(table: string, data: object | object[]): Promise<InsertResult> {
    if (!table || !data) throw new DSLiteValidationError('Table and data are required for insert.');
    
    // SECURE: Validate the table name.
    this._validateIdentifier(table, 'table name');
    
    const items = Array.isArray(data) ? data : [data];
    if (items.length === 0) return { acknowledged: true, insertedCount: 0 };
    
    const keys = Object.keys(items[0]);
    // SECURE: Validate column names.
    keys.forEach(k => this._validateIdentifier(k, 'column name'));
    
    const keysSql = keys.map(k => `\`${k}\``).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO \`${table}\` (${keysSql}) VALUES (${placeholders})`;
    try {
      // Use a transaction for inserting multiple items efficiently.
      const stmt = this.db.prepare(sql);
      const insertMany = this.db.transaction((itemsToInsert: object[]) => {
        let count = 0;
        for (const item of itemsToInsert) {
          const params = Object.values(item).map(val => (typeof val === 'object' && val !== null) ? JSON.stringify(val) : val);
          // Values are sent as parameters (safe).
          const info = stmt.run(params as any); if (info.changes > 0) count++;
        } return count;
      });
      const insertedCount = insertMany(items);
      return { acknowledged: true, insertedCount: insertedCount };
    } catch (error: any) {
      console.error("Insert query failed:", error, { sql });
      const queryError = new DSLiteQueryError('Insert query failed', { cause: error, sql });
      // If inside a transaction, throw to trigger rollback. Otherwise, return the error object.
      if (this.db.inTransaction) throw queryError;
      return { acknowledged: false, error: queryError };
    }
  }

  /**
   * Updates documents in a table that match a given query.
   * @param table The name of the table.
   * @param doc An object containing the key-value pairs to update.
   * @param query A DSL query clause to select the documents to update.
   * @returns {Promise<UpdateResult>} A promise that resolves with the update result.
   */
  public async update(table: string, doc: Record<string, any>, query: DslQueryClause): Promise<UpdateResult> {
    if (!table || !doc || !query) throw new DSLiteValidationError('Table, doc, and query are required for update.');
    
    // SECURE: Validate the table name.
    this._validateIdentifier(table, 'table name');
    
    // SECURE: Doc keys (column names) are validated by _parseSetClause -> _quoteField.
    const { setSql, setParams } = this._parseSetClause(doc);
    if (!setSql) throw new DSLiteValidationError('Update document (doc) is empty or invalid.');
    
    // SECURE: Query fields are validated by _parseQuery -> _quoteField.
    const where = this._parseQuery(query);
    const sql = `UPDATE \`${table}\` SET ${setSql} WHERE ${where.sql}`;
    const allParams = [...setParams, ...where.params]; // Values are parameterized (safe).
    try {
      const info = this.run(sql, allParams); if (info.error) throw info.error;
      return { acknowledged: true, updatedCount: info.changes };
    } catch (error: any) {
      console.error("Update query failed:", error, { sql, allParams });
      const queryError = new DSLiteQueryError('Update query failed', { cause: error, sql });
      if (this.db.inTransaction) throw queryError;
      return { acknowledged: false, error: queryError };
    }
  }

  /**
   * Deletes documents from a table that match a given query.
   * @param table The name of the table.
   * @param query An object containing a `query` property with a DSL query clause.
   * @returns {Promise<DeleteResult>} A promise that resolves with the delete result.
   */
  public async delete(table: string, query: { query: DslQueryClause }): Promise<DeleteResult> {
    if (!table || !query || !query.query) throw new DSLiteValidationError('Table and query object are required for delete.');
    
    // SECURE: Validate the table name.
    this._validateIdentifier(table, 'table name');
    
    // SECURE: Query fields are validated by _parseQuery -> _quoteField.
    const where = this._parseQuery(query.query);
    const sql = `DELETE FROM \`${table}\` WHERE ${where.sql}`;
    const allParams = where.params; // Values are parameterized (safe).
    try {
      const info = this.run(sql, allParams); if (info.error) throw info.error;
      return { acknowledged: true, deletedCount: info.changes };
    } catch (error: any) {
      console.error("Delete query failed:", error, { sql, allParams });
      const queryError = new DSLiteQueryError('Delete query failed', { cause: error, sql });
      if (this.db.inTransaction) throw queryError;
      return { acknowledged: false, error: queryError };
    }
  }

  /**
   * Inserts a document, or updates it if a conflict occurs on a unique key.
   * Implements `INSERT ... ON CONFLICT ... DO UPDATE`.
   * @param table The name of the table.
   * @param doc The document to insert or update.
   * @param conflictKey The column name (or array of names) with the UNIQUE constraint.
   * @returns {Promise<UpsertResult>} A promise that resolves with the upsert result.
   */
  public async upsert(table: string, doc: Record<string, any>, conflictKey: string | string[]): Promise<UpsertResult> {
    if (!table || !doc || !conflictKey || Object.keys(doc).length === 0) {
      throw new DSLiteValidationError('Table, doc, and conflictKey are required for upsert.');
    }

    // SECURE: Validate table name
    this._validateIdentifier(table, 'table name');

    const keys = Object.keys(doc);
    // SECURE: Validate all column names in the document
    keys.forEach(k => this._validateIdentifier(k, 'column name'));

    const conflictKeys = Array.isArray(conflictKey) ? conflictKey : [conflictKey];
    // SECURE: Validate all conflict key column names
    conflictKeys.forEach(k => this._validateIdentifier(k, 'conflict key'));

    const keysSql = keys.map(k => `\`${k}\``).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const conflictKeysSql = conflictKeys.map(k => `\`${k}\``).join(', ');

    // Create the "DO UPDATE" part, excluding conflict keys from being updated to themselves
    const updateKeys = keys.filter(k => !conflictKeys.includes(k));
    const updateSql = updateKeys.map(k => `\`${k}\` = excluded.\`${k}\``).join(', ');

    const sql = `INSERT INTO \`${table}\` (${keysSql}) VALUES (${placeholders}) ON CONFLICT(${conflictKeysSql}) DO UPDATE SET ${updateSql}`;
    const params = Object.values(doc).map(val => (typeof val === 'object' && val !== null) ? JSON.stringify(val) : val);

    try { const info = this.run(sql, params); if (info.error) throw info.error; return { acknowledged: true, changes: info.changes, lastInsertRowid: info.lastInsertRowid }; }
    catch (error: any) {
      console.error("Upsert query failed:", error, { sql, params });
      const queryError = new DSLiteQueryError('Upsert query failed', { cause: error, sql });
      if (this.db.inTransaction) throw queryError;
      return { acknowledged: false, error: queryError };
    }
  }
  // --- Query Methods ---

  /**
   * Performs an aggregation query (SQL GROUP BY).
   * @param table The name of the table to aggregate.
   * @param dslQuery A DSL query object containing an `aggs` block.
   * @returns {Promise<any[]>} A promise that resolves with an array of aggregated results.
   */
  public async aggregate(table: string, dslQuery: DslQuery): Promise<any[]> {
    if (!table || !dslQuery.aggs) throw new DSLiteValidationError('Table and `aggs` block are required.');
    
    // SECURE: Validate the table name.
    this._validateIdentifier(table, 'table name');
    
    // SECURE: Join target, query fields, group_by fields, metrics, and sort fields
    // are all validated by their respective internal parsers (e.g., _parseJoin, _quoteField).
    const aggs = dslQuery.aggs; const joinSql = this._parseJoin(dslQuery.join);
    let where: SqlResult = { sql: '1=1', params: [] }; if (dslQuery.query) where = this._parseQuery(dslQuery.query);
    const selectParts: string[] = []; let groupBySql = '';
    if (aggs.group_by && Array.isArray(aggs.group_by)) {
      const groupFields = aggs.group_by.map(f => this._quoteField(f));
      groupBySql = 'GROUP BY ' + groupFields.join(', '); selectParts.push(...groupFields);
    }
    const supportedOps = ['sum', 'avg', 'count', 'min', 'max'];
    if (aggs.metrics) {
      for (const [metricName, operation] of Object.entries(aggs.metrics)) {
        this._validateIdentifier(metricName, 'metric alias'); // Validate the metric alias.
        const opKey = Object.keys(operation)[0];
        const field = (operation as any)[opKey];
        if (supportedOps.includes(opKey)) {
          const fieldSql = (field === '*') ? '*' : this._quoteField(field);
          selectParts.push(`${opKey.toUpperCase()}(${fieldSql}) as \`${metricName}\``);
        }
      }
    }
    if (selectParts.length === 0) throw new DSLiteValidationError('Aggregation must define "group_by" or "metrics".');
    let orderBy = ''; if (dslQuery.sort) orderBy = this._parseSort(dslQuery.sort);
    let limitSql = ''; let limitParams: SqlValue[] = []; if (dslQuery.size) { limitSql = 'LIMIT ?'; limitParams.push(dslQuery.size); }
    const selectSql = selectParts.join(', ');
    const finalSql = `SELECT ${selectSql} FROM \`${table}\` ${joinSql} WHERE ${where.sql} ${groupBySql} ${orderBy} ${limitSql}`; // Values are parameterized (safe).
    const allParams = [...where.params, ...limitParams];
    try { const stmt = this.db.prepare(finalSql); return stmt.all(allParams); }
    catch (error: any) { console.error("Aggregation query failed:", error, { finalSql, allParams }); return []; }
  }

  /**
   * Searches for documents using the DSL.
   * @param table The name of the table to search.
   * @param dslQuery A DSL query object.
   * @returns {Promise<any[]>} A promise that resolves with an array of matching documents.
   */
  public async search(table: string, dslQuery: DslQuery): Promise<any[]> {
    if (!table) throw new DSLiteValidationError('Table name is required for search.');
    
    // SECURE: Validate the table name.
    this._validateIdentifier(table, 'table name');
    
    // SECURE: All parts of the dslQuery are validated by internal parsers.
    const joinSql = this._parseJoin(dslQuery.join); 
    const selectSql = this._parseSource(dslQuery._source, '*');
    let where: SqlResult = { sql: '1=1', params: [] }; if (dslQuery.query) where = this._parseQuery(dslQuery.query);
    let orderBy = ''; if (dslQuery.sort) orderBy = this._parseSort(dslQuery.sort);
    const limitSql = 'LIMIT ?'; const limitParams = [dslQuery.size || 10]; const offsetSql = 'OFFSET ?'; const offsetParams = [dslQuery.from || 0];
    const finalSql = `SELECT ${selectSql} FROM \`${table}\` ${joinSql} WHERE ${where.sql} ${orderBy} ${limitSql} ${offsetSql}`;
    const allParams = [ ...where.params, ...limitParams, ...offsetParams ]; // Values are parameterized (safe).
    try { const stmt = this.db.prepare(finalSql); return stmt.all(allParams); }
    catch (error: any) { console.error("Search query failed:", error, { finalSql, allParams }); return []; }
  }

  // --- Transaction Methods (Inherently safe) ---

  /**
   * Executes a series of database operations within a transaction.
   * If the callback function throws an error, the transaction is automatically rolled back.
   * @param callback An async function that receives the transaction-bound DSLite instance.
   * @returns {Promise<TxResult>} A promise that resolves if the transaction is committed.
   * @throws {DSLiteQueryError} If the transaction fails and is rolled back.
   */
  public async transaction(callback: (tx: DSLite) => Promise<void>): Promise<TxResult> {
    try { this.run('BEGIN'); await callback(this); this.run('COMMIT'); return { acknowledged: true, committed: true }; }
    catch (error: any) {
      this.run('ROLLBACK');
      console.error("Transaction failed:", error.message);
      throw new DSLiteQueryError('Transaction failed and was rolled back', { cause: error });
    }
  }
  /**
   * Manually begins a transaction.
   * @returns {Promise<ManualTxResult>} A promise that resolves on success.
   */
  public async beginTransaction(): Promise<ManualTxResult> { try { this.run('BEGIN'); return { acknowledged: true }; } catch (error: any) { return { acknowledged: false, error: new DSLiteQueryError('BEGIN transaction failed', { cause: error }) }; } }
  /**
   * Manually commits the current transaction.
   * @returns {Promise<ManualTxResult>} A promise that resolves on success.
   */
  public async commit(): Promise<ManualTxResult> { try { this.run('COMMIT'); return { acknowledged: true }; } catch (error: any) { return { acknowledged: false, error: new DSLiteQueryError('COMMIT transaction failed', { cause: error }) }; } }
  /**
   * Manually rolls back the current transaction.
   * @returns {Promise<ManualTxResult>} A promise that resolves on success.
   */
  public async rollback(): Promise<ManualTxResult> { try { this.run('ROLLBACK'); return { acknowledged: true }; } catch (error: any) { return { acknowledged: false, error: new DSLiteQueryError('ROLLBACK transaction failed', { cause: error }) }; } }


  // --- Internal DSL Parsers ---

  private _parseSetClause(doc: Record<string, any>): { setSql: string; setParams: SqlValue[] } {
    const setParams: SqlValue[] = []; const setSqlParts: string[] = [];
    for (const [key, value] of Object.entries(doc)) {
      // SECURE: _quoteField validates the key (column name).
      const quotedKey = this._quoteField(key); 
      setSqlParts.push(`${quotedKey} = ?`);
      // The value is sent as a parameter (safe).
      const paramValue = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : value;
      setParams.push(paramValue);
    } 
    // Note: The previous json_set logic was removed to let _quoteField handle quoting.
    // To re-enable specific JSON update logic, _quoteField would need to be enhanced.
    return { setSql: setSqlParts.join(', '), setParams: setParams };
  }

  // Centralized field quoting and validation.
  private _quoteField(fieldStr: string): string {
    if (fieldStr === '*') return '*';
    
    // 1. Handle JSON: "meta->>details.price"
    const jsonMatch = fieldStr.match(/^(.*?)(->>|->)(.*)$/);
    if (jsonMatch) {
      const column = jsonMatch[1].trim(); // "meta" or "users.meta"
      const operator = jsonMatch[2]; 
      const path = jsonMatch[3].trim();   // "details.price" (JSONPath, ไม่ใช่ SQL)
      
      // SECURE: Validate the column part of the JSON accessor.
      column.split('.').forEach(part => this._validateIdentifier(part, 'JSON column name'));
      
      const quotedColumn = column.split('.').map(s => `\`${s}\``).join('.');
      // The path (e.g., '$.details.price') is treated as a string literal, which is safe.
      const jsonPath = '$.' + path; 
      return `${quotedColumn} ${operator} '${jsonPath}'`;
    }

    // 2. Handle Joins/Regular: "users.name" or "name"
    // SECURE: Validate each part of the field name (e.g., 'users' and 'name').
    return fieldStr.split('.').map(part => {
      this._validateIdentifier(part, 'field name');
      return `\`${part}\``;
    }).join('.');
  }

  private _parseJoin(joinArr?: DslJoin[]): string {
    if (!Array.isArray(joinArr) || joinArr.length === 0) return '';
    const parts = joinArr.map(joinDef => {
      const type = (joinDef.type || 'LEFT').toUpperCase();
      // SECURE: Validate the target table name for the join.
      this._validateIdentifier(joinDef.target, 'join target table');
      const targetTable = `\`${joinDef.target}\``;
      
      if (!joinDef.on || !joinDef.on.left || !joinDef.on.right) throw new DSLiteValidationError(`Invalid JOIN definition for target ${joinDef.target}: 'on' clause is missing.`);
      
      // SECURE: These fields are validated by _quoteField.
      const left = this._quoteField(joinDef.on.left); 
      const op = joinDef.on.op || '='; // Operator is limited to a safe default.
      const right = this._quoteField(joinDef.on.right);
      return `${type} JOIN ${targetTable} ON ${left} ${op} ${right}`;
    }); return parts.join(' ');
  }

  private _parseSource(sourceArr?: string[], defaultSource = '*'): string {
    if (!Array.isArray(sourceArr) || sourceArr.length === 0) return defaultSource;
    return sourceArr.map(field => {
      const asMatch = field.match(/^(.*)\s+as\s+(.*)$/i);
      if (asMatch) {
        // SECURE: Validate the original field and its alias.
        const originalField = this._quoteField(asMatch[1].trim());
        const alias = asMatch[2].trim();
        this._validateIdentifier(alias, 'source alias');
        return `${originalField} as \`${alias}\``;
      }
      // SECURE: Validate the field
      return this._quoteField(field);
    }).join(', ');
  }

  // The following parsers are safe because they use parameterized queries.
  private _parseQuery(queryObj: DslQueryClause): SqlResult {
    if ('bool' in queryObj) { return this._parseBool(queryObj.bool); }
    else if ('match' in queryObj) { return this._parseMatch(queryObj); }
    else if ('match_phrase' in queryObj) { return this._parseMatchPhrase(queryObj); }
    else if ('multi_match' in queryObj) { return this._parseMultiMatch(queryObj.multi_match); }
    else if ('exists' in queryObj) { return this._parseExists(queryObj.exists); }
    else if ('term' in queryObj) { return this._parseTerm(queryObj); }
    else if ('terms' in queryObj) { return this._parseTerms(queryObj); }
    else if ('range' in queryObj) { return this._parseRange(queryObj); }
    // Fallback for unsupported query types.
    console.warn(`Unsupported query type: ${Object.keys(queryObj)[0]}. Ignoring.`);
    return { sql: '1=1', params: [] };
  }
  private _parseBool(boolObj: BoolQuery['bool']): SqlResult {
    const finalClauses: string[] = []; let allParams: SqlValue[] = [];
    const processClauses = (clauseArray: DslQueryClause[] | undefined, joiner: 'AND' | 'OR'): SqlResult | null => {
      if (!Array.isArray(clauseArray) || clauseArray.length === 0) return null;
      const parts = clauseArray.map(q => this._parseQuery(q)); if (parts.length === 0) return null;
      const sql = `(${parts.map(p => p.sql).join(` ${joiner} `)})`; const params = parts.flatMap(p => p.params);
      return { sql, params };
    };
    const mustAndFilterClauses = [ ...(boolObj.must || []), ...(boolObj.filter || []) ];
    const mustResult = processClauses(mustAndFilterClauses, 'AND');
    if (mustResult) { finalClauses.push(mustResult.sql); allParams.push(...mustResult.params); }
    const shouldResult = processClauses(boolObj.should, 'OR');
    if (shouldResult) { if (!mustResult) { finalClauses.push(shouldResult.sql); allParams.push(...shouldResult.params); } }
    if (boolObj.must_not && boolObj.must_not.length > 0) {
      const parts = boolObj.must_not.map(q => this._parseQuery(q));
      parts.forEach(p => { finalClauses.push(`(NOT ${p.sql})`); allParams.push(...p.params); });
    }
    if (finalClauses.length === 0) return { sql: '1=1', params: [] };
    return { sql: `(${finalClauses.join(' AND ')})`, params: allParams };
  }
  private _parseMatch(matchObj: MatchQuery): SqlResult {
    const field = Object.keys(matchObj.match)[0]; const query = matchObj.match[field]; const quotedField = this._quoteField(field);
    const terms = String(query).split(' ').filter(t => t.length > 0); if (terms.length === 0) return { sql: '1=1', params: [] };
    const sqlParts = terms.map(() => `${quotedField} LIKE ?`); const params = terms.map(t => `%${t}%`);
    return { sql: `(${sqlParts.join(' AND ')})`, params: params };
  }
  private _parseMatchPhrase(matchObj: MatchPhraseQuery): SqlResult {
    const field = Object.keys(matchObj.match_phrase)[0]; const value = matchObj.match_phrase[field];
    return { sql: `${this._quoteField(field)} LIKE ?`, params: [`%${value}%`] };
  }
  private _parseMultiMatch(matchObj: MultiMatchQuery['multi_match']): SqlResult {
    const query = String(matchObj.query); const fields = matchObj.fields; if (!query || !Array.isArray(fields) || fields.length === 0) return { sql: '1=0', params: [] };
    const terms = query.split(' ').filter(t => t.length > 0); if (terms.length === 0) return { sql: '1=1', params: [] };
    const allParams: SqlValue[] = [];
    const fieldBlocks = fields.map(field => {
      const quotedField = this._quoteField(field); const sqlParts = terms.map(() => `${quotedField} LIKE ?`);
      allParams.push(...terms.map(t => `%${t}%`)); return `(${sqlParts.join(' AND ')})`;
    }); return { sql: `(${fieldBlocks.join(' OR ')})`, params: allParams };
  }
  private _parseExists(existsObj: ExistsQuery['exists']): SqlResult {
    const field = existsObj.field; if (!field) return { sql: '1=0', params: [] };
    return { sql: `${this._quoteField(field)} IS NOT NULL`, params: [] };
  }
  private _parseTerm(termObj: TermQuery): SqlResult {
    const field = Object.keys(termObj.term)[0]; const value = termObj.term[field];
    return { sql: `${this._quoteField(field)} = ?`, params: [value] };
  }
  private _parseTerms(termsObj: TermsQuery): SqlResult {
    const field = Object.keys(termsObj.terms)[0]; const values = termsObj.terms[field];
    if (!Array.isArray(values) || values.length === 0) return { sql: '1=0', params: [] };
    const placeholders = values.map(() => '?').join(',');
    return { sql: `${this._quoteField(field)} IN (${placeholders})`, params: values };
  }
  private _parseRange(rangeObj: RangeQuery): SqlResult {
    const field = Object.keys(rangeObj.range)[0]; const ops = rangeObj.range[field];
    const conditions: string[] = []; const params: SqlValue[] = [];
    const opMap: Record<string, string> = { gt: '>', gte: '>=', lt: '<', lte: '<=' };
    for (const [op, value] of Object.entries(ops)) {
      if (opMap[op]) {
        conditions.push(`${this._quoteField(field)} ${opMap[op]} ?`);
        params.push(value);
      }
    }
    if (conditions.length === 0) return { sql: '1=1', params: [] };
    return { sql: `(${conditions.join(' AND ')})`, params: params };
  }
  private _parseSort(sortArr?: DslSort[]): string {
    if (!Array.isArray(sortArr) || sortArr.length === 0) return '';
    const parts = sortArr.map(sortObj => {
      const field = Object.keys(sortObj)[0];
      let direction = String(sortObj[field]).toUpperCase();
      if (direction !== 'ASC' && direction !== 'DESC') direction = 'ASC';
      const fieldSql = this._quoteField(field); // (Safe)
      return `${fieldSql} ${direction}`;
    }); return `ORDER BY ${parts.join(', ')}`;
  }
}