import sql from 'mssql';
import mysql from 'mysql2/promise';

// Connection pool cache
const mssqlPools = new Map<string, sql.ConnectionPool>();
const mysqlPools = new Map<string, mysql.Pool>();

export interface MSSQLConfig {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}

export interface MySQLConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export function getMSSQLConfigKey(config: MSSQLConfig): string {
  return `${config.server}:${config.port}:${config.database}`;
}

export function getMySQLConfigKey(config: MySQLConfig): string {
  return `${config.host}:${config.port}:${config.database}`;
}

// MSSQL Connection
export async function connectMSSQL(config: MSSQLConfig): Promise<sql.ConnectionPool> {
  const key = getMSSQLConfigKey(config);
  
  if (mssqlPools.has(key)) {
    const pool = mssqlPools.get(key)!;
    if (pool.connected) {
      return pool;
    }
    await pool.close();
    mssqlPools.delete(key);
  }
  
  const pool = new sql.ConnectionPool({
    server: config.server,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    options: {
      encrypt: config.encrypt ?? false,
      trustServerCertificate: config.trustServerCertificate ?? true,
    },
  });
  
  await pool.connect();
  mssqlPools.set(key, pool);
  return pool;
}

// MySQL Connection
export async function connectMySQL(config: MySQLConfig): Promise<mysql.Pool> {
  const key = getMySQLConfigKey(config);
  
  if (mysqlPools.has(key)) {
    return mysqlPools.get(key)!;
  }
  
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    waitForConnections: true,
    connectionLimit: 10,
  });
  
  mysqlPools.set(key, pool);
  return pool;
}

// Get MSSQL Tables
export async function getMSSQLTables(pool: sql.ConnectionPool): Promise<string[]> {
  const result = await pool.request().query(`
    SELECT TABLE_NAME 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `);
  return result.recordset.map((row: { TABLE_NAME: string }) => row.TABLE_NAME);
}

// Get MySQL Tables
export async function getMySQLTables(pool: mysql.Pool): Promise<string[]> {
  const [rows] = await pool.query(`
    SELECT TABLE_NAME 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `) as [mysql.RowDataPacket[], mysql.FieldPacket[]];
  return rows.map((row: { TABLE_NAME: string }) => row.TABLE_NAME);
}

// Get MSSQL Table Schema
export async function getMSSQLTableSchema(pool: sql.ConnectionPool, tableName: string) {
  const result = await pool.request()
    .input('tableName', sql.NVarChar, tableName)
    .query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        CHARACTER_MAXIMUM_LENGTH,
        NUMERIC_PRECISION,
        NUMERIC_SCALE,
        ORDINAL_POSITION
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @tableName
      ORDER BY ORDINAL_POSITION
    `);
  
  const pkResult = await pool.request()
    .input('tableName', sql.NVarChar, tableName)
    .query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_NAME = @tableName
        AND CONSTRAINT_NAME LIKE 'PK_%'
    `);
  
  const primaryKeys = pkResult.recordset.map((row: { COLUMN_NAME: string }) => row.COLUMN_NAME);
  
  return {
    columns: result.recordset,
    primaryKeys,
  };
}

// Get MySQL Table Schema
export async function getMySQLTableSchema(pool: mysql.Pool, tableName: string) {
  const [columns] = await pool.query(`
    SELECT 
      COLUMN_NAME,
      DATA_TYPE,
      IS_NULLABLE,
      COLUMN_DEFAULT,
      CHARACTER_MAXIMUM_LENGTH,
      NUMERIC_PRECISION,
      NUMERIC_SCALE,
      ORDINAL_POSITION
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION
  `, [tableName]) as [mysql.RowDataPacket[], mysql.FieldPacket[]];
  
  const [pkRows] = await pool.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_NAME = ?
      AND CONSTRAINT_NAME = 'PRIMARY'
  `, [tableName]) as [mysql.RowDataPacket[], mysql.FieldPacket[]];
  
  const primaryKeys = pkRows.map((row: { COLUMN_NAME: string }) => row.COLUMN_NAME);
  
  return {
    columns,
    primaryKeys,
  };
}

// Get MSSQL Table Data
export async function getMSSQLTableData(
  pool: sql.ConnectionPool, 
  tableName: string, 
  page: number = 1, 
  pageSize: number = 50
) {
  const offset = (page - 1) * pageSize;
  
  // Get total count
  const countResult = await pool.request().query(`SELECT COUNT(*) as total FROM [${tableName}]`);
  const total = countResult.recordset[0].total;
  
  // Get paginated data
  const dataResult = await pool.request().query(`
    SELECT * FROM [${tableName}]
    ORDER BY (SELECT NULL)
    OFFSET ${offset} ROWS
    FETCH NEXT ${pageSize} ROWS ONLY
  `);
  
  return {
    data: dataResult.recordset,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// Get MySQL Table Data
export async function getMySQLTableData(
  pool: mysql.Pool, 
  tableName: string, 
  page: number = 1, 
  pageSize: number = 50
) {
  const offset = (page - 1) * pageSize;
  
  // Get total count
  const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM \`${tableName}\``) as [mysql.RowDataPacket[], mysql.FieldPacket[]];
  const total = countRows[0].total;
  
  // Get paginated data
  const [data] = await pool.query(`
    SELECT * FROM \`${tableName}\`
    LIMIT ${pageSize} OFFSET ${offset}
  `) as [mysql.RowDataPacket[], mysql.FieldPacket[]];
  
  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// Update MSSQL Row
