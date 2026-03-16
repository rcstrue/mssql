'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/label';
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
  FolderOpen,
} from 'lucide-react';

interface TableSchema {
  name: string;
  columns: {
    name: string;
    type: string;
    nullable: boolean;
    defaultValue: string | null;
  }[];
  primaryKeys: string[];
}

interface TableData {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface MigrationResult {
  table: string;
  status: 'success' | 'error';
  rowsMigrated?: number;
  error?: string;
}

export default function SQLFileManager() {
  // SQL File states
  const [sqlFilePath, setSqlFilePath] = useState('/path/to/your/file.sql');
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState('');
  const [tables, setTables] = useState<string[]>([]);
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
  const [primaryKeyValues, setPrimaryKeyValues] = useState<Record<string, unknown>>({});
  
  // MySQL connection for migration
  const [mysqlConfig, setMysqlConfig] = useState({
    host: 'localhost',
    port: 3306,
    database: '',
    user: 'root',
    password: '',
  });
  
  // Migration states
  const [migrationDialogOpen, setMigrationDialogOpen] = useState(false);
  const [selectedTablesForMigration, setSelectedTablesForMigration] = useState<string[]>([]);
  const [migrating, setMigrating] = useState(false);
  const [migrationResults, setMigrationResults] = useState<MigrationResult[] | null>(null);
  
  // Check if database is already loaded
  const checkDatabase = async () => {
    try {
      const response = await fetch('/api/sql-file/parse');
      const data = await response.json();
      
      if (data.ready) {
        setTables(data.tables);
        setDbReady(true);
      }
    } catch (error) {
      console.error('Failed to check database:', error);
    }
  };
  
  // Parse SQL file
  const parseSQLFile = async () => {
    if (!sqlFilePath) return;
    
    setParsing(true);
    setParseProgress('Starting to parse SQL file...');
    
    try {
      const response = await fetch('/api/sql-file/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: sqlFilePath }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setTables(data.tables);
        setDbReady(true);
        setParseProgress(`Successfully parsed! Found ${data.tables.length} tables.`);
      } else {
        setParseProgress(`Error: ${data.error}`);
      }
    } catch (error) {
      setParseProgress(`Error: ${error instanceof Error ? error.message : 'Failed to parse'}`);
    } finally {
      setParsing(false);
    }
  };
  
  // Load table data
  const loadTableData = async (tableName: string, page: number = 1) => {
    setLoadingData(true);
    setSelectedTable(tableName);
    
    try {
      // Get schema
      const schemaResponse = await fetch('/api/sql-file/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName }),
      });
      const schemaData = await schemaResponse.json();
      if (schemaData.success) {
        setTableSchema(schemaData.schema);
      }
      
      // Get data
      const dataResponse = await fetch('/api/sql-file/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName, page, pageSize: 50 }),
      });
      const dataData = await dataResponse.json();
      if (dataData.success) {
        setTableData(dataData);
      }
    } catch (error) {
      console.error('Failed to load table data:', error);
    } finally {
      setLoadingData(false);
    }
  };
  
  // Handle page change
  const handlePageChange = (newPage: number) => {
    if (selectedTable) {
      loadTableData(selectedTable, newPage);
    }
  };
  
  // Open edit dialog
  const openEditDialog = (row: Record<string, unknown>, mode: 'edit' | 'add' = 'edit') => {
    if (!tableSchema) return;
    
    setEditMode(mode);
    setEditingRow({ ...row });
    
    if (mode === 'edit' && tableSchema.primaryKeys.length > 0) {
      const pkValues: Record<string, unknown> = {};
      tableSchema.primaryKeys.forEach(pk => {
        pkValues[pk] = row[pk];
      });
      setPrimaryKeyValues(pkValues);
    } else {
      setPrimaryKeyValues({});
    }
    
    setEditDialogOpen(true);
  };
  
  // Save row changes
  const saveRowChanges = async () => {
    if (!selectedTable || !tableSchema) return;
    
    try {
      const action = editMode === 'add' ? 'insert' : 'update';
      const body: Record<string, unknown> = {
        tableName: selectedTable,
        action,
        data: editingRow,
      };
      
      if (editMode === 'edit') {
        body.primaryKey = primaryKeyValues;
      }
      
      const response = await fetch('/api/sql-file/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setEditDialogOpen(false);
        loadTableData(selectedTable, tableData?.page || 1);
      } else {
        alert(data.error || data.message);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save');
    }
  };
  
  // Delete row
  const deleteRow = async (row: Record<string, unknown>) => {
    if (!selectedTable || !tableSchema) return;
    if (tableSchema.primaryKeys.length === 0) {
      alert('Cannot delete: No primary key defined for this table');
      return;
    }
    
    if (!confirm('Are you sure you want to delete this row?')) return;
    
    const pkValues: Record<string, unknown> = {};
    tableSchema.primaryKeys.forEach(pk => {
      pkValues[pk] = row[pk];
    });
    
    try {
      const response = await fetch('/api/sql-file/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableName: selectedTable,
          action: 'delete',
          primaryKey: pkValues,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        loadTableData(selectedTable, tableData?.page || 1);
      } else {
        alert(data.error || data.message);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete');
    }
  };
  
  // Toggle table selection for migration
  const toggleTableSelection = (tableName: string) => {
    setSelectedTablesForMigration(prev => 
      prev.includes(tableName) 
        ? prev.filter(t => t !== tableName)
        : [...prev, tableName]
    );
  };
  
  // Select all tables for migration
  const selectAllTables = () => {
    setSelectedTablesForMigration([...tables]);
  };
  
  // Deselect all tables for migration
  const deselectAllTables = () => {
    setSelectedTablesForMigration([]);
  };
  
  // Run migration
  const runMigration = async () => {
    if (selectedTablesForMigration.length === 0) return;
    
    setMigrating(true);
    setMigrationResults(null);
    
    try {
      const response = await fetch('/api/sql-file/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mysqlConfig,
          tables: selectedTablesForMigration,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMigrationResults(data.results);
      } else {
        alert(data.error);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Migration failed');
    } finally {
      setMigrating(false);
    }
  };
  
  // Check database on mount
  useEffect(() => {
    checkDatabase();
  }, []);

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
                Open, view, edit MSSQL .sql dump files and migrate to MySQL
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* SQL File Input Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-blue-600" />
              Open SQL File
            </CardTitle>
            <CardDescription>
              Enter the path to your MSSQL .sql dump file on the server (e.g., /home/user/backup.sql)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="sql-path">SQL File Path</Label>
                <input
                  id="sql-path"
                  type="text"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={sqlFilePath}
                  onChange={(e) => setSqlFilePath(e.target.value)}
                  placeholder="/path/to/your/file.sql"
                />
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={parseSQLFile} 
                  disabled={parsing || !sqlFilePath}
                  className="min-w-32"
                >
                  {parsing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Parse File
                </Button>
              </div>
            </div>
            
            {parseProgress && (
              <div className={`p-3 rounded-lg ${parseProgress.includes('Error') ? 'bg-red-50 dark:bg-red-950/30 text-red-600' : 'bg-green-50 dark:bg-green-950/30 text-green-600'}`}>
                {parseProgress}
              </div>
            )}
            
            {dbReady && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span>Database loaded with {tables.length} tables</span>
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
                    <ArrowRight className="h-4 w-4 mr-1" />
                    Migrate
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="p-2 space-y-1">
                    {tables.map((table) => (
                      <Button
                        key={table}
                        variant={selectedTable === table ? 'default' : 'ghost'}
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => loadTableData(table)}
                      >
                        <Table2 className="h-4 w-4 mr-2 text-blue-600" />
                        {table}
                      </Button>
                    ))}
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
                        onClick={() => openEditDialog({}, 'add')}
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
                                    onClick={() => openEditDialog(row, 'edit')}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => deleteRow(row)}
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
                  <h4 className="font-semibold mb-2">1. Enter SQL File Path</h4>
                  <p className="text-sm text-muted-foreground">
                    Provide the full path to your MSSQL .sql dump file on the server.
                    For example: <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">/home/user/backup.sql</code>
                  </p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg">
                  <h4 className="font-semibold mb-2">2. Parse & View Data</h4>
                  <p className="text-sm text-muted-foreground">
                    Click "Parse File" to extract tables and data. Large files (900MB+) will be processed efficiently.
                  </p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg">
                  <h4 className="font-semibold mb-2">3. Edit Data</h4>
                  <p className="text-sm text-muted-foreground">
                    View, add, edit, or delete rows in any table. Changes are stored locally.
                  </p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg">
                  <h4 className="font-semibold mb-2">4. Migrate to MySQL</h4>
                  <p className="text-sm text-muted-foreground">
                    Connect to your MySQL database and migrate selected tables with automatic schema conversion.
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
                      ({col.type}{!col.nullable ? ', NOT NULL' : ''})
                    </span>
                  </Label>
                  <input
                    id={`edit-${col.name}`}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={editingRow[col.name]?.toString() || ''}
                    onChange={(e) => setEditingRow({ 
                      ...editingRow, 
                      [col.name]: e.target.value 
                    })}
                    disabled={editMode === 'edit' && isPrimaryKey}
                    placeholder={col.nullable ? 'NULL' : ''}
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
      
      {/* Migration Dialog */}
      <Dialog open={migrationDialogOpen} onOpenChange={setMigrationDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Migrate to MySQL</DialogTitle>
            <DialogDescription>
              Select tables to migrate from your SQL file to MySQL database
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* MySQL Connection */}
            <div className="border rounded-lg p-4">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Server className="h-4 w-4" />
                MySQL Connection
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Host</Label>
                  <input
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={mysqlConfig.host}
                    onChange={(e) => setMysqlConfig({ ...mysqlConfig, host: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Port</Label>
                  <input
                    type="number"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={mysqlConfig.port}
                    onChange={(e) => setMysqlConfig({ ...mysqlConfig, port: parseInt(e.target.value) || 3306 })}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Database</Label>
                  <input
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={mysqlConfig.database}
                    onChange={(e) => setMysqlConfig({ ...mysqlConfig, database: e.target.value })}
                    placeholder="database_name"
                  />
                </div>
                <div>
                  <Label>Username</Label>
                  <input
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={mysqlConfig.user}
                    onChange={(e) => setMysqlConfig({ ...mysqlConfig, user: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Password</Label>
                  <input
                    type="password"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={mysqlConfig.password}
                    onChange={(e) => setMysqlConfig({ ...mysqlConfig, password: e.target.value })}
                  />
                </div>
              </div>
            </div>
            
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
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
            
            {/* Migration Results */}
            {migrationResults && (
              <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-800">
                <h4 className="font-semibold mb-2">Migration Results</h4>
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
                        {result.error && (
                          <span className="text-sm">- {result.error}</span>
                        )}
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
              onClick={runMigration}
              disabled={migrating || selectedTablesForMigration.length === 0 || !mysqlConfig.database}
              className="bg-gradient-to-r from-blue-500 to-purple-600"
            >
              {migrating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4 mr-2" />
              )}
              Start Migration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            SQL File Manager - Open, view, edit MSSQL dump files and migrate to MySQL
          </p>
        </div>
      </footer>
    </div>
  );
}
