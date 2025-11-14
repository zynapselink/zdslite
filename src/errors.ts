/**
 * Base error for all DSLite-specific errors.
 * @extends Error
 */
export class DSLiteError extends Error {
  public cause?: any;
  constructor(message: string, options?: { cause?: any }) {
    super(message);
    this.name = 'DSLiteError';
    this.cause = options?.cause;
  }
}

/**
 * Thrown for validation errors, such as invalid identifiers or missing parameters.
 * @extends DSLiteError
 */
export class DSLiteValidationError extends DSLiteError {
  constructor(message: string) {
    super(message);
    this.name = 'DSLiteValidationError';
  }
}

/**
 * Thrown when a database query fails to execute.
 * Contains the original error cause and the failed SQL.
 * @extends DSLiteError
 */
export class DSLiteQueryError extends DSLiteError {
  public sql?: string;
  constructor(message: string, options?: { cause?: any; sql?: string; }) {
    super(message, options);
    this.name = 'DSLiteQueryError';
    this.sql = options?.sql;
  }
}