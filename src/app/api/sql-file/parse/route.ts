import { NextRequest, NextResponse } from 'next/server';
import { parseSQLFile, isDbReady, getTablesFromDb } from '@/lib/sql-parser';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'parsed_data.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filePath } = body;
    
    if (!filePath) {
      return NextResponse.json({
        success: false,
        error: 'File path is required',
      }, { status: 400 });
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({
        success: false,
        error: `File not found: ${filePath}`,
      }, { status: 400 });
    }
    
    // Parse the SQL file
    const result = await parseSQLFile(filePath, DB_PATH);
    
    return NextResponse.json({
      success: true,
      tables: result.tables,
      dbPath: DB_PATH,
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse SQL file',
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    if (!isDbReady(DB_PATH)) {
      return NextResponse.json({
        success: false,
        ready: false,
        message: 'No parsed database found. Please parse a SQL file first.',
      });
    }
    
    const tables = getTablesFromDb(DB_PATH);
    
    return NextResponse.json({
      success: true,
      ready: true,
      tables,
      dbPath: DB_PATH,
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get tables',
    }, { status: 500 });
  }
}