export async function updateMSSQLRow(
  pool: sql.ConnectionPool,
  tableName: string,
  primaryKey: Record<string, unknown>,
  updates: Record<string, unknown>
) {
  const request = pool.request();
  
  const setClauses: string[] = [];
  const whereClauses: string[] = [];
  
  for (const [key, value] of Object.entries(updates)) {
    const paramName = `set_${key}`;
    request.input(paramName, value);
    setClauses.push(`[${key}] = @${paramName}`);
  }
  
  for (const [key, value] of Object.entries(primaryKey)) {
    const paramName = `pk_${key}`;
    request.input(paramName, value);
    whereClauses.push(`[${key}] = @${paramName}`);
  }
  
  const query = `
    UPDATE [${tableName}]
    SET ${setClauses.join(', ')}
    WHERE ${whereClauses.join(' AND ')}
  `;
  
  return await request.query(query);
}

// Update MySQL Row
export async function updateMySQLRow(
  pool: mysql.Pool,
  tableName: string,
  primaryKey: Record<string, unknown>,
  updates: Record<string, unknown>
) {
  const setClauses: string[] = [];
  const whereClauses: string[] = [];
  const values: unknown[] = [];
  const whereValues: unknown[] = [];
  
  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`\`${key}\` = ?`);
    values.push(value);
  }
  
  for (const [key, value] of Object.entries(primaryKey)) {
    whereClauses.push(`\`${key}\` = ?`);
    whereValues.push(value);
  }
  
  const query = `
    UPDATE \`${tableName}\`
    SET ${setClauses.join(', ')}
    WHERE ${whereClauses.join(' AND ')}
  `;
  
  const [result] = await pool.query(query, [...values, ...whereValues]) as [mysql.ResultSetHeader, mysql.FieldPacket[]];
  return result;
}

// Delete MSSQL Row
export async function deleteMSSQLRow(
  pool: sql.ConnectionPool,
  tableName: string,
  primaryKey: Record<string, unknown>
) {
  const request = pool.request();
  const whereClauses: string[] = [];
  
  for (const [key, value] of Object.entries(primaryKey)) {
    const paramName = `pk_${key}`;
    request.input(paramName, value);
    whereClauses.push(`[${key}] = @${paramName}`);
  }
  
  const query = `DELETE FROM [${tableName}] WHERE ${whereClauses.join(' AND ')}`;
  return await request.query(query);
}

// Delete MySQL Row
export async function deleteMySQLRow(
  pool: mysql.Pool,
  tableName: string,
  primaryKey: Record<string, unknown>
) {
  const whereClauses: string[] = [];
  const values: unknown[] = [];
  
  for (const [key, value] of Object.entries(primaryKey)) {
    whereClauses.push(`\`${key}\` = ?`);
    values.push(value);
  }
  
  const query = `DELETE FROM \`${tableName}\` WHERE ${whereClauses.join(' AND ')}`;
  const [result] = await pool.query(query, values) as [mysql.ResultSetHeader, mysql.FieldPacket[]];
  return result;
}

// Insert MSSQL Row
export async function insertMSSQLRow(
  pool: sql.ConnectionPool,
  tableName: string,
  data: Record<string, unknown>
) {
  const request = pool.request();
  const columns: string[] = [];
  const paramNames: string[] = [];
  
  for (const [key, value] of Object.entries(data)) {
    const paramName = `ins_${key}`;
    request.input(paramName, value);
    columns.push(`[${key}]`);
    paramNames.push(`@${paramName}`);
  }
  
  const query = `
    INSERT INTO [${tableName}] (${columns.join(', ')})
    VALUES (${paramNames.join(', ')})
  `;
  
  return await request.query(query);
}

// Insert MySQL Row
export async function insertMySQLRow(
  pool: mysql.Pool,
  tableName: string,
  data: Record<string, unknown>
) {
  const columns: string[] = [];
  const placeholders: string[] = [];
  const values: unknown[] = [];
  
  for (const [key, value] of Object.entries(data)) {
    columns.push(`\`${key}\``);
    placeholders.push('?');
    values.push(value);
  }
  
  const query = `
    INSERT INTO \`${tableName}\` (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
  `;
  
  const [result] = await pool.query(query, values) as [mysql.ResultSetHeader, mysql.FieldPacket[]];
  return result;
}

// Close all connections
export async function closeAllConnections() {
  for (const pool of mssqlPools.values()) {
    await pool.close();
  }
  mssqlPools.clear();
  
  for (const pool of mysqlPools.values()) {
    await pool.end();
  }
  mysqlPools.clear();
}

// Export for type checking
export { sql, mysql };
