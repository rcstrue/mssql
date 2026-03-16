import { NextRequest, NextResponse } from 'next/server';
import { 
  connectMSSQL, 
  connectMySQL, 
  updateMSSQLRow,
  updateMySQLRow,
  deleteMSSQLRow,
  deleteMySQLRow,
  insertMSSQLRow,
  insertMySQLRow,
  MSSQLConfig,
  MySQLConfig
} from '@/lib/db-connections';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, config, tableName, action, primaryKey, data } = body;
    
    if (!tableName || !action) {
      return NextResponse.json({
        success: false,
        error: 'Table name and action are required',
      }, { status: 400 });
    }
    
    if (type === 'mssql') {
      const pool = await connectMSSQL(config as MSSQLConfig);
      
      switch (action) {
        case 'update':
          if (!primaryKey || !data) {
            return NextResponse.json({
              success: false,
              error: 'Primary key and data are required for update',
            }, { status: 400 });
          }
          await updateMSSQLRow(pool, tableName, primaryKey, data);
          return NextResponse.json({
            success: true,
            message: 'Row updated successfully',
          });
          
        case 'insert':
          if (!data) {
            return NextResponse.json({
              success: false,
              error: 'Data is required for insert',
            }, { status: 400 });
          }
          await insertMSSQLRow(pool, tableName, data);
          return NextResponse.json({
            success: true,
            message: 'Row inserted successfully',
          });
          
        case 'delete':
          if (!primaryKey) {
            return NextResponse.json({
              success: false,
              error: 'Primary key is required for delete',
            }, { status: 400 });
          }
          await deleteMSSQLRow(pool, tableName, primaryKey);
          return NextResponse.json({
            success: true,
            message: 'Row deleted successfully',
          });
          
        default:
          return NextResponse.json({
            success: false,
            error: 'Invalid action. Use "update", "insert", or "delete"',
          }, { status: 400 });
      }
    } else if (type === 'mysql') {
      const pool = await connectMySQL(config as MySQLConfig);
      
      switch (action) {
        case 'update':
          if (!primaryKey || !data) {
            return NextResponse.json({
              success: false,
              error: 'Primary key and data are required for update',
            }, { status: 400 });
          }
          await updateMySQLRow(pool, tableName, primaryKey, data);
          return NextResponse.json({
            success: true,
            message: 'Row updated successfully',
          });
          
        case 'insert':
          if (!data) {
            return NextResponse.json({
              success: false,
              error: 'Data is required for insert',
            }, { status: 400 });
          }
          await insertMySQLRow(pool, tableName, data);
          return NextResponse.json({
            success: true,
            message: 'Row inserted successfully',
          });
          
        case 'delete':
          if (!primaryKey) {
            return NextResponse.json({
              success: false,
              error: 'Primary key is required for delete',
            }, { status: 400 });
          }
          await deleteMySQLRow(pool, tableName, primaryKey);
          return NextResponse.json({
            success: true,
            message: 'Row deleted successfully',
          });
          
        default:
          return NextResponse.json({
            success: false,
            error: 'Invalid action. Use "update", "insert", or "delete"',
          }, { status: 400 });
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
      error: error instanceof Error ? error.message : 'Failed to perform operation',
    }, { status: 500 });
  }
}
