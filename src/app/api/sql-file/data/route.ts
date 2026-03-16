import { NextRequest, NextResponse } from 'next/server';
import { getTableDataFromDb } from '@/lib/sql-parser';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'parsed_data.db');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tableName, page = 1, pageSize = 50 } = body;
    
    if (!tableName) {
      return NextResponse.json({
        success: false,
        error: 'Table name is required',
      }, { status: 400 });
    }
    
    const result = getTableDataFromDb(DB_PATH, tableName, page, pageSize);
    
    return NextResponse.json({
      success: true,
      ...result,
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch data',
    }, { status: 500 });
  }
}
