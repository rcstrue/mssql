'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, 
  FileText, 
  Trash2, 
  Download, 
  IndianRupee, 
  Users, 
  Building2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Calculator
} from 'lucide-react';

interface ECRRecord {
  uan: string;
  memberName: string;
  accountNo: string;
  wages: number;
  epfContribution: number;
  epsContribution: number;
  epfDiff: number;
  epsDiff: number;
  ncpDays: number;
  refundOfAdvances: number;
}

interface AccountSummary {
  accountNo: string;
  memberCount: number;
  totalWages: number;
  totalEPF: number;
  totalEPS: number;
  totalEPFDiff: number;
  totalEPSDiff: number;
  totalRefund: number;
  grandTotal: number;
}

interface EPFPayableBreakdown {
  account1: number;
  account2: number;
  account10: number;
  account20: number;
  account21: number;
  account22: number;
  totalPayable: number;
}

interface ParsedECRFile {
  fileName: string;
  records: ECRRecord[];
  totals: {
    totalWages: number;
    totalEPF: number;
    totalEPS: number;
    totalEPFDiff: number;
    totalEPSDiff: number;
    totalRefund: number;
    memberCount: number;
  };
  accountWiseSummary: AccountSummary[];
  epfPayableBreakdown: EPFPayableBreakdown;
}

interface FileWiseEPFPayable {
  fileName: string;
  breakdown: EPFPayableBreakdown;
}

interface APIResponse {
  success: boolean;
  files: ParsedECRFile[];
  combinedAccountSummary: AccountSummary[];
  grandTotals: {
    totalWages: number;
    totalEPF: number;
    totalEPS: number;
    totalEPFDiff: number;
    totalEPSDiff: number;
    totalRefund: number;
    memberCount: number;
    grandTotal: number;
  };
  combinedEPFPayableBreakdown: EPFPayableBreakdown;
  fileWiseEPFPayable: FileWiseEPFPayable[];
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('en-IN').format(num);
};

