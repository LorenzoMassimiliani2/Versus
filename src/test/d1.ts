import { readFileSync } from 'node:fs'

import { DatabaseSync } from 'node:sqlite'

const migrationSql = readFileSync(
  new URL('../../migrations/0001_initial_schema.sql', import.meta.url),
  'utf8',
)

type SqlValue = string | number | bigint | null | Uint8Array

class SqliteStatement {
  private readonly db: DatabaseSync
  private readonly sql: string
  private readonly params: SqlValue[]

  constructor(db: DatabaseSync, sql: string, params: SqlValue[] = []) {
    this.db = db
    this.sql = sql
    this.params = params
  }

  bind(...values: SqlValue[]): SqliteStatement {
    return new SqliteStatement(this.db, this.sql, values)
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined
    if (!row) return null
    const plain = { ...row }
    return (column ? plain[column] : plain) as T
  }

  async run(): Promise<D1Result> {
    const info = this.db.prepare(this.sql).run(...this.params)
    const changes = Number(info.changes)
    return {
      success: true,
      meta: {
        duration: 0,
        changes,
        last_row_id: Number(info.lastInsertRowid),
        changed_db: changes > 0,
        rows_read: 0,
        rows_written: changes,
        size_after: 0,
      },
      results: [],
    } as unknown as D1Result
  }

  async all<T>(): Promise<D1Result<T>> {
    const rows = this.db.prepare(this.sql).all(...this.params) as Record<string, unknown>[]
    return {
      success: true,
      meta: { duration: 0, changes: 0, last_row_id: 0, changed_db: false, rows_read: rows.length, rows_written: 0, size_after: 0 },
      results: rows.map((row) => ({ ...row })) as T[],
    } as unknown as D1Result<T>
  }
}

/** Adattatore minimale di D1 su node:sqlite per i test del Worker. */
export class SqliteD1 {
  readonly db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.db = db
  }

  prepare(sql: string): SqliteStatement {
    return new SqliteStatement(this.db, sql)
  }

  async batch(statements: SqliteStatement[]): Promise<D1Result[]> {
    const results: D1Result[] = []
    for (const statement of statements) results.push(await statement.run())
    return results
  }
}

export interface TestEnvironment {
  db: DatabaseSync
  env: Env
}

export function createTestEnvironment(): TestEnvironment {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(migrationSql)
  return { db, env: { DB: new SqliteD1(db) } as unknown as Env }
}
