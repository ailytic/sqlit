import { getInformationSchema } from './information_schema';

export interface ConnectionInfo {
  dialect: string;
  connection: any;
}

export type Value = string | number | boolean | Date | null;

export type Row = {
  [key: string]: Value;
};

export class QueryCounter {
  total: number = 0;
}

export type TransactionCallback = (
  connection: Connection
) => Promise<any> | void;

export interface Dialect {
  dialect: string;
  escape: (unsafe: any) => string;
  escapeId: (unsafe: string) => string;
}

export abstract class Connection implements Dialect {
  dialect: string;
  connection: any;
  name: string;
  queryCounter: QueryCounter;

  abstract query(sql: string): Promise<any>;
  abstract transaction(callback: TransactionCallback): Promise<any>;

  commit(): Promise<void> {
    return this.query('commit');
  }

  rollback(): Promise<void> {
    return this.query('rollback');
  }

  abstract end(): Promise<void>;
  abstract release();

  abstract escape(s: string): string;
  abstract escapeId(name: string): string;
}

export abstract class ConnectionPool implements Dialect {
  dialect: string;
  name: string;

  abstract getConnection(): Promise<Connection>;
  abstract end(): Promise<void>;

  abstract escape(s: string): string;
  abstract escapeId(name: string): string;
}

export function createConnectionPool(
  dialect: string,
  connection: any
): ConnectionPool {
  if (dialect === 'mysql') {
    const result = require('./mysql').default.createConnectionPool(connection);
    result.name = connection.database;
    return result;
  }
  throw Error(`Unsupported engine type: ${dialect}`);
}

export function createConnection(dialect: string, connection: any): Connection {
  if (dialect === 'mysql') {
    const result = require('./mysql').default.createConnection(connection);
    result.name = connection.database;
    return result;
  }
  throw Error(`Unsupported engine type: ${dialect}`);
}

export { getInformationSchema };
