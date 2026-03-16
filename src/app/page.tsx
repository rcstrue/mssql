'use client';

import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  FileUp,
  Database,
  Table2,
  Play,
  RefreshCw,
  Edit2,
  Trash2,
  Plus,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Save,
  X,
  Server,
  Upload,
  Download,
} from 'lucide-react';

// Simple SQL parser for MSSQL dump files
function parseSQLDump(sql: string): { tables: Map<string, { columns: { name: string; type: string }[]; primaryKeys: string[]; rows: unknown[][] }> } {
  const tables = new Map<string, { columns: { name: string; type: string }[]; primaryKeys: string[]; rows: unknown[][] }>();
  
  // Split by statements
  const statements = sql.split(/;\s*\n/);
  
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    
    // Parse CREATE TABLE
    if (trimmed.toUpperCase().startsWith('CREATE TABLE')) {
      const match = trimmed.match(/CREATE\s+TABLE\s+(?:\[?\w+\]?\.)?\[?(\w+)\]?\s*\(([\s\S]+)\)/i);
      if (match) {
        const tableName = match[1];
        const columnsStr = match[2];
        
        const columns: { name: string; type: string }[] = [];
        const primaryKeys: string[] = [];
        
        // Parse columns
        const parts = columnsStr.split(/,\s*(?![^()]*\))/);
        
        for (const part of parts) {
          const trimmedPart = part.trim();
          
          // Primary key constraint
          if (trimmedPart.match(/PRIMARY\s+KEY\s*\((.+)\)/i)) {
            const pkMatch = trimmedPart.match(/PRIMARY\s+KEY\s*\((.+)\)/i);
            if (pkMatch) {
              const pkCols = pkMatch[1].split(',').map(c => c.replace(/[\[\]]/g, '').trim());
              primaryKeys.push(...pkCols);
            }
            continue;
          }
          
          // Skip other constraints
          if (trimmedPart.match(/^(CONSTRAINT|FOREIGN\s+KEY|UNIQUE|CHECK|DEFAULT|INDEX)/i)) {
            continue;
          }
          
          // Column definition
          const colMatch = trimmedPart.match(/\[?(\w+)\]?\s+(\w+(?:\s*\([^)]+\))?)\s*(.*)/i);
          if (colMatch) {
            const colName = colMatch[1];
            const colType = colMatch[2];
            columns.push({ name: colName, type: colType });
            
            // Check for inline PRIMARY KEY
            if (colMatch[3] && colMatch[3].toUpperCase().includes('PRIMARY KEY')) {
              primaryKeys.push(colName);
            }
          }
        }
        
        tables.set(tableName, { columns, primaryKeys, rows: [] });
      }
    }
    
    // Parse INSERT
    if (trimmed.toUpperCase().startsWith('INSERT INTO')) {
      const match = trimmed.match(/INSERT\s+INTO\s+(?:\[?\w+\]?\.)?\[?(\w+)\]?\s*(?:\(([^)]+)\))?\s*VALUES\s*\(([\s\S]+)\)/i);
      if (match) {
        const tableName = match[1];
        const valuesStr = match[3];
        
        // Parse values
        const values = parseValues(valuesStr);
        
        let table = tables.get(tableName);
        if (!table) {
          // Create table from insert
          table = { 
            columns: values.map((_, i) => ({ name: `column_${i}`, type: 'TEXT' })),
            primaryKeys: [],
            rows: []
          };
          tables.set(tableName, table);
        }
        
        table.rows.push(values);
      }
    }
  }
  
  return { tables };
}

// Parse values from INSERT statement
function parseValues(str: string): unknown[] {
  const values: unknown[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let depth = 0;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const prevChar = i > 0 ? str[i - 1] : '';
    
    // Handle string literals
    if ((char === "'" || char === '"') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
        continue;
      } else if (char === stringChar) {
        // Check for escaped quote
        if (str[i + 1] === stringChar) {
          current += char;
          continue;
        }
        inString = false;
        continue;
      }
    }
    
    if (!inString) {
      if (char === '(') depth++;
      if (char === ')') depth--;
      
      if (char === ',' && depth === 0) {
        values.push(parseValue(current.trim()));
        current = '';
        continue;
      }
    }
    
    current += char;
  }
  
  if (current.trim()) {
    values.push(parseValue(current.trim()));
  }
  
  return values;
}

