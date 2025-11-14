import Database from 'better-sqlite3';

export type SqlValue = string | number | null | Buffer;
export type SqlResult = { sql: string; params: SqlValue[] };

export type TermQuery = { term: { [field: string]: SqlValue } };
export type TermsQuery = { terms: { [field: string]: SqlValue[] } };
export type MatchQuery = { match: { [field: string]: string } };
export type MatchPhraseQuery = { match_phrase: { [field: string]: string } };
export type MultiMatchQuery = { multi_match: { query: string; fields: string[] } };
export type ExistsQuery = { exists: { field: string } };
export type RangeOps = { gt?: number; gte?: number; lt?: number; lte?: number };
export type RangeQuery = { range: { [field: string]: RangeOps } };
export type BoolQuery = {
  bool: {
    must?: DslQueryClause[];
    filter?: DslQueryClause[];
    should?: DslQueryClause[];
    must_not?: DslQueryClause[];
  };
};

export type DslQueryClause = TermQuery | TermsQuery | MatchQuery | MatchPhraseQuery | MultiMatchQuery | ExistsQuery | RangeQuery | BoolQuery;

export interface DslJoin {
  type?: 'LEFT' | 'INNER' | 'RIGHT' | 'FULL';
  target: string;
  on: { left: string; right: string; op?: string; };
}

export interface DslSort { [field: string]: 'asc' | 'desc'; }

export interface DslAggMetrics { [metricName: string]: | { count: string } | { sum: string } | { avg: string } | { min: string } | { max: string }; }

export interface DslAggs {
  group_by?: string[];
  metrics?: DslAggMetrics;
}

export interface DslQuery {
  _source?: string[];
  query?: DslQueryClause;
  join?: DslJoin[];
  sort?: DslSort[];
  aggs?: DslAggs;
  size?: number;
  from?: number;
}

export type DslRunResult = Database.RunResult & { error?: any };

export type CreateResult = { acknowledged: true; table: string } | { acknowledged: false; error: Error };

export type DropResult = { acknowledged: true; table: string } | { acknowledged: false; error: Error };

export type IndexResult = { acknowledged: true; indexName: string } | { acknowledged: false; error: Error };

export type InsertResult = { acknowledged: true; insertedCount: number } | { acknowledged: false; error: Error };

export type UpdateResult = { acknowledged: true; updatedCount: number } | { acknowledged: false; error: Error };

export type DeleteResult = { acknowledged: true; deletedCount: number } | { acknowledged: false; error: Error };

export type UpsertResult = { acknowledged: true; changes: number; lastInsertRowid: number | bigint } | { acknowledged: false; error: Error };

export type TxResult = { acknowledged: true; committed: true } | { acknowledged: false; rolledBack: true; error: Error };

export type ManualTxResult = { acknowledged: true } | { acknowledged: false; error: Error };