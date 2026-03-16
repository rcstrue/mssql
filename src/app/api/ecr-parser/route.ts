import { NextRequest, NextResponse } from 'next/server';

// ECR Field positions based on standard EPFO ECR format
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

// EPF Payable Breakdown by Account Numbers
interface EPFPayableBreakdown {
  account1: number;   // EPF Contribution (Employee + Employer)
  account2: number;   // EPF Difference (Employer EPF - EPS = 3.67%)
  account10: number;  // EPS Contribution (8.33%)
  account20: number;  // EDLI Contribution (0.5% of wages)
  account21: number;  // EDLI Admin Charges (0.005% of wages, min ₹2, max ₹500 per establishment)
  account22: number;  // EPF Admin Charges (0.5% - now 0.00% from July 2022, but included for reference)
  totalPayable: number;
}

function parseECRLine(line: string): ECRRecord | null {
  // ECR format is typically pipe (|) or tilde (~) separated
  // Standard format: UAN~MemberName~AccountNo~GrossWages~EPFShare~EPSShare~EPFDiff~EPSDiff~NCPDays~Refund
  const separator = line.includes('~') ? '~' : '|';
  const fields = line.split(separator).map(f => f.trim());
  
  if (fields.length < 7) return null;
  
  // Skip header lines
  if (fields[0].toUpperCase() === 'UAN' || fields[0].toUpperCase() === 'MEMBER_ID') return null;
  
  const parseAmount = (val: string): number => {
    const num = parseFloat(val.replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? 0 : num;
  };
  
  return {
    uan: fields[0] || '',
    memberName: fields[1] || '',
    accountNo: fields[2] || '',
    wages: parseAmount(fields[3] || '0'),
    epfContribution: parseAmount(fields[4] || '0'),
    epsContribution: parseAmount(fields[5] || '0'),
    epfDiff: parseAmount(fields[6] || '0'),
    epsDiff: parseAmount(fields[7] || '0'),
    ncpDays: parseInt(fields[8] || '0'),
    refundOfAdvances: parseAmount(fields[9] || '0'),
  };
}

function calculateEPFPayableBreakdown(totals: {
  totalWages: number;
  totalEPF: number;
  totalEPS: number;
  totalEPFDiff: number;
  totalEPSDiff: number;
  totalRefund: number;
  memberCount: number;
}): EPFPayableBreakdown {
  // A/C No. 01: EPF Contribution (Employee + Employer share)
  const account1 = totals.totalEPF + totals.totalEPFDiff;
  
  // A/C No. 02: EPF Difference (Employer share remaining after EPS = 3.67%)
  const account2 = totals.totalEPFDiff;
  
  // A/C No. 10: EPS Contribution (8.33% of wages, capped)
  const account10 = totals.totalEPS + totals.totalEPSDiff;
  
  // A/C No. 20: EDLI Contribution (0.5% of wages)
  const account20 = Math.round(totals.totalWages * 0.005);
  
  // A/C No. 21: EDLI Admin Charges (0.005% of wages, min ₹2, max ₹500)
  let account21 = Math.round(totals.totalWages * 0.00005);
  if (account21 < 2) account21 = 2;
  if (account21 > 500) account21 = 500;
  
  // A/C No. 22: EPF Admin Charges (0.5% - now 0.00% from July 2022)
  // Keeping for reference but set to 0
  const account22 = 0;
  
  // Total Payable
  const totalPayable = account1 + account10 + account20 + account21 + account22;
  
  return {
    account1,
    account2,
    account10,
    account20,
    account21,
    account22,
    totalPayable,
  };
}

function parseECRFile(content: string, fileName: string): ParsedECRFile {
  const lines = content.split('\n').filter(line => line.trim());
  const records: ECRRecord[] = [];
  
  for (const line of lines) {
    const record = parseECRLine(line);
    if (record) {
      records.push(record);
    }
  }
  
  // Calculate totals
  const totals = {
    totalWages: records.reduce((sum, r) => sum + r.wages, 0),
    totalEPF: records.reduce((sum, r) => sum + r.epfContribution, 0),
    totalEPS: records.reduce((sum, r) => sum + r.epsContribution, 0),
    totalEPFDiff: records.reduce((sum, r) => sum + r.epfDiff, 0),
    totalEPSDiff: records.reduce((sum, r) => sum + r.epsDiff, 0),
    totalRefund: records.reduce((sum, r) => sum + r.refundOfAdvances, 0),
    memberCount: records.length,
  };
  
  // Calculate EPF Payable Breakdown
  const epfPayableBreakdown = calculateEPFPayableBreakdown(totals);
  
  // Calculate account-wise summary
  const accountMap = new Map<string, AccountSummary>();
  
  for (const record of records) {
    const accountNo = record.accountNo || 'Unknown';
    const existing = accountMap.get(accountNo) || {
      accountNo,
      memberCount: 0,
      totalWages: 0,
      totalEPF: 0,
      totalEPS: 0,
      totalEPFDiff: 0,
      totalEPSDiff: 0,
      totalRefund: 0,
      grandTotal: 0,
    };
    
    existing.memberCount += 1;
    existing.totalWages += record.wages;
    existing.totalEPF += record.epfContribution;
    existing.totalEPS += record.epsContribution;
    existing.totalEPFDiff += record.epfDiff;
    existing.totalEPSDiff += record.epsDiff;
    existing.totalRefund += record.refundOfAdvances;
    existing.grandTotal = existing.totalEPF + existing.totalEPS + existing.totalEPFDiff + existing.totalEPSDiff + existing.totalRefund;
    
    accountMap.set(accountNo, existing);
  }
  
  const accountWiseSummary = Array.from(accountMap.values()).sort((a, b) => 
    a.accountNo.localeCompare(b.accountNo)
  );
  
  return {
    fileName,
    records,
    totals,
    accountWiseSummary,
    epfPayableBreakdown,
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    
    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }
    
    const results: ParsedECRFile[] = [];
    
    for (const file of files) {
      const content = await file.text();
      const parsed = parseECRFile(content, file.name);
      results.push(parsed);
    }
    
    // Calculate combined summary across all files
    const combinedSummary = new Map<string, AccountSummary>();
    
    for (const result of results) {
      for (const account of result.accountWiseSummary) {
        const existing = combinedSummary.get(account.accountNo) || {
          accountNo: account.accountNo,
          memberCount: 0,
          totalWages: 0,
          totalEPF: 0,
          totalEPS: 0,
          totalEPFDiff: 0,
          totalEPSDiff: 0,
          totalRefund: 0,
          grandTotal: 0,
        };
        
        existing.memberCount += account.memberCount;
        existing.totalWages += account.totalWages;
        existing.totalEPF += account.totalEPF;
        existing.totalEPS += account.totalEPS;
        existing.totalEPFDiff += account.totalEPFDiff;
        existing.totalEPSDiff += account.totalEPSDiff;
        existing.totalRefund += account.totalRefund;
        existing.grandTotal = existing.totalEPF + existing.totalEPS + existing.totalEPFDiff + existing.totalEPSDiff + existing.totalRefund;
        
        combinedSummary.set(account.accountNo, existing);
      }
    }
    
    const combinedAccountSummary = Array.from(combinedSummary.values()).sort((a, b) => 
      a.accountNo.localeCompare(b.accountNo)
    );
    
    // Calculate grand totals
    const grandTotals = {
      totalWages: results.reduce((sum, r) => sum + r.totals.totalWages, 0),
      totalEPF: results.reduce((sum, r) => sum + r.totals.totalEPF, 0),
      totalEPS: results.reduce((sum, r) => sum + r.totals.totalEPS, 0),
      totalEPFDiff: results.reduce((sum, r) => sum + r.totals.totalEPFDiff, 0),
      totalEPSDiff: results.reduce((sum, r) => sum + r.totals.totalEPSDiff, 0),
      totalRefund: results.reduce((sum, r) => sum + r.totals.totalRefund, 0),
      memberCount: results.reduce((sum, r) => sum + r.totals.memberCount, 0),
      grandTotal: combinedAccountSummary.reduce((sum, a) => sum + a.grandTotal, 0),
    };
    
    // Calculate combined EPF Payable Breakdown
    const combinedEPFPayableBreakdown = calculateEPFPayableBreakdown(grandTotals);
    
    // File-wise EPF Payable Breakdown
    const fileWiseEPFPayable = results.map(r => ({
      fileName: r.fileName,
      breakdown: r.epfPayableBreakdown,
    }));
    
    return NextResponse.json({
      success: true,
      files: results,
      combinedAccountSummary,
      grandTotals,
      combinedEPFPayableBreakdown,
      fileWiseEPFPayable,
    });
    
  } catch (error) {
    console.error('ECR parsing error:', error);
    return NextResponse.json(
      { error: 'Failed to parse ECR files' },
      { status: 500 }
    );
  }
}
