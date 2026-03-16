import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';

// SQL Parser for MSSQL dump files
export interface TableSchema {
  name: string;
  columns: {
    name: string;
    type: string;
    nullable: boolean;
    defaultValue: string | null;
  }[];
  primaryKeys: string[];
}

export interface ParseProgress {
  phase: 'parsing' | 'extracting' | 'complete' | 'error';
  message: string;
  tablesFound: number;
  rowsProcessed: number;
  currentTable: string | null;
  percent: number;
}

// Create or get SQLite database for storing parsed data
function getWorkingDb(dbPath: string): Database.Database {
  return new Database(dbPath);
}

// Parse CREATE TABLE statements
function parseCreateTable(sql: string): { name: string; columns: TableSchema['columns']; primaryKeys: string[] } | null {
  // Match CREATE TABLE [dbo].[TableName] or CREATE TABLE TableName
  const tableMatch = sql.match(/CREATE\s+TABLE\s+(?:\[?\w+\]?\.)?\[?(\w+)\]?\s*\(([\s\S]+?)\)(?:\s*ON\s+PRIMARY)?/i);
  
  if (!tableMatch) return null;
  
  const tableName = tableMatch[1];
  const columnsStr = tableMatch[2];
  
  const columns: TableSchema['columns'] = [];
  const primaryKeys: string[] = [];
  
  // Split by comma but handle nested parentheses
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  
  for (const char of columnsStr) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  
  for (const part of parts) {
    // Check for PRIMARY KEY constraint
    if (part.match(/PRIMARY\s+KEY\s*\((.+)\)/i)) {
      const pkMatch = part.match(/PRIMARY\s+KEY\s*\((.+)\)/i);
      if (pkMatch) {
        const pkCols = pkMatch[1].split(',').map(c => c.replace(/[\[\]]/g, '').trim());
        primaryKeys.push(...pkCols);
      }
      continue;
    }
    
    // Check for other constraints
    if (part.match(/^(CONSTRAINT|FOREIGN\s+KEY|UNIQUE|CHECK|DEFAULT)/i)) {
      continue;
    }
    
    // Parse column definition
    const colMatch = part.match(/\[?(\w+)\]?\s+(\w+(?:\s*\([^)]+\))?)\s*(.*)/i);
    if (colMatch) {
      const colName = colMatch[1];
      const colType = colMatch[2];
      const rest = colMatch[3] || '';
      
      const nullable = !rest.toUpperCase().includes('NOT NULL');
      const defaultMatch = rest.match(/DEFAULT\s+(.+?)(?:\s+|$)/i);
      const defaultValue = defaultMatch ? defaultMatch[1] : null;
      
      // Check for inline PRIMARY KEY
      if (rest.toUpperCase().includes('PRIMARY KEY')) {
        primaryKeys.push(colName);
      }
      
      columns.push({
        name: colName,
        type: colType,
        nullable,
        defaultValue,
      });
    }
  }
  
  return { name: tableName, columns, primaryKeys };
}

// Parse INSERT statement and extract table name and values
function parseInsert(sql: string): { table: string; columns: string[]; values: unknown[][] } | null {
  // Match INSERT INTO [dbo].[TableName] (columns) VALUES (values)
  const insertMatch = sql.match(/INSERT\s+INTO\s+(?:\[?\w+\]?\.)?\[?(\w+)\]?\s*(?:\(([^)]+)\))?\s*VALUES\s*/i);
  
  if (!insertMatch) return null;
  
  const tableName = insertMatch[1];
  const columnsStr = insertMatch[2] || '';
  const columns = columnsStr.split(',').map(c => c.replace(/[\[\]]/g, '').trim()).filter(Boolean);
  
  // Extract values - handle multiple value groups
  const values: unknown[][] = [];
  const valuesStr = sql.substring(sql.indexOf('VALUES') + 6);
  
  // Parse value groups
  let currentValue = '';
  let depth = 0;
  let inString = false;
  let stringChar = '';
  
  for (let i = 0; i < valuesStr.length; i++) {
    const char = valuesStr[i];
    const prevChar = i > 0 ? valuesStr[i - 1] : '';
    
    // Handle string literals
    if ((char === "'" || char === '"') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }
    
    if (!inString) {
      if (char === '(') depth++;
      if (char === ')') {
        depth--;
        if (depth === 0 && currentValue.trim()) {
          // Parse the values in this group
          const valueStr = currentValue.trim();
          if (valueStr.startsWith('(')) {
            const parsed = parseValueGroup(valueStr);
            if (parsed) values.push(parsed);
          }
          currentValue = '';
          continue;
        }
      }
    }
    
    currentValue += char;
  }
  
  return { table: tableName, columns, values };
}

