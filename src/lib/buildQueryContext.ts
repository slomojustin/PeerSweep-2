import type { QuarterData } from '@/lib/api/ubprPdf';
import type { MarketIntelData } from '@/lib/api/marketIntel';
import type { BankInfo } from '@/data/bankData';

// Metrics included in the peer comparison table, in display order
const CONTEXT_METRICS: Array<{ code: string; label: string; format: 'ratio' | 'dollar'; higherGood: boolean }> = [
  { code: 'CALC_ROA',  label: 'Return on Assets',     format: 'ratio',  higherGood: true  },
  { code: 'CALC_ROE',  label: 'Return on Equity',      format: 'ratio',  higherGood: true  },
  { code: 'CALC_NIM',  label: 'Net Interest Margin',   format: 'ratio',  higherGood: true  },
  { code: 'CALC_EFF',  label: 'Efficiency Ratio',      format: 'ratio',  higherGood: false },
  { code: 'CALC_COF',  label: 'Cost of Funds',         format: 'ratio',  higherGood: false },
  { code: 'CALC_T1L',  label: 'Tier 1 Leverage',       format: 'ratio',  higherGood: true  },
  { code: 'UBPRE130',  label: 'NPL Ratio',             format: 'ratio',  higherGood: false },
  { code: 'UBPR2170',  label: 'Total Assets ($000s)',  format: 'dollar', higherGood: true  },
  { code: 'UBPRD154',  label: 'Total Deposits ($000s)', format: 'dollar', higherGood: true },
];

function toQuarterLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const q = ['Q1','Q1','Q1','Q2','Q2','Q2','Q3','Q3','Q3','Q4','Q4','Q4'][d.getMonth()];
  return `${q} ${d.getFullYear()}`;
}

function getMetricsForQuarter(quarters: QuarterData[], reportDate: string | null): Record<string, number | null> {
  if (quarters.length === 0) return {};
  if (!reportDate) return quarters[0].metrics;
  return (quarters.find(q => q.report_date === reportDate) ?? quarters[0]).metrics;
}

function fmtRatio(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '—';
  return `${v.toFixed(2)}%`;
}

function fmtDollar(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '—';
  const millions = v / 1000;
  if (millions >= 1000) return `$${(millions / 1000).toFixed(1)}B`;
  return `$${millions.toFixed(0)}M`;
}

function fmt(v: number | null | undefined, format: 'ratio' | 'dollar'): string {
  return format === 'ratio' ? fmtRatio(v) : fmtDollar(v);
}

function rank(subjectVal: number, peerVals: number[], higherGood: boolean): { rank: number; total: number } {
  const all = [subjectVal, ...peerVals].sort((a, b) => higherGood ? b - a : a - b);
  return { rank: all.indexOf(subjectVal) + 1, total: all.length };
}

