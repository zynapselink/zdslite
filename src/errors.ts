/**
 * Base error for all ZDSLite-specific errors.
 * @extends Error
 */
export class ZDSLiteError extends Error {
  public cause?: any;
  constructor(message: string, options?: { cause?: any }) {
    super(message);
    this.name = 'ZDSLiteError';
    this.cause = options?.cause;
  }
}

/**
 * Thrown for validation errors, such as invalid identifiers or missing parameters.
 * @extends ZDSLiteError
 */
export class ZDSLiteValidationError extends ZDSLiteError {
  constructor(message: string) {
    super(message);
    this.name = 'ZDSLiteValidationError';
  }
}

/**
 * Thrown when a database query fails to execute.
 * Contains the original error cause and the failed SQL.
 * @extends ZDSLiteError
 */
export class ZDSLiteQueryError extends ZDSLiteError {
  public sql?: string;
  constructor(message: string, options?: { cause?: any; sql?: string; }) {
    super(message, options);
    this.name = 'ZDSLiteQueryError';
    this.sql = options?.sql;
  }
}