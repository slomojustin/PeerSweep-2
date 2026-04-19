import { supabase } from '@/integrations/supabase/client';

export interface UBPRPdfData {
  report_date: string;
  quarter: string;
  metrics: Record<string, number | null>;
}

interface RawMetricRow {
  report_date: string;
  metric_name: string;
  value: string | null;
  period_type: string;
}

function toQuarterLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth();
  const year = d.getFullYear();
  const q = month < 3 ? 'Q1' : month < 6 ? 'Q2' : month < 9 ? 'Q3' : 'Q4';
  return `${q} ${year}`;
}

/**
 * Fetches UBPR metrics for a bank from the ubpr_metrics table, grouped by report date.
 *
 * @param rssd - The RSSD ID of the bank to fetch data for.
 * @returns An array of UBPRPdfData objects, one per report date, sorted newest first.
 * @throws If the Supabase query fails (original error message preserved), or if no rows
 *         are returned for the given RSSD.
 */
export const fetchUBPRData = async (rssd: string): Promise<UBPRPdfData[]> => {
  try {
    const { data, error } = await supabase
      .from('ubpr_metrics')
      .select('report_date, metric_name, value, period_type')
      .eq('rssd', rssd)
      .order('report_date', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      throw new Error('No UBPR data found for this bank. Data may not yet be loaded.');
    }

    const rows = data as RawMetricRow[];

    // Group rows by report_date using a Map to preserve insertion order
    const byDate = new Map<string, Record<string, number | null>>();

    for (const row of rows) {
      if (!byDate.has(row.report_date)) {
        byDate.set(row.report_date, {});
      }
      const metrics = byDate.get(row.report_date)!;
      metrics[row.metric_name] = row.value !== null ? parseFloat(row.value) : null;
    }

    return Array.from(byDate.entries()).map(([report_date, metrics]) => ({
      report_date,
      quarter: toQuarterLabel(report_date),
      metrics,
    }));
  } catch (err) {
    console.error(`fetchUBPRData failed for rssd=${rssd}:`, err);
    throw err;
  }
};