// Parse a single value group from INSERT statement
function parseValueGroup(str: string): unknown[] | null {
  // Remove outer parentheses
  str = str.trim();
  if (str.startsWith('(') && str.endsWith(')')) {
    str = str.slice(1, -1);
  }
  
  const values: unknown[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let depth = 0;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const prevChar = i > 0 ? str[i - 1] : '';
    
    // Handle string literals
    if ((char === "'" || char === '"') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
        current += char;
        continue;
      } else if (char === stringChar) {
        // Check for escaped quote
        if (str[i + 1] === stringChar) {
          current += char;
          continue;
        }
        inString = false;
        current += char;
        continue;
      }
    }
    
    if (!inString) {
      if (char === '(') depth++;
      if (char === ')') depth--;
      
      if (char === ',' && depth === 0) {
        values.push(parseValue(current.trim()));
        current = '';
        continue;
      }
    }
    
    current += char;
  }
  
  if (current.trim()) {
    values.push(parseValue(current.trim()));
  }
  
  return values;
}

// Parse a single value
function parseValue(str: string): unknown {
  if (str === 'NULL' || str === 'null') return null;
  
  // String value
  if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
    return str.slice(1, -1).replace(/''/g, "'").replace(/\\"/g, '"');
  }
  
  // Number
  if (/^-?\d+$/.test(str)) return parseInt(str, 10);
  if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);
  
  // Boolean
  if (str.toLowerCase() === 'true') return true;
  if (str.toLowerCase() === 'false') return false;
  
  return str;
}

// Convert MSSQL type to SQLite type
function mssqlToSqliteType(mssqlType: string): string {
  const type = mssqlType.toUpperCase();
  
  if (type.includes('INT') || type === 'BIGINT' || type === 'SMALLINT' || type === 'TINYINT') {
    return 'INTEGER';
  }
  if (type.includes('CHAR') || type.includes('TEXT') || type.includes('VARCHAR') || type.includes('NTEXT') || type.includes('NVARCHAR')) {
    return 'TEXT';
  }
  if (type.includes('DECIMAL') || type.includes('NUMERIC') || type.includes('FLOAT') || type.includes('REAL') || type.includes('MONEY')) {
    return 'REAL';
  }
  if (type.includes('DATE') || type.includes('TIME')) {
    return 'TEXT';
  }
  if (type === 'BIT') {
    return 'INTEGER';
  }
  if (type.includes('BINARY') || type.includes('IMAGE') || type.includes('VARBINARY')) {
    return 'BLOB';
  }
  
  return 'TEXT';
}

