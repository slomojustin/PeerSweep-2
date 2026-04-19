import { supabase } from '@/integrations/supabase/client';

interface RawMetricRow {
  report_date: string;
  metric_name: string;
  value: string | null; // Supabase returns numeric as string
}

export interface QuarterData {
  report_date: string; // "YYYY-MM-DD"
  metrics: Record<string, number | null>;
}

/**
 * Fetches UBPR metrics for a given RSSD from Supabase ubpr_metrics table.
 * Groups rows by report_date and returns them sorted newest-first.
 * @param rssd - The bank's RSSD ID
 * @throws if Supabase returns an error or no rows are found for this RSSD
 */
export async function fetchUBPRData(rssd: string): Promise<QuarterData[]> {
  try {
    const { data, error } = await supabase
      .from('ubpr_metrics')
      .select('report_date, metric_name, value')
      .eq('rssd', rssd)
      .order('report_date', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      throw new Error('No UBPR data found for this bank. Data may not yet be loaded.');
    }

    const rows = data as RawMetricRow[];

    const grouped = new Map<string, Record<string, number | null>>();
    for (const row of rows) {
      if (!grouped.has(row.report_date)) grouped.set(row.report_date, {});
      grouped.get(row.report_date)![row.metric_name] =
        row.value !== null ? parseFloat(row.value) : null;
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([report_date, metrics]) => ({ report_date, metrics }));
  } catch (err) {
    console.error('[fetchUBPRData] failed for rssd:', rssd, err);
    throw err;
  }
}