export default function ECRMaker() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<APIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.type === 'text/plain' || file.name.endsWith('.txt')
    );
    
    setFiles(prev => [...prev, ...droppedFiles]);
    setError(null);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(
        file => file.type === 'text/plain' || file.name.endsWith('.txt')
      );
      setFiles(prev => [...prev, ...selectedFiles]);
      setError(null);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setFiles([]);
    setResult(null);
    setError(null);
  };

  const processFiles = async () => {
    if (files.length === 0) return;
    
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      
      const response = await fetch('/api/ecr-parser', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to process files');
      }
      
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!result) return;
    
    let csvContent = 'data:text/csv;charset=utf-8,';
    
    // EPF Payable Breakdown
    csvContent += 'EPF PAYABLE BREAKDOWN (Account-wise)\n';
    csvContent += 'Account No,Description,Amount\n';
    csvContent += `A/C No. 01,EPF Contribution (Employee + Employer),${result.combinedEPFPayableBreakdown.account1}\n`;
    csvContent += `A/C No. 02,EPF Difference (3.67%),${result.combinedEPFPayableBreakdown.account2}\n`;
    csvContent += `A/C No. 10,EPS Contribution (8.33%),${result.combinedEPFPayableBreakdown.account10}\n`;
    csvContent += `A/C No. 20,EDLI Contribution (0.5%),${result.combinedEPFPayableBreakdown.account20}\n`;
    csvContent += `A/C No. 21,EDLI Admin Charges (0.005%),${result.combinedEPFPayableBreakdown.account21}\n`;
    csvContent += `A/C No. 22,EPF Admin Charges (0%),${result.combinedEPFPayableBreakdown.account22}\n`;
    csvContent += `TOTAL,Total EPF Payable,${result.combinedEPFPayableBreakdown.totalPayable}\n`;
    
    // Combined Account Summary
    csvContent += '\n\nCOMBINED ACCOUNT-WISE SUMMARY\n';
    csvContent += 'Account No,Member Count,Total Wages,EPF Contribution,EPS Contribution,EPF Difference,EPS Difference,Refund of Advances,Grand Total\n';
    
    result.combinedAccountSummary.forEach(account => {
      csvContent += `${account.accountNo},${account.memberCount},${account.totalWages},${account.totalEPF},${account.totalEPS},${account.totalEPFDiff},${account.totalEPSDiff},${account.totalRefund},${account.grandTotal}\n`;
    });
    
    // Grand Totals
    csvContent += `\nGRAND TOTALS\n`;
    csvContent += `Total Members,${result.grandTotals.memberCount}\n`;
    csvContent += `Total Wages,${result.grandTotals.totalWages}\n`;
    csvContent += `Total EPF,${result.grandTotals.totalEPF}\n`;
    csvContent += `Total EPS,${result.grandTotals.totalEPS}\n`;
    csvContent += `Total EPF Diff,${result.grandTotals.totalEPFDiff}\n`;
    csvContent += `Total EPS Diff,${result.grandTotals.totalEPSDiff}\n`;
    csvContent += `Total Refund,${result.grandTotals.totalRefund}\n`;
    csvContent += `Grand Total,${result.grandTotals.grandTotal}\n`;
    
    // File-wise summary
    csvContent += `\n\nFILE-WISE SUMMARY\n`;
    csvContent += 'File Name,Members,Accounts,Total Wages,EPF Contribution,EPS Contribution,EPF Difference,EPS Difference,Refund,Grand Total\n';
    
    result.files.forEach((file) => {
      const fileGrandTotal = 
        file.totals.totalEPF + 
        file.totals.totalEPS + 
        file.totals.totalEPFDiff + 
        file.totals.totalEPSDiff + 
        file.totals.totalRefund;
      
      csvContent += `${file.fileName},${file.totals.memberCount},${file.accountWiseSummary.length},${file.totals.totalWages},${file.totals.totalEPF},${file.totals.totalEPS},${file.totals.totalEPFDiff},${file.totals.totalEPSDiff},${file.totals.totalRefund},${fileGrandTotal}\n`;
    });
    
    // File-wise EPF Payable
    csvContent += `\n\nFILE-WISE EPF PAYABLE BREAKDOWN\n`;
    csvContent += 'File Name,A/C 01 (EPF),A/C 02 (EPF Diff),A/C 10 (EPS),A/C 20 (EDLI),A/C 21 (EDLI Admin),A/C 22 (EPF Admin),Total Payable\n';
    
    result.fileWiseEPFPayable.forEach((item) => {
      csvContent += `${item.fileName},${item.breakdown.account1},${item.breakdown.account2},${item.breakdown.account10},${item.breakdown.account20},${item.breakdown.account21},${item.breakdown.account22},${item.breakdown.totalPayable}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'ecr_summary_report.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2 rounded-lg">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  EPFO ECR Maker
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Upload ECR text files to get account-wise contribution summaries
                </p>
              </div>
            </div>
            {result && (
              <Button onClick={exportToCSV} variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Upload Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload ECR Files
            </CardTitle>
            <CardDescription>
              Upload one or more EPFO ECR text files (.txt). Files can be pipe (|) or tilde (~) separated.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Drop Zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
                dragActive
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                  : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-slate-400" />
              <p className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                Drag and drop ECR files here
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                or click to browse
              </p>
              <label>
                <input
                  type="file"
                  multiple
                  accept=".txt,text/plain"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button variant="outline" asChild>
                  <span>Browse Files</span>
                </Button>
              </label>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Selected Files ({files.length})
                  </h4>
                  <Button variant="ghost" size="sm" onClick={clearAll}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear All
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-emerald-600" />
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {file.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {(file.size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(index)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-lg">
                <AlertCircle className="h-5 w-5" />
                <p>{error}</p>
              </div>
            )}

            {/* Process Button */}
            <Button
              onClick={processFiles}
              disabled={files.length === 0 || loading}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing Files...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Process ECR Files
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Section */}
        {result && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Users className="h-8 w-8 opacity-80" />
                    <div>
                      <p className="text-sm opacity-80">Total Members</p>
                      <p className="text-2xl font-bold">
                        {formatNumber(result.grandTotals.memberCount)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-teal-500 to-teal-600 text-white">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-8 w-8 opacity-80" />
                    <div>
                      <p className="text-sm opacity-80">Total Accounts</p>
                      <p className="text-2xl font-bold">
                        {formatNumber(result.combinedAccountSummary.length)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <IndianRupee className="h-8 w-8 opacity-80" />
                    <div>
                      <p className="text-sm opacity-80">Total Wages</p>
                      <p className="text-xl font-bold">
                        {formatCurrency(result.grandTotals.totalWages)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-rose-500 to-rose-600 text-white">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Calculator className="h-8 w-8 opacity-80" />
                    <div>
                      <p className="text-sm opacity-80">Total PF Payable</p>
                      <p className="text-xl font-bold">
                        {formatCurrency(result.combinedEPFPayableBreakdown.totalPayable)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* EPF Payable Breakdown Table */}
            <Card className="border-2 border-emerald-200 dark:border-emerald-800">
              <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50">
                <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <Calculator className="h-5 w-5" />
                  EPF Payable Breakdown (Account-wise)
                </CardTitle>
                <CardDescription>
                  Total PF payable including all contributions and admin charges
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800">
                      <TableHead className="font-semibold">Account No</TableHead>
                      <TableHead className="font-semibold">Description</TableHead>
                      <TableHead className="text-right font-semibold">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium text-emerald-600">A/C No. 01</TableCell>
                      <TableCell>EPF Contribution (Employee + Employer Share)</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(result.combinedEPFPayableBreakdown.account1)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="bg-slate-50/50 dark:bg-slate-800/50">
                      <TableCell className="font-medium text-teal-600">A/C No. 02</TableCell>
                      <TableCell>EPF Difference (Employer Share - EPS = 3.67%)</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(result.combinedEPFPayableBreakdown.account2)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-blue-600">A/C No. 10</TableCell>
                      <TableCell>EPS Contribution (8.33% of wages)</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(result.combinedEPFPayableBreakdown.account10)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="bg-slate-50/50 dark:bg-slate-800/50">
                      <TableCell className="font-medium text-purple-600">A/C No. 20</TableCell>
                      <TableCell>EDLI Contribution (0.5% of wages)</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(result.combinedEPFPayableBreakdown.account20)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-orange-600">A/C No. 21</TableCell>
                      <TableCell>EDLI Admin Charges (0.005% of wages, min ₹2, max ₹500)</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(result.combinedEPFPayableBreakdown.account21)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="bg-slate-50/50 dark:bg-slate-800/50">
                      <TableCell className="font-medium text-slate-600">A/C No. 22</TableCell>
                      <TableCell>EPF Admin Charges (0% - Waived from July 2022)</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(result.combinedEPFPayableBreakdown.account22)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="bg-emerald-100 dark:bg-emerald-900 font-bold">
                      <TableCell colSpan={2} className="text-emerald-700 dark:text-emerald-400">
                        TOTAL PF PAYABLE
                      </TableCell>
                      <TableCell className="text-right text-emerald-700 dark:text-emerald-400 text-lg">
                        {formatCurrency(result.combinedEPFPayableBreakdown.totalPayable)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Detailed Results */}
            <Tabs defaultValue="combined" className="w-full">
              <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
                <TabsTrigger value="combined">
                  Combined Summary
                </TabsTrigger>
                <TabsTrigger value="files">
                  File-wise ({result.files.length})
                </TabsTrigger>
                <TabsTrigger value="epf-payable">
                  EPF Payable by File
                </TabsTrigger>
              </TabsList>

              <TabsContent value="combined" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Combined Account-wise Summary</CardTitle>
                    <CardDescription>
                      Total contributions grouped by account number across all uploaded files
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Account No</TableHead>
                            <TableHead className="text-right">Members</TableHead>
                            <TableHead className="text-right">Total Wages</TableHead>
                            <TableHead className="text-right">EPF Contribution</TableHead>
                            <TableHead className="text-right">EPS Contribution</TableHead>
                            <TableHead className="text-right">EPF Difference</TableHead>
                            <TableHead className="text-right">EPS Difference</TableHead>
                            <TableHead className="text-right">Refund</TableHead>
                            <TableHead className="text-right font-bold">Grand Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.combinedAccountSummary.map((account, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">
                                {account.accountNo}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatNumber(account.memberCount)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(account.totalWages)}
                              </TableCell>
                              <TableCell className="text-right text-emerald-600">
                                {formatCurrency(account.totalEPF)}
                              </TableCell>
                              <TableCell className="text-right text-teal-600">
                                {formatCurrency(account.totalEPS)}
                              </TableCell>
                              <TableCell className="text-right text-amber-600">
                                {formatCurrency(account.totalEPFDiff)}
                              </TableCell>
                              <TableCell className="text-right text-orange-600">
                                {formatCurrency(account.totalEPSDiff)}
                              </TableCell>
                              <TableCell className="text-right text-blue-600">
                                {formatCurrency(account.totalRefund)}
                              </TableCell>
                              <TableCell className="text-right font-bold text-rose-600">
                                {formatCurrency(account.grandTotal)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {/* Grand Total Row */}
                          <TableRow className="bg-slate-100 dark:bg-slate-800 font-bold">
                            <TableCell>
                              GRAND TOTAL
                            </TableCell>
                            <TableCell className="text-right">
                              {formatNumber(result.grandTotals.memberCount)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(result.grandTotals.totalWages)}
                            </TableCell>
                            <TableCell className="text-right text-emerald-600">
                              {formatCurrency(result.grandTotals.totalEPF)}
                            </TableCell>
                            <TableCell className="text-right text-teal-600">
                              {formatCurrency(result.grandTotals.totalEPS)}
                            </TableCell>
                            <TableCell className="text-right text-amber-600">
                              {formatCurrency(result.grandTotals.totalEPFDiff)}
                            </TableCell>
                            <TableCell className="text-right text-orange-600">
                              {formatCurrency(result.grandTotals.totalEPSDiff)}
                            </TableCell>
                            <TableCell className="text-right text-blue-600">
                              {formatCurrency(result.grandTotals.totalRefund)}
                            </TableCell>
                            <TableCell className="text-right text-rose-600">
                              {formatCurrency(result.grandTotals.grandTotal)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="files" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>File-wise Summary</CardTitle>
                    <CardDescription>
                      Grand totals for each uploaded ECR file
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>File Name</TableHead>
                            <TableHead className="text-right">Members</TableHead>
                            <TableHead className="text-right">Accounts</TableHead>
                            <TableHead className="text-right">Total Wages</TableHead>
                            <TableHead className="text-right">EPF Contribution</TableHead>
                            <TableHead className="text-right">EPS Contribution</TableHead>
                            <TableHead className="text-right">EPF Difference</TableHead>
                            <TableHead className="text-right">EPS Difference</TableHead>
                            <TableHead className="text-right">Refund</TableHead>
                            <TableHead className="text-right font-bold">Grand Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.files.map((file, index) => {
                            const fileGrandTotal = 
                              file.totals.totalEPF + 
                              file.totals.totalEPS + 
                              file.totals.totalEPFDiff + 
                              file.totals.totalEPSDiff + 
                              file.totals.totalRefund;
                            
                            return (
                              <TableRow key={index}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-emerald-600" />
                                    {file.fileName}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatNumber(file.totals.memberCount)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatNumber(file.accountWiseSummary.length)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(file.totals.totalWages)}
                                </TableCell>
                                <TableCell className="text-right text-emerald-600">
                                  {formatCurrency(file.totals.totalEPF)}
                                </TableCell>
                                <TableCell className="text-right text-teal-600">
                                  {formatCurrency(file.totals.totalEPS)}
                                </TableCell>
                                <TableCell className="text-right text-amber-600">
                                  {formatCurrency(file.totals.totalEPFDiff)}
                                </TableCell>
                                <TableCell className="text-right text-orange-600">
                                  {formatCurrency(file.totals.totalEPSDiff)}
                                </TableCell>
                                <TableCell className="text-right text-blue-600">
                                  {formatCurrency(file.totals.totalRefund)}
                                </TableCell>
                                <TableCell className="text-right font-bold text-rose-600">
                                  {formatCurrency(fileGrandTotal)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {/* Grand Total Row */}
                          <TableRow className="bg-slate-100 dark:bg-slate-800 font-bold">
                            <TableCell>
                              GRAND TOTAL ({result.files.length} Files)
                            </TableCell>
                            <TableCell className="text-right">
                              {formatNumber(result.grandTotals.memberCount)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatNumber(result.combinedAccountSummary.length)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(result.grandTotals.totalWages)}
                            </TableCell>
                            <TableCell className="text-right text-emerald-600">
                              {formatCurrency(result.grandTotals.totalEPF)}
                            </TableCell>
                            <TableCell className="text-right text-teal-600">
                              {formatCurrency(result.grandTotals.totalEPS)}
                            </TableCell>
                            <TableCell className="text-right text-amber-600">
                              {formatCurrency(result.grandTotals.totalEPFDiff)}
                            </TableCell>
                            <TableCell className="text-right text-orange-600">
                              {formatCurrency(result.grandTotals.totalEPSDiff)}
                            </TableCell>
                            <TableCell className="text-right text-blue-600">
                              {formatCurrency(result.grandTotals.totalRefund)}
                            </TableCell>
                            <TableCell className="text-right text-rose-600">
                              {formatCurrency(result.grandTotals.grandTotal)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="epf-payable" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>EPF Payable Breakdown by File</CardTitle>
                    <CardDescription>
                      Account-wise EPF payable amounts for each uploaded file
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>File Name</TableHead>
                            <TableHead className="text-right">A/C 01 (EPF)</TableHead>
                            <TableHead className="text-right">A/C 02 (EPF Diff)</TableHead>
                            <TableHead className="text-right">A/C 10 (EPS)</TableHead>
                            <TableHead className="text-right">A/C 20 (EDLI)</TableHead>
                            <TableHead className="text-right">A/C 21 (EDLI Admin)</TableHead>
                            <TableHead className="text-right">A/C 22 (EPF Admin)</TableHead>
                            <TableHead className="text-right font-bold">Total Payable</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.fileWiseEPFPayable.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-emerald-600" />
                                  {item.fileName}
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-emerald-600">
                                {formatCurrency(item.breakdown.account1)}
                              </TableCell>
                              <TableCell className="text-right text-teal-600">
                                {formatCurrency(item.breakdown.account2)}
                              </TableCell>
                              <TableCell className="text-right text-blue-600">
                                {formatCurrency(item.breakdown.account10)}
                              </TableCell>
                              <TableCell className="text-right text-purple-600">
                                {formatCurrency(item.breakdown.account20)}
                              </TableCell>
                              <TableCell className="text-right text-orange-600">
                                {formatCurrency(item.breakdown.account21)}
                              </TableCell>
                              <TableCell className="text-right text-slate-500">
                                {formatCurrency(item.breakdown.account22)}
                              </TableCell>
                              <TableCell className="text-right font-bold text-rose-600">
                                {formatCurrency(item.breakdown.totalPayable)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {/* Grand Total Row */}
                          <TableRow className="bg-emerald-100 dark:bg-emerald-900 font-bold">
                            <TableCell className="text-emerald-700 dark:text-emerald-400">
                              TOTAL PF PAYABLE ({result.files.length} Files)
                            </TableCell>
                            <TableCell className="text-right text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(result.combinedEPFPayableBreakdown.account1)}
                            </TableCell>
                            <TableCell className="text-right text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(result.combinedEPFPayableBreakdown.account2)}
                            </TableCell>
                            <TableCell className="text-right text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(result.combinedEPFPayableBreakdown.account10)}
                            </TableCell>
                            <TableCell className="text-right text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(result.combinedEPFPayableBreakdown.account20)}
                            </TableCell>
                            <TableCell className="text-right text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(result.combinedEPFPayableBreakdown.account21)}
                            </TableCell>
                            <TableCell className="text-right text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(result.combinedEPFPayableBreakdown.account22)}
                            </TableCell>
                            <TableCell className="text-right text-emerald-700 dark:text-emerald-400 text-lg">
                              {formatCurrency(result.combinedEPFPayableBreakdown.totalPayable)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Sample Format Info */}
        {!result && files.length === 0 && (
          <Card className="bg-slate-50 dark:bg-slate-800/50">
            <CardHeader>
              <CardTitle className="text-lg">ECR File Format</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                The ECR text file should contain member records in the following format (pipe | or tilde ~ separated):
              </p>
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                <code>
                  UAN~MemberName~AccountNo~Wages~EPFContribution~EPSContribution~EPFDiff~EPSDiff~NCPDays~Refund
                </code>
              </div>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <div className="p-2 bg-white dark:bg-slate-900 rounded">
                  <span className="font-semibold">UAN</span>: Universal Account Number
                </div>
                <div className="p-2 bg-white dark:bg-slate-900 rounded">
                  <span className="font-semibold">Account No</span>: PF Account Number
                </div>
                <div className="p-2 bg-white dark:bg-slate-900 rounded">
                  <span className="font-semibold">Wages</span>: Gross Wages
                </div>
                <div className="p-2 bg-white dark:bg-slate-900 rounded">
                  <span className="font-semibold">EPF</span>: EPF Share
                </div>
                <div className="p-2 bg-white dark:bg-slate-900 rounded">
                  <span className="font-semibold">EPS</span>: EPS Share
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            EPFO ECR Maker - Upload ECR text files to get account-wise contribution summaries
          </p>
        </div>
      </footer>
    </div>
  );
}
