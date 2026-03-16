import { NextRequest, NextResponse } from 'next/server';
import { connectMSSQL, connectMySQL, getMSSQLTables, getMySQLTables } from '@/lib/db-connections';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, config } = body;
    
    if (type === 'mssql') {
      try {
        const pool = await connectMSSQL(config);
        const tables = await getMSSQLTables(pool);
        
        return NextResponse.json({
          success: true,
          type: 'mssql',
          tables,
          message: `Connected to MSSQL database "${config.database}" successfully`,
        });
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to connect to MSSQL',
        }, { status: 400 });
      }
    } else if (type === 'mysql') {
      try {
        const pool = await connectMySQL(config);
        const tables = await getMySQLTables(pool);
        
        return NextResponse.json({
          success: true,
          type: 'mysql',
          tables,
          message: `Connected to MySQL database "${config.database}" successfully`,
        });
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to connect to MySQL',
        }, { status: 400 });
      }
    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid database type. Use "mssql" or "mysql"',
      }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid request',
    }, { status: 400 });
  }
}
