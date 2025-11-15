import http from 'http';
import { ZDSLite, ZDSLiteValidationError } from './index';

interface ServerOptions {
  dbPath: string;
  port: number;
}

/**
 * Starts the ZDSLite API server.
 * @param options - The server options.
 */
export function startServer(options: ServerOptions): void {
  const { dbPath, port } = options;
  const db = new ZDSLite(dbPath);

  const requestHandler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.method !== 'POST' || req.url !== '/query') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found. Please POST to /query.' }));
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { method } = payload;

        if (!method || typeof (db as any)[method] !== 'function') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Invalid or missing 'method' in request body.` }));
          return;
        }

        let result: any;
        const { table, dsl, data, query, doc, columns, conflictKey, fields, options, indexName } = payload;

        // Construct arguments based on the method, similar to the CLI's single-command mode.
        switch (method) {
          case 'search':
            if (!table || !dsl) throw new ZDSLiteValidationError('"table" and "dsl" are required for "search"');
            result = await db.search(table, dsl);
            break;
          case 'aggregate':
            if (!table || !dsl) throw new ZDSLiteValidationError('"table" and "dsl" are required for "aggregate"');
            result = await db.aggregate(table, dsl);
            break;
          case 'insert':
            if (!table || !data) throw new ZDSLiteValidationError('"table" and "data" are required for "insert"');
            result = await db.insert(table, data);
            break;
          case 'update':
            if (!table || !doc || !query) throw new ZDSLiteValidationError('"table", "doc", and "query" are required for "update"');
            result = await db.update(table, doc, query);
            break;
          case 'delete':
            if (!table || !query) throw new ZDSLiteValidationError('"table" and "query" are required for "delete"');
            result = await db.delete(table, { query });
            break;
          case 'create':
            if (!table || !columns) throw new ZDSLiteValidationError('"table" and "columns" are required for "create"');
            result = await db.create(table, columns);
            break;
          case 'upsert':
            if (!table || !doc || !conflictKey) throw new ZDSLiteValidationError('"table", "doc", and "conflictKey" are required for "upsert"');
            result = await db.upsert(table, doc, conflictKey);
            break;
          // Add other methods as needed (drop, createIndex, etc.)
          default:
            // For simple methods, we can still use a generic approach if needed.
            throw new ZDSLiteValidationError(`Method '${method}' is not supported via the API server yet.`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));

      } catch (error: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        // Handle both standard errors and our custom ZDSLite errors
        const errorMessage = error.message || 'An internal server error occurred.';
        res.end(JSON.stringify({ error: errorMessage, name: error.name }));
      }
    });
  };

  const server = http.createServer(requestHandler);

  server.listen(port, () => {
    console.log(`🚀 ZDSLite API server running on http://localhost:${port}`);
    console.log(`Connected to database: ${dbPath}`);
    console.log(`Send POST requests to /query`);
    console.log(`Example: curl -X POST -H "Content-Type: application/json" -d '{"method": "search", "table": "users", "dsl": {}}' http://localhost:${port}/query`);
  });

  process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => {
      db.close();
      console.log('Server and database connection closed.');
      process.exit(0);
    });
  });
}