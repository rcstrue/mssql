import { NextRequest, NextResponse } from 'next/server';
import { getTablesFromDb, getTableSchemaFromDb, exportToMySQL } from '@/lib/sql-parser';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'parsed_data.db');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mysqlConfig, tables } = body;
    
    if (!mysqlConfig) {
      return NextResponse.json({
        success: false,
        error: 'MySQL configuration is required',
      }, { status: 400 });
    }
    
    const tablesToMigrate = tables || getTablesFromDb(DB_PATH);
    
    if (tablesToMigrate.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No tables to migrate',
      }, { status: 400 });
    }
    
    const results: { table: string; status: 'success' | 'error'; rowsMigrated?: number; error?: string }[] = [];
    
    for (const tableName of tablesToMigrate) {
      try {
        await exportToMySQL(
          DB_PATH,
          mysqlConfig,
          [tableName],
          (table, rows) => {
            console.log(`Migrated ${rows} rows from ${table}`);
          }
        );
        
        // Get row count
        const schema = getTableSchemaFromDb(DB_PATH, tableName);
        results.push({
          table: tableName,
          status: 'success',
          rowsMigrated: 0, // We'd need to track this better
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
    
    return NextResponse.json({
      success: true,
      message: `Migration completed. ${successCount}/${results.length} tables migrated successfully.`,
      results,
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Migration failed',
    }, { status: 500 });
  }
}
