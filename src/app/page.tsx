'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Database,
  Server,
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
} from 'lucide-react';

interface ConnectionConfig {
  mssql: {
    server: string;
    port: number;
    database: string;
    user: string;
    password: string;
  } | null;
  mysql: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  } | null;
}

interface TableData {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface TableSchema {
  columns: { COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string }[];
  primaryKeys: string[];
}

interface MigrationResult {
  table: string;
  status: 'success' | 'error';
  rowsMigrated?: number;
  error?: string;
}

export default function DatabaseManager() {
  // Connection states
  const [mssqlConfig, setMssqlConfig] = useState({
    server: 'localhost',
    port: 1433,
    database: '',
    user: 'sa',
    password: '',
  });
  
  const [mysqlConfig, setMysqlConfig] = useState({
    host: 'localhost',
    port: 3306,
    database: '',
    user: 'root',
    password: '',
  });
  
  const [mssqlTables, setMssqlTables] = useState<string[]>([]);
  const [mysqlTables, setMysqlTables] = useState<string[]>([]);
  const [mssqlConnected, setMssqlConnected] = useState(false);
  const [mysqlConnected, setMysqlConnected] = useState(false);
  
  // Data viewer states
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedDbType, setSelectedDbType] = useState<'mssql' | 'mysql' | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [tableSchema, setTableSchema] = useState<TableSchema | null>(null);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  
  // Edit states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState<'edit' | 'add'>('edit');
  const [editingRow, setEditingRow] = useState<Record<string, unknown>>({});
  const [primaryKeyValues, setPrimaryKeyValues] = useState<Record<string, unknown>>({});
  
  // Migration states
  const [migrationDialogOpen, setMigrationDialogOpen] = useState(false);
  const [selectedTablesForMigration, setSelectedTablesForMigration] = useState<string[]>([]);
  const [migrating, setMigrating] = useState(false);
  const [migrationResults, setMigrationResults] = useState<MigrationResult[] | null>(null);
  
  // Error states
  const [mssqlError, setMssqlError] = useState<string | null>(null);
  const [mysqlError, setMysqlError] = useState<string | null>(null);

  // Connect to MSSQL
  const connectMssql = async () => {
    setLoadingTables(true);
    setMssqlError(null);
    
    try {
      const response = await fetch('/api/database/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'mssql', config: mssqlConfig }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMssqlTables(data.tables);
        setMssqlConnected(true);
      } else {
        setMssqlError(data.error);
        setMssqlConnected(false);
      }
    } catch (error) {
      setMssqlError(error instanceof Error ? error.message : 'Connection failed');
      setMssqlConnected(false);
    } finally {
      setLoadingTables(false);
    }
  };
  
  // Connect to MySQL
  const connectMysql = async () => {
    setLoadingTables(true);
    setMysqlError(null);
    
    try {
      const response = await fetch('/api/database/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'mysql', config: mysqlConfig }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMysqlTables(data.tables);
        setMysqlConnected(true);
      } else {
        setMysqlError(data.error);
        setMysqlConnected(false);
      }
    } catch (error) {
      setMysqlError(error instanceof Error ? error.message : 'Connection failed');
      setMysqlConnected(false);
    } finally {
      setLoadingTables(false);
    }
  };
  
