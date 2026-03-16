import { NextRequest, NextResponse } from 'next/server';
import { getTableSchemaFromDb, getTablesFromDb } from '@/lib/sql-parser';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'parsed_data.db');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tableName } = body;
    
    if (tableName) {
      const schema = getTableSchemaFromDb(DB_PATH, tableName);
      
      if (!schema) {
        return NextResponse.json({
          success: false,
          error: 'Table not found',
        }, { status: 404 });
      }
      
      return NextResponse.json({
        success: true,
        schema,
      });
    } else {
      const tables = getTablesFromDb(DB_PATH);
      return NextResponse.json({
        success: true,
        tables,
      });
    }
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get tables',
    }, { status: 500 });
  }
}
