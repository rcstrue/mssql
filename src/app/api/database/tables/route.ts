import { NextRequest, NextResponse } from 'next/server';
import { 
  connectMSSQL, 
  connectMySQL, 
  getMSSQLTables, 
  getMySQLTables,
  getMSSQLTableSchema,
  getMySQLTableSchema,
  MSSQLConfig,
  MySQLConfig
} from '@/lib/db-connections';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, config, tableName } = body;
    
    if (type === 'mssql') {
      const pool = await connectMSSQL(config as MSSQLConfig);
      
      if (tableName) {
        const schema = await getMSSQLTableSchema(pool, tableName);
        return NextResponse.json({
          success: true,
          schema,
        });
      } else {
        const tables = await getMSSQLTables(pool);
        return NextResponse.json({
          success: true,
          tables,
        });
      }
    } else if (type === 'mysql') {
      const pool = await connectMySQL(config as MySQLConfig);
      
      if (tableName) {
        const schema = await getMySQLTableSchema(pool, tableName);
        return NextResponse.json({
          success: true,
          schema,
        });
      } else {
        const tables = await getMySQLTables(pool);
        return NextResponse.json({
          success: true,
          tables,
        });
      }
    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid database type',
      }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get tables',
    }, { status: 500 });
  }
}
