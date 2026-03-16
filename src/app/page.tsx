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
} from 'lucide-react';

// Parse MSSQL dump file
function parseSQLDump(sql: string): { 
  tables: Map<string, { 
    columns: { name: string; type: string }[]; 
    primaryKeys: string[]; 
    rows: unknown[][] 
  }> 
} {
  const tables = new Map<string, { columns: { name: string; type: string }[]; primaryKeys: string[]; rows: unknown[][] }>();
  
  // Normalize the SQL - replace GO with semicolons, handle different line endings
  let normalizedSQL = sql
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^\s*GO\s*$/gim, ';\n')
    .replace(/^\s*USE\s+\[?\w+\]?\s*$/gim, '')
    .replace(/^\s*SET\s+.*$/gim, '');
  
  // Split by statements - handle both semicolons and GO
  const statements: string[] = [];
  let currentStmt = '';
  let inString = false;
  let stringChar = '';
  let parenDepth = 0;
  
  for (let i = 0; i < normalizedSQL.length; i++) {
    const char = normalizedSQL[i];
    const nextChar = normalizedSQL[i + 1] || '';
    
    // Track string literals
    if ((char === "'" || char === '"') && !inString) {
      inString = true;
      stringChar = char;
    } else if (char === stringChar && inString) {
      if (nextChar === stringChar) {
        currentStmt += char + nextChar;
        i++;
        continue;
      }
      inString = false;
    }
    
    if (!inString) {
      if (char === '(') parenDepth++;
      if (char === ')') parenDepth--;
      
      // Statement end
      if (char === ';' && parenDepth === 0) {
        const stmt = currentStmt.trim();
        if (stmt) statements.push(stmt);
        currentStmt = '';
        continue;
      }
    }
    
    currentStmt += char;
  }
  
  // Add last statement
  const lastStmt = currentStmt.trim();
  if (lastStmt) statements.push(lastStmt);
  
  console.log(`Found ${statements.length} statements`);
  
  // Process each statement
  for (const stmt of statements) {
    const upperStmt = stmt.toUpperCase().trim();
    
    // Skip empty and certain statements
    if (!stmt || upperStmt.startsWith('PRINT') || upperStmt.startsWith('EXEC') || 
        upperStmt.startsWith('ALTER ') || upperStmt.startsWith('DROP ') ||
        upperStmt.startsWith('CREATE PROC') || upperStmt.startsWith('CREATE FUNC') ||
        upperStmt.startsWith('CREATE VIEW') || upperStmt.startsWith('CREATE TRIGGER') ||
        upperStmt.startsWith('--')) {
      continue;
    }
    
    // Parse CREATE TABLE
    if (upperStmt.startsWith('CREATE TABLE')) {
      parseCreateTable(stmt, tables);
    }
    
    // Parse INSERT INTO
    if (upperStmt.startsWith('INSERT INTO')) {
      parseInsert(stmt, tables);
    }
  }
  
  return { tables };
}

