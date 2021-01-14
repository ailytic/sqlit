import Knex from 'knex';
import { Pool } from 'tarn';

import {
  Connection as ConnectionBase,
  TransactionCallback,
  QueryCounter,
  ConnectionPool
} from '.';

import mysql = require('mysql');

class _ConnectionPool extends ConnectionPool {
  private pool: Pool<mysql.Connection>;
  private knex: Knex;

  constructor({
    database,
    knex: {
      connection,
      pool
    }
  }) {
    super();
    this.knex = Knex({
      client: 'mysql',
      connection: {
        ...connection,
        database
      },
      pool
    });
    this.pool = this.knex.client.pool;
  }

  async getConnection(): Promise<ConnectionBase> {
    const connection = await this.pool.acquire().promise;
    (connection as any).release = () => this.pool.release(connection);
    return new Connection(
      connection,
      true
    );
  }

  end(): Promise<void> {
    return new Promise(resolve => this.knex.destroy(resolve));
  }

  escape(value: string): string {
    return mysql.escape(value);
  }

  escapeId(name: string) {
    return mysql.escapeId(name);
  }
}

class Connection extends ConnectionBase {
  dialect: string = 'mysql';
  connection: any;
  queryCounter: QueryCounter = new QueryCounter();

  constructor(options, connected?: boolean) {
    super();
    if (connected) {
      this.connection = options;
    } else {
      this.connection = mysql.createConnection(options);
    }
  }

  release() {
    this.connection.release();
  }

  query(sql: string): Promise<any[] | void> {
    this.queryCounter.total++;
    return new Promise((resolve, reject) =>
      this.connection.query(sql, (error, results, fields) => {
        if (error) {
          return reject(error);
        }
        if (results.insertId) {
          resolve(results.insertId);
        } else {
          resolve(results);
        }
      })
    );
  }

  transaction(callback: TransactionCallback): Promise<any> {
    return new Promise((resolve, reject) => {
      return this.connection.beginTransaction(error => {
        if (error) return reject(error);
        let promise;
        try {
          promise = callback(this);
        } catch (error) {
          return this.connection.rollback(() => {
            reject(error);
          });
        }
        if (promise instanceof Promise) {
          return promise
            .then(result =>
              this.connection.commit(error => {
                if (error) {
                  return this.connection.rollback(() => {
                    reject(error);
                  });
                } else {
                  resolve(result);
                }
              })
            )
            .catch(reason =>
              this.connection.rollback(() => {
                reject(reason);
              })
            );
        } else {
          resolve();
        }
      });
    });
  }

  commit(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connection.commit(error => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  rollback(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connection.rollback(error => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  end(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connection.end(err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  escape(value: string): string {
    return mysql.escape(value);
  }

  escapeId(name: string) {
    return mysql.escapeId(name);
  }
}

export default {
  createConnectionPool: (options): ConnectionPool => {
    return new _ConnectionPool(options);
  },
  createConnection: (options): ConnectionBase => {
    return new Connection(options);
  },
  Connection
};
