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
 * Maps snake_case metric_name values stored in ubpr_metrics to the UBPR codes
 * defined in ubprConceptMap.ts. Keys not present here are dropped from output.
 *
 * Mapping rationale: each DB metric_name is matched to its closest concept map
 * entry by label. Metrics whose concept-map equivalent doesn't exist are omitted.
 */
const DB_NAME_TO_UBPR_CODE: Record<string, string> = {
  // Performance Ratios
  return_on_assets:             'CALC_ROA',
  return_on_equity:             'CALC_ROE',
  efficiency_ratio:             'CALC_EFF',
  net_interest_margin:          'CALC_NIM',
  net_interest_spread:          'CALC_NIS',
  noninterest_income_to_assets: 'CALC_NIA',
  noninterest_expense_to_assets:'CALC_NEA',
  cost_of_funds:                'CALC_COF',
  loan_growth_rate:             'CALC_LGR',
  // Capital Adequacy
  tier1_leverage_ratio:         'CALC_T1L',
  total_risk_based_capital_ratio:'CALC_RBC',
  // Balance Sheet – Assets
  average_earning_assets:       'CALC_AEA',
  // Balance Sheet – Liabilities & Capital
  demand_deposits:              'CALC_DDM',
  time_deposits_over_250k:      'CALC_TD250',
  core_deposit_ratio:           'CALC_CDR',
  brokered_deposit_ratio:       'CALC_BDR',
  // Liquidity
  liquidity_ratio:              'CALC_LIQ',
  // Income Statement
  total_assets:                 'UBPR2170',
  total_loans:                  'UBPRB528',
  total_interest_income:        'UBPRD081',
  total_interest_expense:       'UBPRD113',
  net_interest_income:          'UBPRD126',
  noninterest_income:           'UBPRD233',
  noninterest_expense:          'UBPRD296',
  total_deposits:               'UBPRD154',
  total_equity:                 'UBPR2365',
  // Summary Ratios
  loan_loss_provision:          'UBPRD670',
  // Loan Mix & Quality
  loan_loss_reserve_ratio:      'UBPRE125',
  net_charge_off_ratio:         'UBPRE126',
  noncurrent_loans_ratio:       'UBPRE130',
};

/**
 * Fetches UBPR metrics for a given RSSD from Supabase ubpr_metrics table.
 * Groups rows by report_date, translates snake_case metric names to UBPR concept
 * map codes, and returns them sorted newest-first.
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

    // Group by report_date using snake_case keys first
    const grouped = new Map<string, Record<string, number | null>>();
    for (const row of rows) {
      if (!grouped.has(row.report_date)) grouped.set(row.report_date, {});
      grouped.get(row.report_date)![row.metric_name] =
        row.value !== null ? parseFloat(row.value) : null;
    }

    // Unit normalization pass (before translation, operates on DB metric names)
    for (const metrics of grouped.values()) {
      // Stored in basis points — divide by 100 to get percentage
      for (const key of ['net_interest_spread', 'loan_growth_rate'] as const) {
        if (metrics[key] !== null && metrics[key] !== undefined) {
          metrics[key] = (metrics[key] as number) / 100;
        }
      }
      // Corrupt source data — null out implausible values
      if (metrics['cost_of_funds'] !== null && (metrics['cost_of_funds'] as number) > 1000) {
        metrics['cost_of_funds'] = null;
      }
    }

    // Translate snake_case keys → UBPR concept map codes, drop unmapped keys
    return Array.from(grouped.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([report_date, rawMetrics]) => {
        const metrics: Record<string, number | null> = {};
        for (const [dbName, value] of Object.entries(rawMetrics)) {
          const code = DB_NAME_TO_UBPR_CODE[dbName];
          if (code !== undefined) {
            metrics[code] = value;
          }
        }
        return { report_date, metrics };
      });
  } catch (err) {
    console.error('[fetchUBPRData] failed for rssd:', rssd, err);
    throw err;
  }
}