// Parse CREATE TABLE statement
function parseCreateTable(stmt: string, tables: Map<string, any>) {
  try {
    // Match various CREATE TABLE formats
    // CREATE TABLE [dbo].[TableName] (...)
    // CREATE TABLE TableName (...)
    // CREATE TABLE [TableName] (...)
    
    let tableName = '';
    let columnsStr = '';
    
    // Try different patterns
    const patterns = [
      /CREATE\s+TABLE\s+(?:\[?\w+\]?\.)?\[?(\w+)\]?\s*\(([\s\S]+)\)\s*(?:ON\s+PRIMARY)?$/i,
      /CREATE\s+TABLE\s+(\w+)\s*\(([\s\S]+)\)\s*(?:ON\s+PRIMARY)?$/i,
    ];
    
    for (const pattern of patterns) {
      const match = stmt.match(pattern);
      if (match) {
        tableName = match[1];
        columnsStr = match[2];
        break;
      }
    }
    
    if (!tableName || !columnsStr) {
      console.log('Could not parse CREATE TABLE:', stmt.substring(0, 100));
      return;
    }
    
    console.log('Found table:', tableName);
    
    const columns: { name: string; type: string }[] = [];
    const primaryKeys: string[] = [];
    
    // Parse columns - need to handle nested parentheses
    const parts = splitColumns(columnsStr);
    
    for (const part of parts) {
      const trimmedPart = part.trim();
      if (!trimmedPart) continue;
      
      const upperPart = trimmedPart.toUpperCase();
      
      // PRIMARY KEY constraint
      if (upperPart.startsWith('PRIMARY KEY')) {
        const pkMatch = trimmedPart.match(/PRIMARY\s+KEY\s*\((.+)\)/i);
        if (pkMatch) {
          const pkCols = pkMatch[1].split(',').map(c => c.replace(/[\[\]]/g, '').trim());
          primaryKeys.push(...pkCols);
        }
        continue;
      }
      
      // Skip other constraints
      if (upperPart.startsWith('CONSTRAINT') || upperPart.startsWith('FOREIGN KEY') ||
          upperPart.startsWith('UNIQUE') || upperPart.startsWith('CHECK') ||
          upperPart.startsWith('DEFAULT') || upperPart.startsWith('INDEX') ||
          upperPart.startsWith('KEY ')) {
        continue;
      }
      
      // Column definition
      // [ColumnName] DataType [(size)] [NULL/NOT NULL] [IDENTITY] [PRIMARY KEY] [DEFAULT x]
      const colMatch = trimmedPart.match(/^\[?(\w+)\]?\s+(\w+)(?:\s*\(([^)]+)\))?(.*)$/i);
      if (colMatch) {
        const colName = colMatch[1];
        const colType = colMatch[2] + (colMatch[3] ? `(${colMatch[3]})` : '');
        const rest = colMatch[4] || '';
        
        columns.push({ name: colName, type: colType });
        
        // Check for inline PRIMARY KEY
        if (rest.toUpperCase().includes('PRIMARY KEY')) {
          primaryKeys.push(colName);
        }
      }
    }
    
    if (columns.length > 0) {
      tables.set(tableName, { columns, primaryKeys, rows: [] });
      console.log(`Table ${tableName} has ${columns.length} columns`);
    }
  } catch (error) {
    console.error('Error parsing CREATE TABLE:', error);
  }
}

// Split column definitions handling nested parentheses
function splitColumns(str: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let stringChar = '';
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const nextChar = str[i + 1] || '';
    
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
    
    if (!inString) {
      if (char === '(') depth++;
      if (char === ')') depth--;
      
      if (char === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
    }
    
    current += char;
  }
  
  if (current.trim()) {
    parts.push(current.trim());
  }
  
  return parts;
}

// Parse INSERT statement
function parseInsert(stmt: string, tables: Map<string, any>) {
  try {
    // Match INSERT INTO [dbo].[TableName] (columns) VALUES (values)
    // or INSERT INTO TableName VALUES (values)
    
    let tableName = '';
    let columnsStr = '';
    let valuesStr = '';
    
    // Pattern with columns
    let match = stmt.match(/INSERT\s+INTO\s+(?:\[?\w+\]?\.)?\[?(\w+)\]?\s*\(([^)]+)\)\s*VALUES\s*\(([\s\S]+)\)/i);
    
    if (match) {
      tableName = match[1];
      columnsStr = match[2];
      valuesStr = match[3];
    } else {
      // Pattern without columns
      match = stmt.match(/INSERT\s+INTO\s+(?:\[?\w+\]?\.)?\[?(\w+)\]?\s*VALUES\s*\(([\s\S]+)\)/i);
      if (match) {
        tableName = match[1];
        valuesStr = match[2];
      }
    }
    
    if (!tableName || !valuesStr) {
      return;
    }
    
    // Parse columns
    let columns: string[] = [];
    if (columnsStr) {
      columns = columnsStr.split(',').map(c => c.replace(/[\[\]]/g, '').trim());
    }
    
    // Parse values
    const values = parseValues(valuesStr);
    
    // Get or create table
    let table = tables.get(tableName);
    if (!table) {
      // Create table from insert data
      if (columns.length > 0) {
        table = {
          columns: columns.map(c => ({ name: c, type: 'TEXT' })),
          primaryKeys: [],
          rows: []
        };
      } else {
        table = {
          columns: values.map((_, i) => ({ name: `Column${i + 1}`, type: 'TEXT' })),
          primaryKeys: [],
          rows: []
        };
      }
      tables.set(tableName, table);
    }
    
    table.rows.push(values);
    
  } catch (error) {
    console.error('Error parsing INSERT:', error);
  }
}

