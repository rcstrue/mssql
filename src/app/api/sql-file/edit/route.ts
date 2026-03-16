import { NextRequest, NextResponse } from 'next/server';
import { 
  getTableSchemaFromDb, 
  updateRowInDb, 
  insertRowInDb, 
  deleteRowFromDb 
} from '@/lib/sql-parser';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'parsed_data.db');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tableName, action, primaryKey, data } = body;
    
    if (!tableName || !action) {
      return NextResponse.json({
        success: false,
        error: 'Table name and action are required',
      }, { status: 400 });
    }
    
    const schema = getTableSchemaFromDb(DB_PATH, tableName);
    
    if (!schema) {
      return NextResponse.json({
        success: false,
        error: 'Table not found',
      }, { status: 404 });
    }
    
    switch (action) {
      case 'update':
        if (!primaryKey || !data) {
          return NextResponse.json({
            success: false,
            error: 'Primary key and data are required for update',
          }, { status: 400 });
        }
        
        const updateSuccess = updateRowInDb(DB_PATH, tableName, schema, primaryKey, data);
        
        return NextResponse.json({
          success: updateSuccess,
          message: updateSuccess ? 'Row updated successfully' : 'No rows updated',
        });
        
      case 'insert':
        if (!data) {
          return NextResponse.json({
            success: false,
            error: 'Data is required for insert',
          }, { status: 400 });
        }
        
        const insertSuccess = insertRowInDb(DB_PATH, tableName, schema, data);
        
        return NextResponse.json({
          success: insertSuccess,
          message: 'Row inserted successfully',
        });
        
      case 'delete':
        if (!primaryKey) {
          return NextResponse.json({
            success: false,
            error: 'Primary key is required for delete',
          }, { status: 400 });
        }
        
        const deleteSuccess = deleteRowFromDb(DB_PATH, tableName, schema, primaryKey);
        
        return NextResponse.json({
          success: deleteSuccess,
          message: deleteSuccess ? 'Row deleted successfully' : 'No rows deleted',
        });
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use "update", "insert", or "delete"',
        }, { status: 400 });
    }
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to perform operation',
    }, { status: 500 });
  }
}
