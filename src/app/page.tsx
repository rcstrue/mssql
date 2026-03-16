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
  Upload,
  Download,
  FolderOpen,
  AlertCircle,
  Eye,
  Bug,
} from 'lucide-react';

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
  const [parseError, setParseError] = useState<string | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [tableSchemas, setTableSchemas] = useState<Map<string, TableSchema>>(new Map());
  const [tableRows, setTableRows] = useState<Map<string, unknown[][]>>(new Map());
  const [dbReady, setDbReady] = useState(false);
  
  // Debug
  const [rawSQL, setRawSQL] = useState<string>('');
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  
  // Data viewer states
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [tableSchema, setTableSchema] = useState<TableSchema | null>(null);
  
  // Edit states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState<'edit' | 'add'>('edit');
  const [editingRow, setEditingRow] = useState<Record<string, unknown>>({});
  const [rowIndex, setRowIndex] = useState<number>(-1);
  
  // Export states
  const [migrationDialogOpen, setMigrationDialogOpen] = useState(false);
  const [selectedTablesForMigration, setSelectedTablesForMigration] = useState<string[]>([]);
  const [migrationResults, setMigrationResults] = useState<{ table: string; status: string; sql: string }[] | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Main SQL Parser
  const parseSQL = useCallback((sql: string, name: string) => {
    setParsing(true);
    setParseError(null);
    setDebugInfo([]);
    const debug: string[] = [];
    
    debug.push(`File: ${name}`);
    debug.push(`SQL Length: ${sql.length} characters`);
    debug.push(`First 200 chars: ${sql.substring(0, 200)}`);
    
    try {
      setParseProgress({ percent: 20, message: 'Analyzing SQL structure...' });
      
      // Normalize SQL
      let normalized = sql
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
      
      // Check for common patterns
      const hasCreateTable = /CREATE\s+TABLE/i.test(normalized);
      const hasInsert = /INSERT\s+INTO/i.test(normalized);
      const hasGO = /^\s*GO\s*$/im.test(normalized);
      const hasSemicolon = /;\s*\n/.test(normalized);
      
      debug.push(`Has CREATE TABLE: ${hasCreateTable}`);
      debug.push(`Has INSERT INTO: ${hasInsert}`);
      debug.push(`Has GO statements: ${hasGO}`);
      debug.push(`Has semicolons: ${hasSemicolon}`);
      
      // Split into statements
      let statements: string[] = [];
      
      if (hasGO) {
        // Split by GO
        statements = normalized.split(/^\s*GO\s*$/im).map(s => s.trim()).filter(Boolean);
        debug.push(`Split by GO: ${statements.length} blocks`);
      } else {
        // Split by semicolons, but handle strings
        statements = splitBySemicolon(normalized);
        debug.push(`Split by semicolon: ${statements.length} statements`);
      }
      
      setParseProgress({ percent: 40, message: `Processing ${statements.length} statements...` });
      
      const tables = new Map<string, { columns: { name: string; type: string }[]; primaryKeys: string[]; rows: unknown[][] }>();
      let createCount = 0;
      let insertCount = 0;
      
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        if (!stmt || stmt.length < 10) continue;
        
        const upper = stmt.toUpperCase().trim();
        
        // Skip comments and certain statements
        if (upper.startsWith('--') || upper.startsWith('/*') || 
            upper.startsWith('PRINT') || upper.startsWith('EXEC SP_')) {
          continue;
        }
        
        // CREATE TABLE
        if (upper.includes('CREATE') && upper.includes('TABLE')) {
          createCount++;
          const result = parseCreateTable(stmt);
          if (result) {
            tables.set(result.name, {
              columns: result.columns,
              primaryKeys: result.primaryKeys,
              rows: []
            });
            debug.push(`CREATE TABLE: ${result.name} (${result.columns.length} columns)`);
          }
        }
        
        // INSERT INTO
        if (upper.includes('INSERT') && upper.includes('INTO')) {
          insertCount++;
          const result = parseInsert(stmt, tables);
          if (result) {
            debug.push(`INSERT INTO: ${result.table} (${result.rowCount} rows)`);
          }
        }
      }
      
      debug.push(`Total CREATE TABLE: ${createCount}`);
      debug.push(`Total INSERT INTO: ${insertCount}`);
      debug.push(`Tables found: ${tables.size}`);
      
      // List all tables
      for (const [name, data] of tables) {
        debug.push(`  - ${name}: ${data.columns.length} cols, ${data.rows.length} rows`);
      }
      
      setDebugInfo(debug);
      
      // Convert to state
      const tableNames = Array.from(tables.keys()).sort();
      const schemas = new Map<string, TableSchema>();
      const rows = new Map<string, unknown[][]>();
      
      for (const [tableName, table] of tables) {
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
      
      setTables(tableNames);
      setTableSchemas(schemas);
      setTableRows(rows);
      
      if (tableNames.length === 0) {
        setParseError('No tables found. Check the Debug Info to see what was detected.');
      } else {
        setDbReady(true);
      }
      
      setParseProgress({ percent: 100, message: `Found ${tableNames.length} tables!` });
      
    } catch (error) {
      debug.push(`ERROR: ${error}`);
      setParseError(error instanceof Error ? error.message : 'Parse failed');
    }
    
    setDebugInfo(debug);
    setParsing(false);
  }, []);
  
  // Split by semicolon handling strings
  function splitBySemicolon(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < sql.length; i++) {
      const char = sql[i];
      const nextChar = sql[i + 1];
      
      if ((char === "'" || char === '"') && !inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar && inString) {
        if (nextChar === stringChar) {
          current += char + nextChar;
          i++;
          continue;
        }
        inString = false;
      }
      
      if (!inString && char === ';') {
        const stmt = current.trim();
        if (stmt) statements.push(stmt);
        current = '';
        continue;
      }
      
      current += char;
    }
    
    if (current.trim()) statements.push(current.trim());
    return statements;
  }
  
  // Parse CREATE TABLE
  function parseCreateTable(stmt: string): { name: string; columns: { name: string; type: string }[]; primaryKeys: string[] } | null {
    try {
      // Various patterns for table name extraction
      const patterns = [
        /CREATE\s+TABLE\s+\[?\w+\]?\.\[(\w+)\]\s*\(([\s\S]+)\)/i,
        /CREATE\s+TABLE\s+\[(\w+)\]\s*\(([\s\S]+)\)/i,
        /CREATE\s+TABLE\s+(\w+)\s*\(([\s\S]+)\)/i,
        /CREATE\s+TABLE\s+\[?\w+\]?\.\[?(\w+)\]?\s*\(([\s\S]+)\)/i,
      ];
      
      let tableName = '';
      let columnsStr = '';
      
      for (const pattern of patterns) {
        const match = stmt.match(pattern);
        if (match) {
          tableName = match[1];
          columnsStr = match[2];
          break;
        }
      }
      
      if (!tableName) return null;
      
      // Find the last closing paren (handle nested parens)
      let depth = 0;
      let endIdx = columnsStr.length - 1;
      for (let i = columnsStr.length - 1; i >= 0; i--) {
        if (columnsStr[i] === ')') depth++;
        if (columnsStr[i] === '(') depth--;
        if (depth < 0) {
          endIdx = i;
          break;
        }
      }
      columnsStr = columnsStr.substring(0, endIdx);
      
      // Split columns
      const columns: { name: string; type: string }[] = [];
      const primaryKeys: string[] = [];
      
      // Split by comma, but handle nested parens
      const parts: string[] = [];
      let current = '';
      let pDepth = 0;
      let inStr = false;
      let strChar = '';
      
      for (const char of columnsStr) {
        if ((char === "'" || char === '"') && !inStr) {
          inStr = true;
          strChar = char;
        } else if (char === strChar && inStr) {
          inStr = false;
        }
        
        if (!inStr) {
          if (char === '(') pDepth++;
          if (char === ')') pDepth--;
          if (char === ',' && pDepth === 0) {
            parts.push(current.trim());
            current = '';
            continue;
          }
        }
        current += char;
      }
      if (current.trim()) parts.push(current.trim());
      
      for (const part of parts) {
        const upper = part.toUpperCase().trim();
        
        // Skip constraints
        if (upper.startsWith('PRIMARY KEY')) {
          const match = part.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
          if (match) {
            const cols = match[1].split(',').map(c => c.replace(/[\[\]]/g, '').trim());
            primaryKeys.push(...cols);
          }
          continue;
        }
        
        if (upper.startsWith('CONSTRAINT') || upper.startsWith('FOREIGN') ||
            upper.startsWith('UNIQUE') || upper.startsWith('CHECK') ||
            upper.startsWith('KEY ') || upper.startsWith('DEFAULT')) {
          continue;
        }
        
        // Column definition
        const colMatch = part.match(/^\[?(\w+)\]?\s+(\w+)(?:\s*\(([^)]+)\))?/i);
        if (colMatch) {
          const colName = colMatch[1];
          const colType = colMatch[2] + (colMatch[3] ? `(${colMatch[3]})` : '');
          columns.push({ name: colName, type: colType });
          
          // Check for inline PK
          if (part.toUpperCase().includes('PRIMARY KEY')) {
            primaryKeys.push(colName);
          }
        }
      }
      
      return columns.length > 0 ? { name: tableName, columns, primaryKeys } : null;
      
    } catch (e) {
      return null;
    }
  }
  
  // Parse INSERT
  function parseInsert(stmt: string, tables: Map<string, any>): { table: string; rowCount: number } | null {
    try {
      // Match INSERT patterns
      let match = stmt.match(/INSERT\s+INTO\s+\[?\w+\]?\.\[(\w+)\]\s*(?:\(([^)]+)\))?\s*VALUES\s*/i);
      if (!match) {
        match = stmt.match(/INSERT\s+INTO\s+\[(\w+)\]\s*(?:\(([^)]+)\))?\s*VALUES\s*/i);
      }
      if (!match) {
        match = stmt.match(/INSERT\s+INTO\s+(\w+)\s*(?:\(([^)]+)\))?\s*VALUES\s*/i);
      }
      
      if (!match) return null;
      
      const tableName = match[1];
      const columnsStr = match[2] || '';
      
      // Get values part
      const valuesIdx = stmt.toUpperCase().indexOf('VALUES');
      if (valuesIdx === -1) return null;
      
      const valuesStr = stmt.substring(valuesIdx + 6);
      
      // Parse values
      const values = parseValues(valuesStr);
      if (values.length === 0) return null;
      
      // Get or create table
      let table = tables.get(tableName);
      if (!table) {
        // Create from insert
        const columns = columnsStr 
          ? columnsStr.split(',').map(c => c.replace(/[\[\]]/g, '').trim())
          : values.map((_, i) => `Column${i + 1}`);
        
        table = {
          columns: columns.map(c => ({ name: c, type: 'TEXT' })),
          primaryKeys: [],
          rows: []
        };
        tables.set(tableName, table);
      }
      
      table.rows.push(values);
      
      return { table: tableName, rowCount: 1 };
      
    } catch (e) {
      return null;
    }
  }
  
  // Parse values
  function parseValues(str: string): unknown[] {
    const values: unknown[] = [];
    let current = '';
    let inString = false;
    let strChar = '';
    
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const nextChar = str[i + 1];
      
      if ((char === "'" || char === '"') && !inString) {
        inString = true;
        strChar = char;
        continue;
      }
      
      if (char === strChar && inString) {
        if (nextChar === strChar) {
          current += strChar;
          i++;
          continue;
        }
        inString = false;
        continue;
      }
      
      if (!inString && char === ',') {
        values.push(parseValue(current.trim()));
        current = '';
        continue;
      }
      
      if (!inString && (char === '(' || char === ')')) continue;
      
      current += char;
    }
    
    if (current.trim()) values.push(parseValue(current.trim()));
    
    return values;
  }
  
  // Parse single value
  function parseValue(str: string): unknown {
    if (!str || str.toUpperCase() === 'NULL') return null;
    if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
      return str.slice(1, -1).replace(/''/g, "'");
    }
    if (/^-?\d+$/.test(str)) return parseInt(str);
    if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);
    return str;
  }
  
  // Handle file selection
  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setFileName(file.name);
    setParseError(null);
    setDbReady(false);
    setTables([]);
    setParsing(true);
    setParseProgress({ percent: 10, message: 'Reading file...' });
    
    try {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const sql = e.target?.result as string;
        setRawSQL(sql);
        parseSQL(sql, file.name);
      };
      
      reader.onerror = () => {
        setParseError('Failed to read file');
        setParsing(false);
      };
      
      reader.readAsText(file);
      
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Failed to read file');
      setParsing(false);
    }
  }, [parseSQL]);
  
  // Load table data
  const loadTableData = (tableName: string, page: number = 1) => {
    setSelectedTable(tableName);
    
    const schema = tableSchemas.get(tableName);
    const rows = tableRows.get(tableName) || [];
    
    if (schema) {
      setTableSchema(schema);
      
      const pageSize = 50;
      const start = (page - 1) * pageSize;
      const pageRows = rows.slice(start, start + pageSize);
      
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
  };
  
  // Export functions
  const toggleTableSelection = (tableName: string) => {
    setSelectedTablesForMigration(prev => 
      prev.includes(tableName) ? prev.filter(t => t !== tableName) : [...prev, tableName]
    );
  };
  
  const selectAllTables = () => setSelectedTablesForMigration([...tables]);
  const deselectAllTables = () => setSelectedTablesForMigration([]);
  
  const generateMySQLExport = () => {
    if (selectedTablesForMigration.length === 0) return;
    
    const results: { table: string; status: string; sql: string }[] = [];
    
    for (const tableName of selectedTablesForMigration) {
      const schema = tableSchemas.get(tableName);
      const rows = tableRows.get(tableName) || [];
      
      if (!schema) continue;
      
      const columnDefs = schema.columns.map(col => `\`${col.name}\` TEXT`);
      const pkDef = schema.primaryKeys.length > 0
        ? `, PRIMARY KEY (${schema.primaryKeys.map(pk => `\`${pk}\``).join(', ')})`
        : '';
      
      const createSQL = `DROP TABLE IF EXISTS \`${tableName}\`;\nCREATE TABLE \`${tableName}\` (\n  ${columnDefs.join(',\n  ')}${pkDef}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
      
      const colNames = schema.columns.map(c => `\`${c.name}\``).join(', ');
      const inserts = rows.map(row => {
        const values = row.map(val => {
          if (val === null) return 'NULL';
          if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
          return `'${val}'`;
        }).join(', ');
        return `INSERT INTO \`${tableName}\` (${colNames}) VALUES (${values});`;
      });
      
      results.push({ table: tableName, status: 'success', sql: `${createSQL}\n\n${inserts.join('\n')}` });
    }
    
    setMigrationResults(results);
  };
  
  const downloadExport = () => {
    if (!migrationResults) return;
    const fullSQL = migrationResults.map(r => r.sql).join('\n\n-- --------\n\n');
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
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-2 rounded-lg">
              <Database className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">SQL File Manager</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Open, view, edit MSSQL .sql dump files</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Upload Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-600" />
              Upload SQL File
            </CardTitle>
            <CardDescription>Select your MSSQL .sql dump file (SSMS export format supported)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input ref={fileInputRef} type="file" accept=".sql,.txt" onChange={handleFileSelect} className="hidden" />
            
            <div 
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="h-12 w-12 mx-auto mb-4 text-slate-400" />
              <p className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                Click to select SQL file
              </p>
              <p className="text-sm text-slate-500">{fileName || 'Supports .sql files'}</p>
            </div>
            
            {parsing && (
              <div className="space-y-2">
                <Progress value={parseProgress.percent} />
                <p className="text-sm text-center text-muted-foreground">{parseProgress.message}</p>
              </div>
            )}
            
            {parseError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 text-red-600 rounded-lg">
                <AlertCircle className="h-5 w-5" />
                {parseError}
              </div>
            )}
            
            {dbReady && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span>Loaded {tables.length} tables from {fileName}</span>
                <Button variant="ghost" size="sm" onClick={() => setShowDebug(!showDebug)}>
                  <Bug className="h-4 w-4 mr-1" />
                  {showDebug ? 'Hide' : 'Show'} Debug
                </Button>
              </div>
            )}
            
            {/* Debug Info */}
            {(showDebug || (!dbReady && debugInfo.length > 0)) && debugInfo.length > 0 && (
              <div className="bg-slate-900 text-green-400 p-4 rounded-lg font-mono text-xs overflow-x-auto">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-400">Debug Info:</span>
                  <Button variant="ghost" size="sm" className="text-slate-400 h-6" onClick={() => setShowDebug(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                {debugInfo.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tables & Data */}
        {dbReady && tables.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Tables List */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Tables ({tables.length})</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setMigrationDialogOpen(true)}>
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
                      const colCount = tableSchemas.get(table)?.columns.length || 0;
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
                          <Badge variant="secondary" className="ml-1 text-xs">{colCount}c/{rowCount}r</Badge>
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
                <CardTitle className="flex items-center gap-2">
                  {selectedTable ? <><Table2 className="h-5 w-5" />{selectedTable}</> : 'Select a Table'}
                </CardTitle>
                {tableData && (
                  <CardDescription>{tableData.total} rows • Page {tableData.page} of {tableData.totalPages}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {tableData && tableData.data.length > 0 ? (
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
                            <TableHead className="w-20">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tableData.data.map((row, idx) => (
                            <TableRow key={idx}>
                              {Object.values(row).map((val, cIdx) => (
                                <TableCell key={cIdx} className="whitespace-nowrap max-w-xs truncate">
                                  {val === null ? <span className="text-muted-foreground italic">NULL</span> : String(val)}
                                </TableCell>
                              ))}
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => { setEditMode('edit'); setEditingRow({...row}); setRowIndex(idx); setEditDialogOpen(true); }}>
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => {
                                    if (confirm('Delete this row?')) {
                                      const rows = tableRows.get(selectedTable!) || [];
                                      const actualIdx = (tableData.page - 1) * tableData.pageSize + idx;
                                      rows.splice(actualIdx, 1);
                                      setTableRows(new Map(tableRows).set(selectedTable!, rows));
                                      loadTableData(selectedTable!, tableData.page);
                                    }
                                  }}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground">
                        Showing {((tableData.page - 1) * tableData.pageSize) + 1} to {Math.min(tableData.page * tableData.pageSize, tableData.total)} of {tableData.total}
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={tableData.page <= 1} onClick={() => loadTableData(selectedTable!, tableData.page - 1)}>
                          <ChevronLeft className="h-4 w-4" /> Prev
                        </Button>
                        <Button variant="outline" size="sm" disabled={tableData.page >= tableData.totalPages} onClick={() => loadTableData(selectedTable!, tableData.page + 1)}>
                          Next <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                ) : selectedTable ? (
                  <div className="text-center py-12 text-muted-foreground">No data</div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">Select a table</div>
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
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg">
                  <h4 className="font-semibold mb-2">1. Upload SQL File</h4>
                  <p className="text-sm text-muted-foreground">Click above to select your MSSQL .sql dump file exported from SSMS</p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg">
                  <h4 className="font-semibold mb-2">2. View Tables</h4>
                  <p className="text-sm text-muted-foreground">Browse tables and view data with pagination</p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg">
                  <h4 className="font-semibold mb-2">3. Edit Data</h4>
                  <p className="text-sm text-muted-foreground">Add, edit, or delete rows in tables</p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg">
                  <h4 className="font-semibold mb-2">4. Export to MySQL</h4>
                  <p className="text-sm text-muted-foreground">Generate MySQL-compatible SQL export file</p>
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
            <DialogTitle>{editMode === 'add' ? 'Add New Row' : 'Edit Row'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {tableSchema?.columns.map((col) => (
              <div key={col.name}>
                <Label>{col.name} <span className="text-xs text-muted-foreground">({col.type})</span></Label>
                <input
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={editingRow[col.name]?.toString() || ''}
                  onChange={(e) => setEditingRow({...editingRow, [col.name]: e.target.value})}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!selectedTable || !tableSchema || !tableData) return;
              const rows = tableRows.get(selectedTable) || [];
              if (editMode === 'add') {
                rows.push(tableSchema.columns.map(c => editingRow[c.name]));
              } else {
                const actualIdx = (tableData.page - 1) * tableData.pageSize + rowIndex;
                rows[actualIdx] = tableSchema.columns.map(c => editingRow[c.name]);
              }
              setTableRows(new Map(tableRows).set(selectedTable, rows));
              setEditDialogOpen(false);
              loadTableData(selectedTable, tableData.page);
            }}>
              <Save className="h-4 w-4 mr-2" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={migrationDialogOpen} onOpenChange={setMigrationDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Export to MySQL</DialogTitle>
            <DialogDescription>Select tables to export</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-between items-center">
              <Label>{selectedTablesForMigration.length} of {tables.length} tables selected</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllTables}>Select All</Button>
                <Button variant="outline" size="sm" onClick={deselectAllTables}>Deselect All</Button>
              </div>
            </div>
            <ScrollArea className="h-48 border rounded-lg">
              <div className="p-2 space-y-2">
                {tables.map((table) => (
                  <label key={table} className="flex items-center gap-3 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer">
                    <input type="checkbox" checked={selectedTablesForMigration.includes(table)} onChange={() => toggleTableSelection(table)} className="h-4 w-4" />
                    <Table2 className="h-4 w-4 text-blue-600" />
                    <span>{table}</span>
                    <Badge variant="secondary">{tableRows.get(table)?.length || 0} rows</Badge>
                  </label>
                ))}
              </div>
            </ScrollArea>
            {migrationResults && (
              <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-800">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold">Export Ready</h4>
                  <Button onClick={downloadExport} size="sm"><Download className="h-4 w-4 mr-1" />Download</Button>
                </div>
                <ScrollArea className="h-32">
                  {migrationResults.map((r) => (
                    <div key={r.table} className={`flex items-center gap-2 p-2 rounded ${r.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {r.status === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      {r.table}
                    </div>
                  ))}
                </ScrollArea>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMigrationDialogOpen(false)}>Close</Button>
            <Button onClick={generateMySQLExport} disabled={selectedTablesForMigration.length === 0} className="bg-gradient-to-r from-blue-500 to-purple-600">
              <ArrowRight className="h-4 w-4 mr-2" />Generate Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-slate-500">SQL File Manager</p>
        </div>
      </footer>
    </div>
  );
}