// Main parser function - processes SQL file and stores in SQLite
export async function parseSQLFile(
  filePath: string,
  dbPath: string,
  onProgress?: (progress: ParseProgress) => void
): Promise<{ tables: string[]; error?: string }> {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  
  onProgress?.({
    phase: 'parsing',
    message: 'Starting to parse SQL file...',
    tablesFound: 0,
    rowsProcessed: 0,
    currentTable: null,
    percent: 0,
  });
  
  const db = getWorkingDb(dbPath);
  
  // Create metadata table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _sql_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    
    CREATE TABLE IF NOT EXISTS _tables (
      name TEXT PRIMARY KEY,
      columns_json TEXT,
      primary_keys_json TEXT
    );
  `);
  
  const tables = new Map<string, TableSchema>();
  let currentStatement = '';
  let inStatement = false;
  let rowsProcessed = 0;
  let bytesProcessed = 0;
  
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  
  return new Promise((resolve, reject) => {
    let buffer = '';
    
    stream.on('data', (chunk: string) => {
      buffer += chunk;
      bytesProcessed += chunk.length;
      
      // Process complete statements
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        // Skip comments
        if (line.trim().startsWith('--') || line.trim().startsWith('/*')) {
          continue;
        }
        
        // Skip USE, GO, SET statements
        if (/^(USE|GO|SET\s+|PRINT|EXEC|ALTER|DROP|CREATE\s+(PROCEDURE|FUNCTION|VIEW|TRIGGER|INDEX))/i.test(line.trim())) {
          continue;
        }
        
        currentStatement += line + '\n';
        
        // Check if statement is complete
        if (currentStatement.trim().endsWith(')') || 
            (currentStatement.includes(';') && !currentStatement.includes('INSERT'))) {
          
          const stmt = currentStatement.trim();
          currentStatement = '';
          
          if (!stmt) continue;
          
          // Parse CREATE TABLE
          if (stmt.toUpperCase().startsWith('CREATE TABLE')) {
            const parsed = parseCreateTable(stmt);
            if (parsed) {
              tables.set(parsed.name, {
                name: parsed.name,
                columns: parsed.columns,
                primaryKeys: parsed.primaryKeys,
              });
              
              onProgress?.({
                phase: 'parsing',
                message: `Found table: ${parsed.name}`,
                tablesFound: tables.size,
                rowsProcessed,
                currentTable: parsed.name,
                percent: Math.round((bytesProcessed / fileSize) * 100),
              });
            }
          }
          
          // Parse INSERT
          if (stmt.toUpperCase().startsWith('INSERT INTO')) {
            const parsed = parseInsert(stmt);
            if (parsed && parsed.table) {
              let tableSchema = tables.get(parsed.table);
              
              // Create table schema if not exists
              if (!tableSchema) {
                // Infer schema from INSERT
                const columns = parsed.columns.length > 0 
                  ? parsed.columns.map((col, i) => ({
                      name: col,
                      type: 'TEXT',
                      nullable: true,
                      defaultValue: null,
                    }))
                  : parsed.values[0]?.map((_, i) => ({
                      name: `column_${i}`,
                      type: 'TEXT',
                      nullable: true,
                      defaultValue: null,
                    })) || [];
                
                tableSchema = {
                  name: parsed.table,
                  columns,
                  primaryKeys: [],
                };
                tables.set(parsed.table, tableSchema);
              }
              
              // Insert data
              try {
                insertData(db, tableSchema, parsed.values);
                rowsProcessed += parsed.values.length;
                
                if (rowsProcessed % 1000 === 0) {
                  onProgress?.({
                    phase: 'extracting',
                    message: `Processed ${rowsProcessed} rows...`,
                    tablesFound: tables.size,
                    rowsProcessed,
                    currentTable: parsed.table,
                    percent: Math.round((bytesProcessed / fileSize) * 100),
                  });
                }
              } catch (err) {
                console.error(`Error inserting into ${parsed.table}:`, err);
              }
            }
          }
        }
      }
    });
    
    stream.on('end', () => {
      // Process remaining buffer
      if (buffer.trim()) {
        // Handle any remaining statements
      }
      
      // Store table schemas
      const insertTable = db.prepare('INSERT OR REPLACE INTO _tables (name, columns_json, primary_keys_json) VALUES (?, ?, ?)');
      
      for (const [name, schema] of tables) {
        insertTable.run(name, JSON.stringify(schema.columns), JSON.stringify(schema.primaryKeys));
      }
      
      db.exec(`INSERT OR REPLACE INTO _sql_meta (key, value) VALUES ('ready', 'true')`);
      
      onProgress?.({
        phase: 'complete',
        message: 'Parsing complete!',
        tablesFound: tables.size,
        rowsProcessed,
        currentTable: null,
        percent: 100,
      });
      
      db.close();
      
      resolve({ tables: Array.from(tables.keys()) });
    });
    
    stream.on('error', (err) => {
      onProgress?.({
        phase: 'error',
        message: err.message,
        tablesFound: tables.size,
        rowsProcessed,
        currentTable: null,
        percent: Math.round((bytesProcessed / fileSize) * 100),
      });
      
      db.close();
      reject(err);
    });
  });
}

// Insert data into SQLite table
function insertData(db: Database.Database, schema: TableSchema, values: unknown[][]) {
  // Create table if not exists
  const columnDefs = schema.columns.map(col => {
    const sqliteType = mssqlToSqliteType(col.type);
    return `"${col.name}" ${sqliteType}`;
  });
  
  const pkDef = schema.primaryKeys.length > 0 
    ? `, PRIMARY KEY (${schema.primaryKeys.map(pk => `"${pk}"`).join(', ')})`
    : '';
  
  db.exec(`CREATE TABLE IF NOT EXISTS "${schema.name}" (${columnDefs.join(', ')}${pkDef})`);
  
  // Insert values
  if (values.length === 0) return;
  
  const colNames = schema.columns.map(c => `"${c.name}"`).join(', ');
  const placeholders = schema.columns.map(() => '?').join(', ');
  const insertStmt = db.prepare(`INSERT INTO "${schema.name}" (${colNames}) VALUES (${placeholders})`);
  
  const insertMany = db.transaction((rows: unknown[][]) => {
    for (const row of rows) {
      try {
        insertStmt.run(...row);
      } catch (err) {
        // Skip duplicate key errors
      }
    }
  });
  
  insertMany(values);
}

// Get tables from parsed database
export function getTablesFromDb(dbPath: string): string[] {
  const db = getWorkingDb(dbPath);
  
  try {
    const rows = db.prepare('SELECT name FROM _tables ORDER BY name').all() as { name: string }[];
    return rows.map(r => r.name);
  } finally {
    db.close();
  }
}

// Get table schema
export function getTableSchemaFromDb(dbPath: string, tableName: string): TableSchema | null {
  const db = getWorkingDb(dbPath);
  
  try {
    const row = db.prepare('SELECT columns_json, primary_keys_json FROM _tables WHERE name = ?').get(tableName) as {
      columns_json: string;
      primary_keys_json: string;
    } | undefined;
    
    if (!row) return null;
    
    return {
      name: tableName,
      columns: JSON.parse(row.columns_json),
      primaryKeys: JSON.parse(row.primary_keys_json),
    };
  } finally {
    db.close();
  }
}

// Get table data with pagination
export function getTableDataFromDb(
  dbPath: string,
  tableName: string,
  page: number = 1,
  pageSize: number = 50
): { data: Record<string, unknown>[]; total: number; page: number; pageSize: number; totalPages: number } {
  const db = getWorkingDb(dbPath);
  
  try {
    // Get total count
    const countRow = db.prepare(`SELECT COUNT(*) as total FROM "${tableName}"`).get() as { total: number };
    const total = countRow.total;
    
    // Get paginated data
    const offset = (page - 1) * pageSize;
    const rows = db.prepare(`SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`).all(pageSize, offset) as Record<string, unknown>[];
    
    return {
      data: rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  } finally {
    db.close();
  }
}

// Update row in SQLite
export function updateRowInDb(
  dbPath: string,
  tableName: string,
  schema: TableSchema,
  primaryKey: Record<string, unknown>,
  updates: Record<string, unknown>
): boolean {
  const db = getWorkingDb(dbPath);
  
  try {
    const setClauses = Object.keys(updates).map(k => `"${k}" = ?`).join(', ');
    const whereClauses = schema.primaryKeys.map(k => `"${k}" = ?`).join(' AND ');
    
    const values = [...Object.values(updates), ...schema.primaryKeys.map(k => primaryKey[k])];
    
    const stmt = db.prepare(`UPDATE "${tableName}" SET ${setClauses} WHERE ${whereClauses}`);
    const result = stmt.run(...values);
    
    return result.changes > 0;
  } finally {
    db.close();
  }
}

// Insert row in SQLite
export function insertRowInDb(
  dbPath: string,
  tableName: string,
  schema: TableSchema,
  data: Record<string, unknown>
): boolean {
  const db = getWorkingDb(dbPath);
  
  try {
    const columns = Object.keys(data).map(k => `"${k}"`).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const values = Object.values(data);
    
    const stmt = db.prepare(`INSERT INTO "${tableName}" (${columns}) VALUES (${placeholders})`);
    stmt.run(...values);
    
    return true;
  } finally {
    db.close();
  }
}

// Delete row from SQLite
export function deleteRowFromDb(
  dbPath: string,
  tableName: string,
  schema: TableSchema,
  primaryKey: Record<string, unknown>
): boolean {
  const db = getWorkingDb(dbPath);
  
  try {
    const whereClauses = schema.primaryKeys.map(k => `"${k}" = ?`).join(' AND ');
    const values = schema.primaryKeys.map(k => primaryKey[k]);
    
    const stmt = db.prepare(`DELETE FROM "${tableName}" WHERE ${whereClauses}`);
    const result = stmt.run(...values);
    
    return result.changes > 0;
  } finally {
    db.close();
  }
}

// Export to MySQL
export async function exportToMySQL(
  dbPath: string,
  mysqlConfig: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  },
  tables?: string[],
  onProgress?: (table: string, rows: number) => void
): Promise<{ success: boolean; error?: string }> {
  const db = getWorkingDb(dbPath);
  const pool = await mysql.createPool(mysqlConfig);
  
  try {
    const tableList = tables || getTablesFromDb(dbPath);
    
    for (const tableName of tableList) {
      const schema = getTableSchemaFromDb(dbPath, tableName);
      if (!schema) continue;
      
      // Create table in MySQL
      const columnDefs = schema.columns.map(col => {
        const mysqlType = mssqlToMysqlType(col.type);
        const nullable = col.nullable ? 'NULL' : 'NOT NULL';
        const defaultVal = col.defaultValue ? ` DEFAULT ${col.defaultValue}` : '';
        return `\`${col.name}\` ${mysqlType} ${nullable}${defaultVal}`;
      });
      
      const pkDef = schema.primaryKeys.length > 0
        ? `, PRIMARY KEY (${schema.primaryKeys.map(pk => `\`${pk}\``).join(', ')})`
        : '';
      
      await pool.query(`DROP TABLE IF EXISTS \`${tableName}\``);
      await pool.query(`CREATE TABLE \`${tableName}\` (${columnDefs.join(', ')}${pkDef}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      
      // Insert data in batches
      const batchSize = 1000;
      let offset = 0;
      let totalRows = 0;
      
      while (true) {
        const rows = db.prepare(`SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`).all(batchSize, offset) as Record<string, unknown>[];
        
        if (rows.length === 0) break;
        
        const columns = schema.columns.map(c => c.name);
        const placeholders = columns.map(() => '?').join(', ');
        const colNames = columns.map(c => `\`${c}\``).join(', ');
        
        const insertStmt = `INSERT INTO \`${tableName}\` (${colNames}) VALUES (${placeholders})`;
        
        for (const row of rows) {
          const values = columns.map(c => {
            const val = row[c];
            if (Buffer.isBuffer(val)) return val.toString('hex');
            return val;
          });
          await pool.query(insertStmt, values);
          totalRows++;
        }
        
        onProgress?.(tableName, totalRows);
        offset += batchSize;
      }
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  } finally {
    db.close();
    await pool.end();
  }
}

