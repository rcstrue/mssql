import { NextRequest, NextResponse } from 'next/server';
import { 
  connectMSSQL, 
  connectMySQL, 
  getMSSQLTableData,
  getMySQLTableData,
  MSSQLConfig,
  MySQLConfig
} from '@/lib/db-connections';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, config, tableName, page = 1, pageSize = 50 } = body;
    
    if (!tableName) {
      return NextResponse.json({
        success: false,
        error: 'Table name is required',
      }, { status: 400 });
    }
    
    if (type === 'mssql') {
      const pool = await connectMSSQL(config as MSSQLConfig);
      const result = await getMSSQLTableData(pool, tableName, page, pageSize);
      
      return NextResponse.json({
        success: true,
        ...result,
      });
    } else if (type === 'mysql') {
      const pool = await connectMySQL(config as MySQLConfig);
      const result = await getMySQLTableData(pool, tableName, page, pageSize);
      
      return NextResponse.json({
        success: true,
        ...result,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid database type',
      }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch data',
    }, { status: 500 });
  }
}