  // Load table data
  const loadTableData = async (tableName: string, dbType: 'mssql' | 'mysql', page: number = 1) => {
    setLoadingData(true);
    setSelectedTable(tableName);
    setSelectedDbType(dbType);
    
    try {
      const config = dbType === 'mssql' ? mssqlConfig : mysqlConfig;
      
      // Get schema
      const schemaResponse = await fetch('/api/database/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: dbType, config, tableName }),
      });
      const schemaData = await schemaResponse.json();
      if (schemaData.success) {
        setTableSchema(schemaData.schema);
      }
      
      // Get data
      const dataResponse = await fetch('/api/database/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: dbType, config, tableName, page, pageSize: 50 }),
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
    if (selectedTable && selectedDbType) {
      loadTableData(selectedTable, selectedDbType, newPage);
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
    if (!selectedTable || !selectedDbType || !tableSchema) return;
    
    const config = selectedDbType === 'mssql' ? mssqlConfig : mysqlConfig;
    
    try {
      const action = editMode === 'add' ? 'insert' : 'update';
      const body: Record<string, unknown> = {
        type: selectedDbType,
        config,
        tableName: selectedTable,
        action,
        data: editingRow,
      };
      
      if (editMode === 'edit') {
        body.primaryKey = primaryKeyValues;
      }
      
      const response = await fetch('/api/database/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setEditDialogOpen(false);
        loadTableData(selectedTable, selectedDbType, tableData?.page || 1);
      } else {
        alert(data.error);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save');
    }
  };
  
  // Delete row
  const deleteRow = async (row: Record<string, unknown>) => {
    if (!selectedTable || !selectedDbType || !tableSchema) return;
    if (tableSchema.primaryKeys.length === 0) {
      alert('Cannot delete: No primary key defined for this table');
      return;
    }
    
    if (!confirm('Are you sure you want to delete this row?')) return;
    
    const config = selectedDbType === 'mssql' ? mssqlConfig : mysqlConfig;
    const pkValues: Record<string, unknown> = {};
    tableSchema.primaryKeys.forEach(pk => {
      pkValues[pk] = row[pk];
    });
    
    try {
      const response = await fetch('/api/database/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedDbType,
          config,
          tableName: selectedTable,
          action: 'delete',
          primaryKey: pkValues,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        loadTableData(selectedTable, selectedDbType, tableData?.page || 1);
      } else {
        alert(data.error);
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
    setSelectedTablesForMigration([...mssqlTables]);
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
      const response = await fetch('/api/database/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mssqlConfig,
          mysqlConfig,
          tables: selectedTablesForMigration,
          batchSize: 1000,
          createTables: true,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMigrationResults(data.results);
        // Refresh MySQL tables
        connectMysql();
      } else {
        alert(data.error);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Migration failed');
    } finally {
      setMigrating(false);
    }
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
                Database Manager
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Connect, view, edit data and migrate from MSSQL to MySQL
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Connection Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* MSSQL Connection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-blue-600" />
                MSSQL Server
                {mssqlConnected && (
                  <Badge variant="default" className="ml-2 bg-green-500">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Connect to Microsoft SQL Server database
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="mssql-server">Server</Label>
                  <Input
                    id="mssql-server"
                    value={mssqlConfig.server}
                    onChange={(e) => setMssqlConfig({ ...mssqlConfig, server: e.target.value })}
                    placeholder="localhost"
                  />
                </div>
                <div>
                  <Label htmlFor="mssql-port">Port</Label>
                  <Input
                    id="mssql-port"
                    type="number"
                    value={mssqlConfig.port}
                    onChange={(e) => setMssqlConfig({ ...mssqlConfig, port: parseInt(e.target.value) || 1433 })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="mssql-database">Database</Label>
                <Input
                  id="mssql-database"
                  value={mssqlConfig.database}
                  onChange={(e) => setMssqlConfig({ ...mssqlConfig, database: e.target.value })}
                  placeholder="database_name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="mssql-user">Username</Label>
                  <Input
                    id="mssql-user"
                    value={mssqlConfig.user}
                    onChange={(e) => setMssqlConfig({ ...mssqlConfig, user: e.target.value })}
                    placeholder="sa"
                  />
                </div>
                <div>
                  <Label htmlFor="mssql-password">Password</Label>
                  <Input
                    id="mssql-password"
                    type="password"
                    value={mssqlConfig.password}
                    onChange={(e) => setMssqlConfig({ ...mssqlConfig, password: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
              </div>
              
              {mssqlError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 text-red-600 rounded-lg text-sm">
                  <XCircle className="h-4 w-4" />
                  {mssqlError}
                </div>
              )}
              
              <Button 
                onClick={connectMssql} 
                disabled={loadingTables || !mssqlConfig.database}
                className="w-full"
              >
                {loadingTables ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Connect
              </Button>
              
              {mssqlConnected && mssqlTables.length > 0 && (
                <div>
                  <Label>Tables ({mssqlTables.length})</Label>
                  <ScrollArea className="h-48 border rounded-lg mt-2">
                    <div className="p-2 space-y-1">
                      {mssqlTables.map((table) => (
                        <Button
                          key={table}
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => loadTableData(table, 'mssql')}
                        >
                          <Table2 className="h-4 w-4 mr-2 text-blue-600" />
                          {table}
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* MySQL Connection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-orange-600" />
                MySQL Server
                {mysqlConnected && (
                  <Badge variant="default" className="ml-2 bg-green-500">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Connect to MySQL database
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="mysql-host">Host</Label>
                  <Input
                    id="mysql-host"
                    value={mysqlConfig.host}
                    onChange={(e) => setMysqlConfig({ ...mysqlConfig, host: e.target.value })}
                    placeholder="localhost"
                  />
                </div>
                <div>
                  <Label htmlFor="mysql-port">Port</Label>
                  <Input
                    id="mysql-port"
                    type="number"
                    value={mysqlConfig.port}
                    onChange={(e) => setMysqlConfig({ ...mysqlConfig, port: parseInt(e.target.value) || 3306 })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="mysql-database">Database</Label>
                <Input
                  id="mysql-database"
                  value={mysqlConfig.database}
                  onChange={(e) => setMysqlConfig({ ...mysqlConfig, database: e.target.value })}
                  placeholder="database_name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="mysql-user">Username</Label>
                  <Input
                    id="mysql-user"
                    value={mysqlConfig.user}
                    onChange={(e) => setMysqlConfig({ ...mysqlConfig, user: e.target.value })}
                    placeholder="root"
                  />
                </div>
                <div>
                  <Label htmlFor="mysql-password">Password</Label>
                  <Input
                    id="mysql-password"
                    type="password"
                    value={mysqlConfig.password}
                    onChange={(e) => setMysqlConfig({ ...mysqlConfig, password: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
              </div>
              
              {mysqlError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 text-red-600 rounded-lg text-sm">
                  <XCircle className="h-4 w-4" />
                  {mysqlError}
                </div>
              )}
              
              <Button 
                onClick={connectMysql} 
                disabled={loadingTables || !mysqlConfig.database}
                className="w-full"
              >
                {loadingTables ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Connect
              </Button>
              
              {mysqlConnected && mysqlTables.length > 0 && (
                <div>
                  <Label>Tables ({mysqlTables.length})</Label>
                  <ScrollArea className="h-48 border rounded-lg mt-2">
                    <div className="p-2 space-y-1">
                      {mysqlTables.map((table) => (
                        <Button
                          key={table}
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => loadTableData(table, 'mysql')}
                        >
                          <Table2 className="h-4 w-4 mr-2 text-orange-600" />
                          {table}
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Migration Button */}
        {mssqlConnected && mysqlConnected && (
          <div className="mb-6 flex justify-center">
            <Button 
              onClick={() => setMigrationDialogOpen(true)}
              size="lg"
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            >
              <ArrowRight className="h-5 w-5 mr-2" />
              Migrate MSSQL to MySQL
            </Button>
          </div>
        )}
        
        {/* Data Viewer */}
        {selectedTable && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Table2 className="h-5 w-5" />
                    {selectedTable}
                    <Badge variant="outline">
                      {selectedDbType?.toUpperCase()}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {tableData?.total || 0} rows • Page {tableData?.page || 1} of {tableData?.totalPages || 1}
                  </CardDescription>
                </div>
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
                    onClick={() => loadTableData(selectedTable, selectedDbType!, tableData?.page || 1)}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                </div>
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
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  No data found in this table
                </div>
              )}
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
              const isPrimaryKey = tableSchema.primaryKeys.includes(col.COLUMN_NAME);
              return (
                <div key={col.COLUMN_NAME}>
                  <Label htmlFor={`edit-${col.COLUMN_NAME}`}>
                    {col.COLUMN_NAME}
                    {isPrimaryKey && <Badge variant="secondary" className="ml-2">PK</Badge>}
                    <span className="text-xs text-muted-foreground ml-2">
                      ({col.DATA_TYPE}{col.IS_NULLABLE === 'NO' ? ', NOT NULL' : ''})
                    </span>
                  </Label>
                  <Input
                    id={`edit-${col.COLUMN_NAME}`}
                    value={editingRow[col.COLUMN_NAME]?.toString() || ''}
                    onChange={(e) => setEditingRow({ 
                      ...editingRow, 
                      [col.COLUMN_NAME]: e.target.value 
                    })}
                    disabled={editMode === 'edit' && isPrimaryKey}
                    placeholder={col.IS_NULLABLE === 'YES' ? 'NULL' : ''}
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
            <DialogTitle>Migrate MSSQL to MySQL</DialogTitle>
            <DialogDescription>
              Select tables to migrate from MSSQL to MySQL. Tables will be created automatically in MySQL.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {selectedTablesForMigration.length} of {mssqlTables.length} tables selected
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllTables}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAllTables}>
                  Deselect All
                </Button>
              </div>
            </div>
            
            <ScrollArea className="h-64 border rounded-lg">
              <div className="p-2 space-y-2">
                {mssqlTables.map((table) => (
                  <label
                    key={table}
                    className="flex items-center gap-3 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedTablesForMigration.includes(table)}
                      onCheckedChange={() => toggleTableSelection(table)}
                    />
                    <Table2 className="h-4 w-4 text-blue-600" />
                    <span>{table}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
            
            {migrationResults && (
              <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-800">
                <h4 className="font-semibold mb-2">Migration Results</h4>
                <ScrollArea className="h-48">
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
                        {result.rowsMigrated !== undefined && (
                          <span className="text-sm">({result.rowsMigrated} rows)</span>
                        )}
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
              disabled={migrating || selectedTablesForMigration.length === 0}
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
            Database Manager - View, edit, and migrate data between MSSQL and MySQL
          </p>
        </div>
      </footer>
    </div>
  );
}
