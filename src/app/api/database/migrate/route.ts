import { NextRequest, NextResponse } from 'next/server';
import { 
  connectMSSQL, 
  connectMySQL,
  getMSSQLTables,
  getMSSQLTableSchema,
  getMSSQLTableData,
  MSSQLConfig,
  MySQLConfig,
  sql,
  mysql
} from '@/lib/db-connections';

// Convert MSSQL data type to MySQL data type
function mssqlToMysqlType(mssqlType: string, maxLength: number | null, precision: number | null, scale: number | null): string {
  const type = mssqlType.toLowerCase();
  
  switch (type) {
    case 'bigint':
      return 'BIGINT';
    case 'int':
    case 'integer':
      return 'INT';
    case 'smallint':
      return 'SMALLINT';
    case 'tinyint':
      return 'TINYINT';
    case 'bit':
      return 'BOOLEAN';
    case 'decimal':
    case 'numeric':
      if (precision && scale) {
        return `DECIMAL(${precision}, ${scale})`;
      } else if (precision) {
        return `DECIMAL(${precision}, 0)`;
      }
      return 'DECIMAL(18, 0)';
    case 'money':
    case 'smallmoney':
      return 'DECIMAL(19, 4)';
    case 'float':
      return 'DOUBLE';
    case 'real':
      return 'FLOAT';
    case 'datetime':
    case 'datetime2':
    case 'smalldatetime':
      return 'DATETIME';
    case 'date':
      return 'DATE';
    case 'time':
      return 'TIME';
    case 'datetimeoffset':
      return 'DATETIME';
    case 'char':
      return maxLength ? `CHAR(${maxLength})` : 'CHAR(255)';
    case 'varchar':
      return maxLength && maxLength > 0 ? `VARCHAR(${maxLength > 65535 ? 65535 : maxLength})` : 'VARCHAR(255)';
    case 'text':
      return 'TEXT';
    case 'nchar':
      return maxLength ? `CHAR(${maxLength})` : 'CHAR(255)';
    case 'nvarchar':
      return maxLength && maxLength > 0 ? `VARCHAR(${maxLength > 65535 ? 65535 : maxLength})` : 'VARCHAR(255)';
    case 'ntext':
      return 'TEXT';
    case 'binary':
    case 'varbinary':
    case 'image':
      return 'BLOB';
    case 'uniqueidentifier':
      return 'CHAR(36)';
    case 'xml':
      return 'LONGTEXT';
    case 'timestamp':
      return 'TIMESTAMP';
    default:
      return 'TEXT';
  }
}

// Create MySQL table from MSSQL schema
async function createMySQLTableFromMSSQL(
  mysqlPool: mysql.Pool,
  tableName: string,
  schema: { columns: sql.IRecordSet<{ [key: string]: unknown }>, primaryKeys: string[] }
): Promise<void> {
  const columnDefs: string[] = [];
  
  for (const col of schema.columns) {
    const colName = col.COLUMN_NAME as string;
    const dataType = col.DATA_TYPE as string;
    const maxLength = col.CHARACTER_MAXIMUM_LENGTH as number | null;
    const precision = col.NUMERIC_PRECISION as number | null;
    const scale = col.NUMERIC_SCALE as number | null;
    const isNullable = col.IS_NULLABLE as string;
    
    const mysqlType = mssqlToMysqlType(dataType, maxLength, precision, scale);
    const nullable = isNullable === 'YES' ? 'NULL' : 'NOT NULL';
    const defaultVal = col.COLUMN_DEFAULT ? `DEFAULT ${col.COLUMN_DEFAULT}` : '';
    
    columnDefs.push(`\`${colName}\` ${mysqlType} ${nullable} ${defaultVal}`.trim());
  }
  
  // Add primary key
  if (schema.primaryKeys.length > 0) {
    const pkCols = schema.primaryKeys.map(pk => `\`${pk}\``).join(', ');
    columnDefs.push(`PRIMARY KEY (${pkCols})`);
  }
  
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS \`${tableName}\` (
      ${columnDefs.join(',\n      ')}
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `;
  
  await mysqlPool.query(createTableSQL);
}

// Migrate data from MSSQL to MySQL
async function migrateTableData(
  mssqlPool: sql.ConnectionPool,
  mysqlPool: mysql.Pool,
  tableName: string,
  batchSize: number = 1000
): Promise<number> {
  let totalMigrated = 0;
  let offset = 0;
  
  // Get total count
  const countResult = await mssqlPool.request().query(`SELECT COUNT(*) as total FROM [${tableName}]`);
  const total = countResult.recordset[0].total;
  
  if (total === 0) return 0;
  
  while (offset < total) {
    const dataResult = await mssqlPool.request().query(`
      SELECT * FROM [${tableName}]
      ORDER BY (SELECT NULL)
      OFFSET ${offset} ROWS
      FETCH NEXT ${batchSize} ROWS ONLY
    `);
    
    const rows = dataResult.recordset;
    if (rows.length === 0) break;
    
    // Prepare insert statement
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const colNames = columns.map(c => `\`${c}\``).join(', ');
    
    const insertSQL = `INSERT INTO \`${tableName}\` (${colNames}) VALUES (${placeholders})`;
    
    // Insert batch
    for (const row of rows) {
      const values = columns.map(c => {
        const val = row[c];
        // Handle special types
        if (val instanceof Date) return val;
        if (Buffer.isBuffer(val)) return val.toString('hex');
        return val;
      });
      await mysqlPool.query(insertSQL, values);
      totalMigrated++;
    }
    
    offset += batchSize;
  }
  
  return totalMigrated;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mssqlConfig, mysqlConfig, tables, batchSize = 1000, createTables = true } = body;
    
    if (!mssqlConfig || !mysqlConfig) {
      return NextResponse.json({
        success: false,
        error: 'Both MSSQL and MySQL configurations are required',
      }, { status: 400 });
    }
    
    // Connect to both databases
    const mssqlPool = await connectMSSQL(mssqlConfig as MSSQLConfig);
    const mysqlPool = await connectMySQL(mysqlConfig as MySQLConfig);
    
    // Get tables to migrate
    const tablesToMigrate = tables || await getMSSQLTables(mssqlPool);
    
    const results: {
      table: string;
      status: 'success' | 'error';
      rowsMigrated?: number;
      error?: string;
    }[] = [];
    
    for (const tableName of tablesToMigrate) {
      try {
        // Get schema
        const schema = await getMSSQLTableSchema(mssqlPool, tableName);
        
        // Create table in MySQL if needed
        if (createTables) {
          await createMySQLTableFromMSSQL(mysqlPool, tableName, schema);
        }
        
        // Migrate data
        const rowsMigrated = await migrateTableData(mssqlPool, mysqlPool, tableName, batchSize);
        
        results.push({
          table: tableName,
          status: 'success',
          rowsMigrated,
        });
      } catch (error) {
        results.push({
          table: tableName,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    const successCount = results.filter(r => r.status === 'success').length;
    const totalRows = results.reduce((sum, r) => sum + (r.rowsMigrated || 0), 0);
    
    return NextResponse.json({
      success: true,
      message: `Migration completed. ${successCount}/${results.length} tables migrated successfully. Total ${totalRows} rows migrated.`,
      results,
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Migration failed',
    }, { status: 500 });
  }
}
