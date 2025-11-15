#!/usr/bin/env node

import { ZDSLite, ZDSLiteError, ZDSLiteQueryError, ZDSLiteValidationError } from './index';
import minimist from 'minimist';
import fs from 'fs';
import path from 'path';
import * as repl from 'repl'; // Import REPL module
import util from 'util';
import { startServer } from './server';

// --- Helper Function ---
function printHelp() {
  console.log(`
ZDSLite CLI
Official Zynapse Link (https://zynapse.link) utility

Usage (Single Command):
  zdslite --db <path> '<json_query>'
  cat query.json | zdslite --db <path>

Usage (Interactive REPL):
  zdslite --connect <path>
  zdslite -c <path>

Usage (API Server):
  zdslite --server --db <path> [--port <number>]
  zdslite -s -d <path> [-p <number>]

Options:
  --db, -d        Path to the SQLite database file.
  --connect, -c   Start an interactive REPL session connected to the DB.
  --server, -s    Start a persistent API server.
  --port, -p      Port for the API server (default: 3000).
  --help, -h      Show this help message.

REPL Examples:
  zdslite> await db.create('users', { id: 'INTEGER', name: 'TEXT' })
  zdslite> await db.insert('users', { id: 1, name: 'Alice' })
  zdslite> await db.search('users', { query: { term: { id: 1 } } })
  zdslite> .tables
  zdslite> .exit
`);
}

/**
 * Starts the interactive REPL mode.
 */
function startReplMode(dbPath: string) {
  console.log(`Connecting to ${dbPath}...`);
  let db: ZDSLite;
  try {
    db = new ZDSLite(dbPath);
    console.log(`Connected. Welcome to ZDSLite REPL!`);
    console.log(`Type .help for commands, or use the 'db' object.`);
  } catch (e: any) {
    console.error(`Failed to connect: ${e.message}`);
    process.exit(1);
  }

  // Create the REPL server
  const replServer = repl.start({
    prompt: 'zdslite> ',
    useColors: true,
  });

  // Inject the 'db' instance into the REPL's context
  replServer.context.db = db;

  // Add a custom .tables command
  replServer.defineCommand('tables', {
    help: 'List all tables in the database',
    async action() {
      this.clearBufferedCommand();
      try {
        // Use db.run, which is part of ZDSLite, but for a raw query
        const result = db.run("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
        // Note: db.run in the TS version returns RunResult, not the data.
        // For a REPL, we might want a db.query() method that returns data.
        // For now, let's adjust to use search as a workaround.
        const tables = await db.search('sqlite_master', {
            _source: ['name'],
            query: {
                bool: {
                    must: [
                        { term: { type: 'table' } }
                    ],
                    must_not: [
                        { match_phrase: { name: 'sqlite_' } }
                    ]
                }
            },
            size: 100
        });
        console.log(tables.map(t => t.name));

      } catch (e: any) {
        console.error('Failed to list tables:', e.message);
      }
      this.displayPrompt();
    }
  });
}

/**
 * Runs a single query command from the arguments.
 */
async function runSingleCommand(args: minimist.ParsedArgs, dbPath: string) {
  const queryJsonString = args._[0];
  if (!queryJsonString) {
    console.error('Error: A JSON query string is required as the main argument.\n');
    printHelp();
    process.exit(1);
  }

  let queryPayload;
  try {
    queryPayload = JSON.parse(queryJsonString);
  } catch (e: any) {
    console.error('Error: Invalid JSON query string provided.', e.message);
    process.exit(1);
  }

  const { method, table, dsl, data, query, doc, columns } = queryPayload;

  if (!method) {
    console.error('Error: JSON query must include a "method" key.');
    process.exit(1);
  }
  
  if (!table && !['dropIndex'].includes(method)) {
     console.error('Error: JSON query must include a "table" key.');
     process.exit(1);
  }

  try {
    const db = new ZDSLite(dbPath);
    let result: any;

    switch (method) {
      case 'search':
        if (!dsl) throw new ZDSLiteValidationError('"dsl" object is required for "search"');
        result = await db.search(table, dsl);
        break;
      
      case 'aggregate':
        if (!dsl) throw new ZDSLiteValidationError('"dsl" object is required for "aggregate"');
        result = await db.aggregate(table, dsl);
        break;
      
      case 'insert':
        if (!data) throw new ZDSLiteValidationError('"data" object/array is required for "insert"');
        result = await db.insert(table, data);
        break;
      
      case 'update':
        if (!doc) throw new ZDSLiteValidationError('"doc" object is required for "update"');
        if (!query) throw new ZDSLiteValidationError('"query" clause is required for "update"');
        result = await db.update(table, doc, query);
        break;
      
      case 'delete':
         if (!query) throw new ZDSLiteValidationError('"query" object is required for "delete"');
        result = await db.delete(table, { query });
        break;
        
      case 'create':
        if (!columns) throw new ZDSLiteValidationError('"columns" object is required for "create"');
        result = await db.create(table, columns);
        break;

      case 'drop':
        result = await db.drop(table);
        break;
      
      default:
        throw new ZDSLiteValidationError(`Unsupported method: ${method}`);
    }
    
    // Print successful result as JSON
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error: any) {
    // Handle custom errors
    console.error(`ZDSLite Error: ${error.name || 'Error'}`);
    console.error(`Message: ${error.message}\n`);
    
    if (error instanceof ZDSLiteQueryError) {
      console.error("--- Failed SQL ---");
      console.error(error.sql);
      console.error("\n--- DB Cause ---");
      console.error(error.cause);
    }
    
    process.exit(1);
  }
}

/**
 * Main CLI entry point.
 */
async function main() {
  const argv = minimist(process.argv.slice(2), {
    alias: {
      connect: 'c',
      db: 'd',
      help: 'h',
      server: 's',
      port: 'p'
    },
    string: ['connect', 'db'],
    boolean: ['help', 'server'],
    default: {
      port: '3000'
    }
  });

  if (argv.h || argv.help) {
    printHelp();
    process.exit(0);
  }

  if (argv.server) {
    const dbPath = argv.db;
    if (!dbPath) {
      console.error('Error: Database path is required. Use --db <path>.');
      process.exit(1);
    }
    const port = parseInt(argv.port || '3000', 10);
    startServer({ dbPath, port });
  }
  else if (argv.connect) {
    // REPL Mode
    const dbPath = argv.connect;
    if (!dbPath || typeof dbPath !== 'string') {
         console.error('Error: --connect <path> is required.\n');
         printHelp();
         process.exit(1);
    }
    startReplMode(dbPath);
  } else if (argv.db) {
    // --- Single Command Mode ---
    await runSingleCommand(argv, argv.db);
  } else {
    // No DB path provided
    printHelp();
    process.exit(1);
  }
}

main();