// Parse a single value
function parseValue(str: string): unknown {
  if (str === 'NULL' || str === 'null') return null;
  
  // String value
  if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
    return str.slice(1, -1).replace(/''/g, "'").replace(/\\"/g, '"');
  }
  
  // Number
  if (/^-?\d+$/.test(str)) return parseInt(str, 10);
  if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);
  
  // Boolean
  if (str.toLowerCase() === 'true') return true;
  if (str.toLowerCase() === 'false') return false;
  
  return str;
}

// MSSQL to SQLite type mapping
function mssqlToSqliteType(mssqlType: string): string {
  const type = mssqlType.toUpperCase();
  if (type.includes('INT')) return 'INTEGER';
  if (type.includes('CHAR') || type.includes('TEXT') || type.includes('VARCHAR')) return 'TEXT';
  if (type.includes('DECIMAL') || type.includes('NUMERIC') || type.includes('FLOAT') || type.includes('REAL') || type.includes('MONEY')) return 'REAL';
  if (type.includes('DATE') || type.includes('TIME')) return 'TEXT';
  if (type === 'BIT') return 'INTEGER';
  return 'TEXT';
}

// MSSQL to MySQL type mapping
function mssqlToMysqlType(mssqlType: string): string {
  const type = mssqlType.toUpperCase();
  if (type === 'BIGINT') return 'BIGINT';
  if (type === 'INT' || type === 'INTEGER') return 'INT';
  if (type === 'SMALLINT') return 'SMALLINT';
  if (type === 'TINYINT') return 'TINYINT';
  if (type === 'BIT') return 'BOOLEAN';
  if (type.includes('DECIMAL') || type.includes('NUMERIC')) return 'DECIMAL(18,4)';
  if (type === 'MONEY' || type === 'SMALLMONEY') return 'DECIMAL(19,4)';
  if (type === 'FLOAT') return 'DOUBLE';
  if (type === 'REAL') return 'FLOAT';
  if (type.includes('DATETIME')) return 'DATETIME';
  if (type === 'DATE') return 'DATE';
  if (type === 'TIME') return 'TIME';
  if (type.includes('VARCHAR') || type.includes('NVARCHAR')) return 'VARCHAR(255)';
  if (type.includes('CHAR') || type.includes('NCHAR')) return 'CHAR(255)';
  if (type === 'NTEXT' || type === 'TEXT') return 'LONGTEXT';
  if (type === 'UNIQUEIDENTIFIER') return 'CHAR(36)';
  return 'TEXT';
}

interface TableSchema {
  name: string;
  columns: { name: string; type: string; nullable: boolean }[];
  primaryKeys: string[];
}

interface TableData {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function SQLFileManager() {
  // File states
  const [fileName, setFileName] = useState<string>('');
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState({ percent: 0, message: '' });
  const [tables, setTables] = useState<string[]>([]);
  const [tableSchemas, setTableSchemas] = useState<Map<string, TableSchema>>(new Map());
  const [tableRows, setTableRows] = useState<Map<string, unknown[][]>>(new Map());
  const [dbReady, setDbReady] = useState(false);
  
  // Data viewer states
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [tableSchema, setTableSchema] = useState<TableSchema | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  
  // Edit states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState<'edit' | 'add'>('edit');
  const [editingRow, setEditingRow] = useState<Record<string, unknown>>({});
  const [rowIndex, setRowIndex] = useState<number>(-1);
  
  // MySQL connection for migration
  const [mysqlConfig, setMysqlConfig] = useState({
    host: '',
    port: 3306,
    database: '',
    user: '',
    password: '',
  });
  