// Convert MSSQL type to MySQL type
function mssqlToMysqlType(mssqlType: string): string {
  const type = mssqlType.toUpperCase();
  
  if (type === 'BIGINT') return 'BIGINT';
  if (type === 'INT' || type === 'INTEGER') return 'INT';
  if (type === 'SMALLINT') return 'SMALLINT';
  if (type === 'TINYINT') return 'TINYINT';
  if (type === 'BIT') return 'BOOLEAN';
  
  if (type.includes('DECIMAL') || type.includes('NUMERIC')) {
    const match = type.match(/\((\d+),\s*(\d+)\)/);
    if (match) return `DECIMAL(${match[1]}, ${match[2]})`;
    return 'DECIMAL(18, 0)';
  }
  if (type === 'MONEY' || type === 'SMALLMONEY') return 'DECIMAL(19, 4)';
  if (type === 'FLOAT') return 'DOUBLE';
  if (type === 'REAL') return 'FLOAT';
  
  if (type.includes('DATETIME') || type === 'SMALLDATETIME') return 'DATETIME';
  if (type === 'DATE') return 'DATE';
  if (type === 'TIME') return 'TIME';
  
  if (type.includes('NVARCHAR') || type.includes('VARCHAR') || type.includes('NCHAR') || type.includes('CHAR')) {
    const match = type.match(/\((\d+)\)/);
    if (match) {
      const len = parseInt(match[1]);
      if (len > 65535) return 'LONGTEXT';
      if (len > 255) return `VARCHAR(${len})`;
      return type.includes('N') ? `VARCHAR(${len})` : `VARCHAR(${len})`;
    }
    return 'VARCHAR(255)';
  }
  if (type === 'NTEXT' || type === 'TEXT') return 'LONGTEXT';
  
  if (type.includes('BINARY') || type.includes('VARBINARY') || type === 'IMAGE') return 'LONGBLOB';
  if (type === 'UNIQUEIDENTIFIER') return 'CHAR(36)';
  if (type === 'XML') return 'LONGTEXT';
  
  return 'TEXT';
}

// Check if database is ready
export function isDbReady(dbPath: string): boolean {
  if (!fs.existsSync(dbPath)) return false;
  
  const db = getWorkingDb(dbPath);
  try {
    const row = db.prepare("SELECT value FROM _sql_meta WHERE key = 'ready'").get() as { value: string } | undefined;
    return row?.value === 'true';
  } catch {
    return false;
  } finally {
    db.close();
  }
}