function avg(vals: number[]): number | null {
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

export interface BuildQueryContextParams {
  bankName: string;
  rssd: string;
  subjectQuarters: QuarterData[] | null;
  peerBanks: BankInfo[];
  peerData: Map<string, QuarterData[] | null> | null;
  marketIntelData: MarketIntelData | null;
  selectedQuarter: string | null;
}

export function buildQueryContext({
  bankName,
  rssd,
  subjectQuarters,
  peerBanks,
  peerData,
  marketIntelData,
  selectedQuarter,
}: BuildQueryContextParams): string {
  const parts: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────────────
  const activeDate = selectedQuarter
    ?? subjectQuarters?.[0]?.report_date
    ?? null;
  const periodLabel = activeDate ? toQuarterLabel(activeDate) : 'Most Recent Quarter';

  parts.push(`SUBJECT BANK: ${bankName} (RSSD: ${rssd})`);
  parts.push(`ANALYSIS PERIOD: ${periodLabel}`);

  // ── FFIEC / Subject UBPR metrics ────────────────────────────────────────────
  parts.push('');
  parts.push('=== FFIEC REPORT (KEY METRICS) ===');

  if (!subjectQuarters || subjectQuarters.length === 0) {
    parts.push('[Not available — FFIEC data not loaded]');
  } else {
    const subjectMetrics = getMetricsForQuarter(subjectQuarters, activeDate);

    // Prior quarter for trend context
    const priorDate = subjectQuarters[1]?.report_date ?? null;
    const priorMetrics = priorDate ? getMetricsForQuarter(subjectQuarters, priorDate) : null;
    const priorLabel = priorDate ? toQuarterLabel(priorDate) : null;

    parts.push(`Period: ${periodLabel}${priorLabel ? ` (prior: ${priorLabel})` : ''}`);
    parts.push('');

    for (const m of CONTEXT_METRICS) {
      const curr = subjectMetrics[m.code] ?? null;
      const prior = priorMetrics?.[m.code] ?? null;
      let line = `${m.label}: ${fmt(curr, m.format)}`;
      if (prior !== null && curr !== null) {
        const diff = curr - prior;
        const sign = diff > 0 ? '+' : '';
        line += ` (${sign}${fmt(diff, m.format)} vs ${priorLabel})`;
      }
      parts.push(line);
    }
  }

  // ── Peer Comparison ─────────────────────────────────────────────────────────
  parts.push('');
  parts.push('=== PEER COMPARISON ===');

  if (!peerData || peerBanks.length === 0) {
    parts.push('[Not available — visit Peer Analysis tab to load peer data]');
  } else {
    const subjectMetrics = subjectQuarters
      ? getMetricsForQuarter(subjectQuarters, activeDate)
      : {};

    parts.push(`Peers included: ${peerBanks.length}`);
    parts.push('');

    // Column header
    const nameCols = peerBanks.map(p => p.name.split(' ').slice(0, 2).join(' ')); // shorten names
    parts.push(`Metric              | ${bankName.split(' ').slice(0, 2).join(' ')} | Peer Avg | Rank`);
    parts.push('─'.repeat(65));

    for (const m of CONTEXT_METRICS) {
      const subjectVal = subjectMetrics[m.code] ?? null;
      const peerVals: number[] = [];

      for (const peer of peerBanks) {
        const quarters = peerData.get(peer.rssd);
        if (!quarters || quarters.length === 0) continue;
        const v = getMetricsForQuarter(quarters, activeDate)[m.code] ?? null;
        if (v !== null) peerVals.push(v);
      }

      const peerAvg = avg(peerVals);

      let rankStr = '—';
      if (subjectVal !== null && peerVals.length > 0) {
        const r = rank(subjectVal, peerVals, m.higherGood);
        rankStr = `${r.rank} of ${r.total}`;
      }

      const label = m.label.padEnd(19);
      const subjectStr = fmt(subjectVal, m.format).padEnd(10);
      const avgStr = fmt(peerAvg, m.format).padEnd(9);
      parts.push(`${label} | ${subjectStr} | ${avgStr} | ${rankStr}`);
    }

    // Add individual peer values for each key metric as a separate block
    parts.push('');
    parts.push('Individual peer values (ROA / NIM / CoF):');
    for (const peer of peerBanks) {
      const quarters = peerData.get(peer.rssd);
      if (!quarters || quarters.length === 0) {
        parts.push(`  ${peer.name}: [no data]`);
        continue;
      }
      const m = getMetricsForQuarter(quarters, activeDate);
      parts.push(
        `  ${peer.name}: ROA ${fmtRatio(m['CALC_ROA'])} | NIM ${fmtRatio(m['CALC_NIM'])} | CoF ${fmtRatio(m['CALC_COF'])} | T1 ${fmtRatio(m['CALC_T1L'])}`,
      );
    }
  }

  // ── Market Intelligence ─────────────────────────────────────────────────────
  parts.push('');
  parts.push('=== MARKET INTELLIGENCE ===');

  if (!marketIntelData) {
    parts.push('[Not available — visit Market Intel tab to load market data]');
  } else {
    // Competitor rates
    if (marketIntelData.competitorRates && marketIntelData.competitorRates.length > 0) {
      parts.push('Competitor deposit rates:');
      for (const r of marketIntelData.competitorRates.slice(0, 8)) {
        parts.push(`  ${r.institution} — ${r.product}: ${r.rate}% (as of ${r.date})`);
      }
    }

    // FDIC market share
    if (marketIntelData.fdicMarketShare) {
      const fdic = marketIntelData.fdicMarketShare;
      parts.push(`FDIC market share (${fdic.marketArea}): ${bankName} holds ${fdic.marketSharePct?.toFixed(1)}% with $${(fdic.totalDeposits / 1_000_000).toFixed(1)}B in deposits`);
      if (fdic.competitors?.length > 0) {
        parts.push('Top local competitors:');
        for (const c of fdic.competitors.slice(0, 4)) {
          parts.push(`  ${c.name}: ${c.marketSharePct?.toFixed(1)}% market share`);
        }
      }
    }

    // Peer bank rates
    if (marketIntelData.peerBankRates && marketIntelData.peerBankRates.length > 0) {
      parts.push('Peer bank rates:');
      for (const r of marketIntelData.peerBankRates.slice(0, 6)) {
        parts.push(`  ${r.bankName} — ${r.product}: ${r.rate}%`);
      }
    }

    // Local news
    if (marketIntelData.localNews && marketIntelData.localNews.length > 0) {
      parts.push('Recent news:');
      for (const item of marketIntelData.localNews.slice(0, 4)) {
        parts.push(`  [${item.date ?? 'recent'}] ${item.headline} — ${item.summary}`);
      }
    }
  }

  return parts.join('\n');
}