  // Migration states
  const [migrationDialogOpen, setMigrationDialogOpen] = useState(false);
  const [selectedTablesForMigration, setSelectedTablesForMigration] = useState<string[]>([]);
  const [migrating, setMigrating] = useState(false);
  const [migrationResults, setMigrationResults] = useState<{ table: string; status: string; sql: string }[] | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setFileName(file.name);
    setParsing(true);
    setParseProgress({ percent: 0, message: 'Reading file...' });
    
    try {
      // Read file in chunks
      const chunkSize = 10 * 1024 * 1024; // 10MB chunks
      const fileSize = file.size;
      let offset = 0;
      let sqlContent = '';
      
      const reader = new FileReader();
      
      const readChunk = (start: number): Promise<string> => {
        return new Promise((resolve, reject) => {
          const end = Math.min(start + chunkSize, fileSize);
          const blob = file.slice(start, end);
          
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsText(blob);
        });
      };
      
      while (offset < fileSize) {
        const chunk = await readChunk(offset);
        sqlContent += chunk;
        offset += chunkSize;
        
        const percent = Math.round((offset / fileSize) * 50);
        setParseProgress({ percent, message: `Reading file... ${Math.round(offset / 1024 / 1024)}MB / ${Math.round(fileSize / 1024 / 1024)}MB` });
      }
      
      setParseProgress({ percent: 50, message: 'Parsing SQL statements...' });
      
      // Parse SQL
      const result = parseSQLDump(sqlContent);
      
      setParseProgress({ percent: 90, message: 'Processing tables...' });
      
      // Convert to our format
      const tableNames: string[] = [];
      const schemas = new Map<string, TableSchema>();
      const rows = new Map<string, unknown[][]>();
      
      for (const [tableName, table] of result.tables) {
        tableNames.push(tableName);
        
        schemas.set(tableName, {
          name: tableName,
          columns: table.columns.map(col => ({
            name: col.name,
            type: col.type,
            nullable: true,
          })),
          primaryKeys: table.primaryKeys,
        });
        
        rows.set(tableName, table.rows);
      }
      
      setTables(tableNames.sort());
      setTableSchemas(schemas);
      setTableRows(rows);
      setDbReady(true);
      setParseProgress({ percent: 100, message: `Complete! Found ${tableNames.length} tables.` });
      
    } catch (error) {
      setParseProgress({ percent: 0, message: `Error: ${error instanceof Error ? error.message : 'Failed to parse'}` });
    } finally {
      setParsing(false);
    }
  }, []);
  
  // Load table data
  const loadTableData = (tableName: string, page: number = 1) => {
    setLoadingData(true);
    setSelectedTable(tableName);
    
    const schema = tableSchemas.get(tableName);
    const rows = tableRows.get(tableName) || [];
    
    if (schema) {
      setTableSchema(schema);
      
      const pageSize = 50;
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const pageRows = rows.slice(start, end);
      
      // Convert rows to objects
      const data = pageRows.map(row => {
        const obj: Record<string, unknown> = {};
        schema.columns.forEach((col, i) => {
          obj[col.name] = row[i];
        });
        return obj;
      });
      
      setTableData({
        data,
        total: rows.length,
        page,
        pageSize,
        totalPages: Math.ceil(rows.length / pageSize),
      });
    }
    
    setLoadingData(false);
  };
  
  // Handle page change
  const handlePageChange = (newPage: number) => {
    if (selectedTable) {
      loadTableData(selectedTable, newPage);
    }
  };
  
  // Open edit dialog
  const openEditDialog = (row: Record<string, unknown>, idx: number, mode: 'edit' | 'add' = 'edit') => {
    if (!tableSchema) return;
    
    setEditMode(mode);
    setEditingRow({ ...row });
    setRowIndex(idx);
    setEditDialogOpen(true);
  };
  
  // Save row changes
  const saveRowChanges = () => {
    if (!selectedTable || !tableSchema || !tableData) return;
    
    const rows = tableRows.get(selectedTable) || [];
    
    if (editMode === 'add') {
      // Add new row
      const newRow = tableSchema.columns.map(col => editingRow[col.name]);
      rows.push(newRow);
    } else {
      // Update existing row
      const actualIndex = (tableData.page - 1) * tableData.pageSize + rowIndex;
      const updatedRow = tableSchema.columns.map(col => editingRow[col.name]);
      rows[actualIndex] = updatedRow;
    }
    
    setTableRows(new Map(tableRows).set(selectedTable, rows));
    setEditDialogOpen(false);
    loadTableData(selectedTable, tableData.page);
  };
  
  // Delete row
  const deleteRow = (row: Record<string, unknown>, idx: number) => {
    if (!selectedTable || !tableData) return;
    
    if (!confirm('Are you sure you want to delete this row?')) return;
    
    const rows = tableRows.get(selectedTable) || [];
    const actualIndex = (tableData.page - 1) * tableData.pageSize + idx;
    rows.splice(actualIndex, 1);
    
    setTableRows(new Map(tableRows).set(selectedTable, rows));
    loadTableData(selectedTable, tableData.page);
  };
  
  // Toggle table selection for migration
  const toggleTableSelection = (tableName: string) => {
    setSelectedTablesForMigration(prev => 
      prev.includes(tableName) 
        ? prev.filter(t => t !== tableName)
        : [...prev, tableName]
    );
  };
  
  // Select all tables
  const selectAllTables = () => {
    setSelectedTablesForMigration([...tables]);
  };
  
  // Deselect all tables
  const deselectAllTables = () => {
    setSelectedTablesForMigration([]);
  };
  
  // Generate MySQL export SQL
  const generateMySQLExport = () => {
    if (selectedTablesForMigration.length === 0) return;
    
    const results: { table: string; status: string; sql: string }[] = [];
    
    for (const tableName of selectedTablesForMigration) {
      const schema = tableSchemas.get(tableName);
      const rows = tableRows.get(tableName) || [];
      
      if (!schema) continue;
      
      try {
        // Generate CREATE TABLE
        const columnDefs = schema.columns.map(col => {
          const mysqlType = mssqlToMysqlType(col.type);
          return `\`${col.name}\` ${mysqlType}`;
        });
        
        const pkDef = schema.primaryKeys.length > 0
          ? `, PRIMARY KEY (${schema.primaryKeys.map(pk => `\`${pk}\``).join(', ')})`
          : '';
        
        const createSQL = `DROP TABLE IF EXISTS \`${tableName}\`;\nCREATE TABLE \`${tableName}\` (\n  ${columnDefs.join(',\n  ')}${pkDef}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
        
        // Generate INSERT statements
        const insertStatements: string[] = [];
        const colNames = schema.columns.map(c => `\`${c.name}\``).join(', ');
        
        for (const row of rows) {
          const values = row.map(val => {
            if (val === null) return 'NULL';
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            if (typeof val === 'number') return val.toString();
            return `'${val}'`;
          }).join(', ');
          
          insertStatements.push(`INSERT INTO \`${tableName}\` (${colNames}) VALUES (${values});`);
        }
        
        results.push({
          table: tableName,
          status: 'success',
          sql: `${createSQL}\n\n${insertStatements.join('\n')}`,
        });
      } catch (error) {
        results.push({
          table: tableName,
          status: 'error',
          sql: `-- Error: ${error}`,
        });
      }
    }
    
    setMigrationResults(results);
  };
  
  // Download MySQL export
  const downloadExport = () => {
    if (!migrationResults || migrationResults.length === 0) return;
    
    const fullSQL = migrationResults.map(r => r.sql).join('\n\n-- ----------------------------------------\n\n');
    const blob = new Blob([fullSQL], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mysql_export.sql';
    a.click();
    
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-2 rounded-lg">
              <Database className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                SQL File Manager
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Open, view, edit MSSQL .sql dump files and export to MySQL
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* File Upload Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-600" />
              Upload SQL File
            </CardTitle>
            <CardDescription>
              Select your MSSQL .sql dump file from your computer (supports large files)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".sql,.txt"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <div 
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="h-12 w-12 mx-auto mb-4 text-slate-400" />
              <p className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                Click to select SQL file
              </p>
              <p className="text-sm text-slate-500">
                {fileName || 'Supports .sql files (MSSQL dump format)'}
              </p>
            </div>
            
            {parsing && (
              <div className="space-y-2">
                <Progress value={parseProgress.percent} />
                <p className="text-sm text-center text-muted-foreground">{parseProgress.message}</p>
              </div>
            )}
            
            {dbReady && !parsing && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span>Loaded {tables.length} tables from {fileName}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Content */}
        {dbReady && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Tables List */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Tables ({tables.length})</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMigrationDialogOpen(true)}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="p-2 space-y-1">
                    {tables.map((table) => {
                      const rowCount = tableRows.get(table)?.length || 0;
                      return (
                        <Button
                          key={table}
                          variant={selectedTable === table ? 'default' : 'ghost'}
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => loadTableData(table)}
                        >
                          <Table2 className="h-4 w-4 mr-2 text-blue-600" />
                          <span className="truncate flex-1 text-left">{table}</span>
                          <Badge variant="secondary" className="ml-1">{rowCount}</Badge>
                        </Button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Data Viewer */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {selectedTable ? (
                        <>
                          <Table2 className="h-5 w-5" />
                          {selectedTable}
                        </>
                      ) : (
                        'Select a Table'
                      )}
                    </CardTitle>
                    {tableData && (
                      <CardDescription>
                        {tableData.total} rows • Page {tableData.page} of {tableData.totalPages}
                      </CardDescription>
                    )}
                  </div>
                  {selectedTable && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog({}, -1, 'add')}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Row
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadTableData(selectedTable, tableData?.page || 1)}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Refresh
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loadingData ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : tableData && tableData.data.length > 0 ? (
                  <>
                    <div className="overflow-x-auto border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {Object.keys(tableData.data[0]).map((col) => (
                              <TableHead key={col} className="font-semibold whitespace-nowrap">
                                {col}
                                {tableSchema?.primaryKeys.includes(col) && (
                                  <Badge variant="secondary" className="ml-1 text-xs">PK</Badge>
                                )}
                              </TableHead>
                            ))}
                            <TableHead className="w-24">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tableData.data.map((row, rowIndex) => (
                            <TableRow key={rowIndex}>
                              {Object.values(row).map((value, colIndex) => (
                                <TableCell key={colIndex} className="whitespace-nowrap max-w-xs truncate">
                                  {value === null ? (
                                    <span className="text-muted-foreground italic">NULL</span>
                                  ) : typeof value === 'object' ? (
                                    JSON.stringify(value)
                                  ) : (
                                    String(value)
                                  )}
                                </TableCell>
                              ))}
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditDialog(row, rowIndex, 'edit')}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => deleteRow(row, rowIndex)}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    
                    {/* Pagination */}
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground">
                        Showing {((tableData.page - 1) * tableData.pageSize) + 1} to{' '}
                        {Math.min(tableData.page * tableData.pageSize, tableData.total)} of{' '}
                        {tableData.total} rows
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={tableData.page <= 1}
                          onClick={() => handlePageChange(tableData.page - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={tableData.page >= tableData.totalPages}
                          onClick={() => handlePageChange(tableData.page + 1)}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                ) : selectedTable ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No data found in this table
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    Select a table from the left to view its data
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Instructions */}
        {!dbReady && !parsing && (
          <Card className="bg-slate-50 dark:bg-slate-800/50">
            <CardHeader>
              <CardTitle className="text-lg">How to Use</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg">
                  <h4 className="font-semibold mb-2">1. Upload SQL File</h4>
                  <p className="text-sm text-muted-foreground">
                    Click the upload area and select your MSSQL .sql dump file from your computer.
                    Large files (900MB+) are supported.
                  </p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg">
                  <h4 className="font-semibold mb-2">2. View & Edit Data</h4>
                  <p className="text-sm text-muted-foreground">
                    Browse tables, view data with pagination, add, edit, or delete rows.
                  </p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg">
                  <h4 className="font-semibold mb-2">3. Export to MySQL</h4>
                  <p className="text-sm text-muted-foreground">
                    Click "Export" to generate MySQL-compatible SQL statements for migration.
                  </p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg">
                  <h4 className="font-semibold mb-2">4. Download Export</h4>
                  <p className="text-sm text-muted-foreground">
                    Download the generated MySQL SQL file and run it on your MySQL server.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editMode === 'add' ? 'Add New Row' : 'Edit Row'}
            </DialogTitle>
            <DialogDescription>
              {editMode === 'add' 
                ? 'Enter values for the new row'
                : 'Modify the row values below'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {tableSchema?.columns.map((col) => {
              const isPrimaryKey = tableSchema.primaryKeys.includes(col.name);
              return (
                <div key={col.name}>
                  <Label htmlFor={`edit-${col.name}`}>
                    {col.name}
                    {isPrimaryKey && <Badge variant="secondary" className="ml-2">PK</Badge>}
                    <span className="text-xs text-muted-foreground ml-2">
                      ({col.type})
                    </span>
                  </Label>
                  <input
                    id={`edit-${col.name}`}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editingRow[col.name]?.toString() || ''}
                    onChange={(e) => setEditingRow({ 
                      ...editingRow, 
                      [col.name]: e.target.value 
                    })}
                    disabled={editMode === 'edit' && isPrimaryKey}
                    placeholder="NULL"
                  />
                </div>
              );
            })}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={saveRowChanges}>
              <Save className="h-4 w-4 mr-2" />
              {editMode === 'add' ? 'Insert' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Export Dialog */}
      <Dialog open={migrationDialogOpen} onOpenChange={setMigrationDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Export to MySQL</DialogTitle>
            <DialogDescription>
              Select tables to export as MySQL-compatible SQL statements
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Table Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{selectedTablesForMigration.length} of {tables.length} tables selected</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllTables}>
                    Select All
                  </Button>
                  <Button variant="outline" size="sm" onClick={deselectAllTables}>
                    Deselect All
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-48 border rounded-lg">
                <div className="p-2 space-y-2">
                  {tables.map((table) => (
                    <label
                      key={table}
                      className="flex items-center gap-3 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTablesForMigration.includes(table)}
                        onChange={() => toggleTableSelection(table)}
                        className="h-4 w-4"
                      />
                      <Table2 className="h-4 w-4 text-blue-600" />
                      <span>{table}</span>
                      <Badge variant="secondary">{tableRows.get(table)?.length || 0} rows</Badge>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
            
            {/* Results */}
            {migrationResults && (
              <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">Export Ready</h4>
                  <Button onClick={downloadExport} size="sm">
                    <Download className="h-4 w-4 mr-1" />
                    Download SQL File
                  </Button>
                </div>
                <ScrollArea className="h-32">
                  <div className="space-y-2">
                    {migrationResults.map((result) => (
                      <div
                        key={result.table}
                        className={`flex items-center gap-2 p-2 rounded ${
                          result.status === 'success' 
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}
                      >
                        {result.status === 'success' ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        <span className="font-medium">{result.table}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setMigrationDialogOpen(false)}>
              Close
            </Button>
            <Button
              onClick={generateMySQLExport}
              disabled={selectedTablesForMigration.length === 0}
              className="bg-gradient-to-r from-blue-500 to-purple-600"
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Generate MySQL Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            SQL File Manager - Open, view, edit MSSQL dump files and export to MySQL
          </p>
        </div>
      </footer>
    </div>
  );
}
