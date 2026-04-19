import { supabase } from '@/integrations/supabase/client';
import type { BankMetrics } from '@/data/bankData';
import { pollAgentRuns } from '@/lib/api/pollAgentRuns';

interface UBPRQuarter {
  quarter: string;
  date: string;
  roaa: number;
  roae: number;
  nim: number;
  efficiencyRatio: number;
  costOfFunds: number;
  loanToDeposit: number;
  tier1Capital: number;
  totalCapital: number;
  nplRatio: number;
  allowanceRatio: number;
}

interface UBPRResponse {
  success: boolean;
  error?: string;
  source?: 'cache' | 'live';
  cachedAt?: string;
  status?: 'processing' | 'completed' | 'failed';
  jobId?: string;
  data?: {
    quarters: UBPRQuarter[];
  };
}

export interface FetchUBPRResult {
  metrics: BankMetrics[];
  source: 'cache' | 'live';
  cachedAt?: string;
}

const mapQuartersToMetrics = (quarters: UBPRQuarter[]): BankMetrics[] =>
  quarters.map((q) => ({
    quarter: q.quarter,
    roaa: Number(q.roaa) || 0,
    roae: Number(q.roae) || 0,
    nim: Number(q.nim) || 0,
    efficiencyRatio: Number(q.efficiencyRatio) || 0,
    costOfFunds: Number(q.costOfFunds) || 0,
    loanToDeposit: Number(q.loanToDeposit) || 0,
    tier1Capital: Number(q.tier1Capital) || 0,
    totalCapital: Number(q.totalCapital) || 0,
    nplRatio: Number(q.nplRatio) || 0,
    allowanceRatio: Number(q.allowanceRatio) || 0,
  }));

export const fetchUBPR = async (rssd: string, bankName: string, onStatusUpdate?: (message: string) => void): Promise<FetchUBPRResult> => {
  const { data, error } = await supabase.functions.invoke<UBPRResponse>('fetch-ubpr', {
    body: { rssd, bankName },
  });

  if (error) {
    // FunctionsHttpError carries the raw Response on .context — try to surface the server message
    let message = error.message;
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) message = body.error;
    } catch { /* body not JSON or already consumed */ }
    throw new Error(`Failed to fetch UBPR: ${message}`);
  }

  if (data?.success && data?.data?.quarters) {
    return {
      metrics: mapQuartersToMetrics(data.data.quarters),
      source: data.source || 'live',
      cachedAt: data.cachedAt,
    };
  }

  if (data?.success && data?.status === 'processing' && data?.jobId) {
    const finalJob = await pollAgentRuns(data.jobId, undefined, onStatusUpdate);

    if (finalJob.status !== 'completed' || !finalJob.data?.quarters) {
      throw new Error(finalJob.error || 'No UBPR data returned');
    }

    const quarters = finalJob.data.quarters as unknown as UBPRQuarter[];

    return {
      metrics: mapQuartersToMetrics(quarters),
      source: finalJob.source === 'cache' ? 'cache' : 'live',
    };
  }

  throw new Error(data?.error || 'No UBPR data returned');
};