// Parse values from INSERT statement
function parseValues(str: string): unknown[] {
  const values: unknown[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let parenDepth = 0;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const nextChar = str[i + 1] || '';
    
    // Track string literals
    if ((char === "'" || char === '"') && !inString) {
      inString = true;
      stringChar = char;
      continue;
    }
    
    if (char === stringChar && inString) {
      // Check for escaped quote
      if (nextChar === stringChar) {
        current += stringChar;
        i++;
        continue;
      }
      inString = false;
      continue;
    }
    
    if (!inString) {
      if (char === '(') parenDepth++;
      if (char === ')') parenDepth--;
      
      if (char === ',' && parenDepth === 0) {
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
  if (!str || str.toUpperCase() === 'NULL') return null;
  
  // Remove surrounding quotes if present
  if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
    return str.slice(1, -1).replace(/''/g, "'");
  }
  
  // Numbers
  if (/^-?\d+$/.test(str)) return parseInt(str, 10);
  if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);
  
  // Boolean
  if (str.toUpperCase() === 'TRUE') return true;
  if (str.toUpperCase() === 'FALSE') return false;
  
  return str;
}

// MSSQL to MySQL type mapping
function mssqlToMysqlType(mssqlType: string): string {
  const type = mssqlType.toUpperCase();
  if (type.includes('BIGINT')) return 'BIGINT';
  if (type.includes('INT')) return 'INT';
  if (type.includes('SMALLINT')) return 'SMALLINT';
  if (type.includes('TINYINT')) return 'TINYINT';
  if (type.includes('BIT')) return 'BOOLEAN';
  if (type.includes('DECIMAL') || type.includes('NUMERIC')) return 'DECIMAL(18,4)';
  if (type.includes('MONEY')) return 'DECIMAL(19,4)';
  if (type.includes('FLOAT')) return 'DOUBLE';
  if (type.includes('REAL')) return 'FLOAT';
  if (type.includes('DATETIME')) return 'DATETIME';
  if (type.includes('DATE')) return 'DATE';
  if (type.includes('TIME')) return 'TIME';
  if (type.includes('NTEXT') || type.includes('TEXT')) return 'LONGTEXT';
  if (type.includes('NVARCHAR') || type.includes('VARCHAR')) return 'VARCHAR(255)';
  if (type.includes('NCHAR') || type.includes('CHAR')) return 'CHAR(255)';
  if (type.includes('UNIQUEIDENTIFIER')) return 'CHAR(36)';
  if (type.includes('XML')) return 'LONGTEXT';
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
  const [filePath, setFilePath] = useState<string>('');
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState({ percent: 0, message: '' });
  const [parseError, setParseError] = useState<string | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [tableSchemas, setTableSchemas] = useState<Map<string, TableSchema>>(new Map());
  const [tableRows, setTableRows] = useState<Map<string, unknown[][]>>(new Map());
  const [dbReady, setDbReady] = useState(false);
  
  // Preview
  const [previewSQL, setPreviewSQL] = useState<string>('');
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  
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
  
  // Export states
  const [migrationDialogOpen, setMigrationDialogOpen] = useState(false);
  const [selectedTablesForMigration, setSelectedTablesForMigration] = useState<string[]>([]);
  const [migrationResults, setMigrationResults] = useState<{ table: string; status: string; sql: string }[] | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rawSQL, setRawSQL] = useState<string>('');

  // Parse SQL content
  const parseSQL = useCallback((sql: string, name: string) => {
    setParsing(true);
    setParseError(null);
    setParseProgress({ percent: 30, message: 'Parsing SQL statements...' });
    
    setTimeout(() => {
      try {
        console.log('SQL length:', sql.length);
        console.log('First 500 chars:', sql.substring(0, 500));
        
        setParseProgress({ percent: 50, message: 'Extracting tables...' });
        
        const result = parseSQLDump(sql);
        
        setParseProgress({ percent: 80, message: 'Processing data...' });
        
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
          
          console.log(`Table ${tableName}: ${table.columns.length} columns, ${table.rows.length} rows`);
        }
        
        tableNames.sort();
        
        setTables(tableNames);
        setTableSchemas(schemas);
        setTableRows(rows);
        setDbReady(true);
        
        if (tableNames.length === 0) {
          setParseError('No tables found in the SQL file. Please check the file format.');
          setParseProgress({ percent: 100, message: 'No tables found' });
        } else {
          setParseProgress({ percent: 100, message: `Found ${tableNames.length} tables!` });
        }
        
      } catch (error) {
        console.error('Parse error:', error);
        setParseError(error instanceof Error ? error.message : 'Failed to parse SQL');
        setParseProgress({ percent: 0, message: 'Error parsing file' });
      } finally {
        setParsing(false);
      }
    }, 100);
  }, []);
  
  // Handle file selection
  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setFileName(file.name);
    setParseError(null);
    setParsing(true);
    setParseProgress({ percent: 10, message: 'Reading file...' });
    
    try {
      const reader = new FileReader();
      
      reader.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 30);
          setParseProgress({ percent, message: `Reading file... ${Math.round(e.loaded / 1024 / 1024)}MB` });
        }
      };
      
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
  
  // Handle path input (for demo/testing - shows a textarea to paste SQL)
  const handlePathLoad = useCallback(() => {
    if (!filePath) return;
    
    // Show preview dialog for pasting SQL
    setPreviewSQL('');
    setPreviewDialogOpen(true);
  }, [filePath]);

  // Parse pasted SQL
  const parsePastedSQL = useCallback(() => {
    if (!previewSQL) return;
    
    setFileName(filePath || 'pasted_sql.sql');
    parseSQL(previewSQL, filePath || 'pasted_sql.sql');
    setPreviewDialogOpen(false);
  }, [previewSQL, filePath, parseSQL]);
  
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
      const newRow = tableSchema.columns.map(col => editingRow[col.name]);
      rows.push(newRow);
    } else {
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
  
  // Toggle table selection for export
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
              Load SQL File
            </CardTitle>
            <CardDescription>
              Upload your MSSQL .sql dump file or paste SQL content
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* File Upload */}
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
            
            {/* Or paste path */}
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="path-input">Or enter file path / paste SQL directly:</Label>
                <div className="flex gap-2 mt-1">
                  <input
                    id="path-input"
                    type="text"
                    className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={filePath}
                    onChange={(e) => setFilePath(e.target.value)}
                    placeholder="/path/to/file.sql or click Open to paste SQL"
                  />
                  <Button variant="outline" onClick={handlePathLoad}>
                    <FolderOpen className="h-4 w-4 mr-1" />
                    Open
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Progress */}
            {parsing && (
              <div className="space-y-2">
                <Progress value={parseProgress.percent} />
                <p className="text-sm text-center text-muted-foreground">{parseProgress.message}</p>
              </div>
            )}
            
            {/* Error */}
            {parseError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 text-red-600 rounded-lg">
                <AlertCircle className="h-5 w-5" />
                {parseError}
              </div>
            )}
            
            {/* Success */}
            {dbReady && !parsing && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span>Loaded {tables.length} tables from {fileName}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Content */}
        {dbReady && tables.length > 0 && (
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
                          <Badge variant="secondary" className="ml-1 text-xs">
                            {colCount}c / {rowCount}r
                          </Badge>
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
                    Click the upload area and select your MSSQL .sql dump file. 
                    The file is processed entirely in your browser.
                  </p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg">
                  <h4 className="font-semibold mb-2">2. Or Paste SQL</h4>
                  <p className="text-sm text-muted-foreground">
                    Enter a file path and click "Open" to paste SQL content directly.
                  </p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg">
                  <h4 className="font-semibold mb-2">3. View & Edit Data</h4>
                  <p className="text-sm text-muted-foreground">
                    Browse tables, view data with pagination, add, edit, or delete rows.
                  </p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg">
                  <h4 className="font-semibold mb-2">4. Export to MySQL</h4>
                  <p className="text-sm text-muted-foreground">
                    Click "Export" to generate MySQL-compatible SQL and download it.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Preview/Paste SQL Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Paste SQL Content</DialogTitle>
            <DialogDescription>
              Paste your MSSQL dump content below or paste the file contents
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <textarea
              className="w-full h-96 p-3 border rounded-md font-mono text-sm"
              value={previewSQL}
              onChange={(e) => setPreviewSQL(e.target.value)}
              placeholder="Paste your SQL content here..."
            />
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={parsePastedSQL} disabled={!previewSQL}>
              <Play className="h-4 w-4 mr-2" />
              Parse SQL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
