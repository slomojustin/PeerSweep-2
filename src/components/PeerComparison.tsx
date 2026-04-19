import { useState, useEffect, useRef, useMemo } from "react";
import { type BankInfo, type BankMetrics } from "@/data/bankData";
import { fetchUBPRData, type QuarterData } from "@/lib/api/ubprPdf";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface PeerComparisonProps {
  subjectBank: BankInfo;
  subjectMetrics: BankMetrics[]; // kept for interface compat
  peerBanks: BankInfo[];
  selectedQuarter?: string | null;
  onPeerDataLoaded?: (subject: QuarterData[] | null, peers: Map<string, QuarterData[] | null>) => void;
}

interface MetricDef {
  code: string;
  label: string;
  format: "ratio" | "dollar";
  higherGood: boolean;
}

const METRICS: MetricDef[] = [
  { code: "CALC_ROA",  label: "Return on Assets",      format: "ratio",  higherGood: true  },
  // { code: "CALC_ROE", label: "Return on Equity", format: "ratio", higherGood: true }, // TODO: fix 0-value data issue post-demo
  { code: "CALC_NIM",  label: "Net Interest Margin",    format: "ratio",  higherGood: true  },
  { code: "CALC_EFF",  label: "Efficiency Ratio",       format: "ratio",  higherGood: false },
  { code: "CALC_NIS",  label: "Net Interest Spread",    format: "ratio",  higherGood: true  },
  { code: "CALC_COF",  label: "Cost of Funds",          format: "ratio",  higherGood: false },
  { code: "CALC_LGR",  label: "Loan Growth Rate",       format: "ratio",  higherGood: true  },
  { code: "CALC_T1L",  label: "Tier 1 Leverage Ratio",  format: "ratio",  higherGood: true  },
  { code: "UBPRE130",  label: "NPL Ratio",              format: "ratio",  higherGood: false },
  { code: "UBPR2170",  label: "Total Assets ($000s)",   format: "dollar", higherGood: true  },
  { code: "UBPRD154",  label: "Total Deposits ($000s)", format: "dollar", higherGood: true  },
];

function formatValue(raw: number | null | undefined, format: "ratio" | "dollar"): string {
  if (raw === null || raw === undefined || isNaN(raw)) return "—";
  if (format === "ratio") return raw.toFixed(2) + "%";
  return Math.round(raw / 1000).toLocaleString("en-US");
}

function getMetrics(quarters: QuarterData[], selectedDate?: string | null): Record<string, number | null> {
  if (!quarters || quarters.length === 0) return {};
  if (!selectedDate) return quarters[0]?.metrics ?? {};
  return (quarters.find(q => q.report_date === selectedDate) ?? quarters[0])?.metrics ?? {};
}

const Shimmer = () => (
  <div className="animate-pulse bg-muted rounded h-4 w-12 ml-auto" />
);

// null = fetched, no data / error  |  undefined = not yet fetched (loading)
type PeerEntry = QuarterData[] | null | undefined;

// ── Summary strip helpers ─────────────────────────────────────────────────────

interface SummaryItem { metric: MetricDef; rank: number; total: number; pct: number; }

function computeSummary(
  subjectMap: Record<string, number | null>,
  peers: BankInfo[],
  peerDataMap: Record<string, PeerEntry>,
  selectedQuarter?: string | null,
): SummaryItem[] {
  return METRICS.flatMap((metric) => {
    const subjectVal = subjectMap[metric.code] ?? null;
    if (subjectVal === null) return [];
    const peerVals = peers
      .map((p) => {
        const e = peerDataMap[p.rssd];
        if (!e || e.length === 0) return null;
        return getMetrics(e, selectedQuarter)[metric.code] ?? null;
      })
      .filter((v): v is number => v !== null);
    if (peerVals.length === 0) return [];
    const allVals = [subjectVal, ...peerVals];
    const sorted = [...allVals].sort((a, b) => metric.higherGood ? b - a : a - b);
    const rank = sorted.indexOf(subjectVal) + 1;
    const total = allVals.length;
    return [{ metric, rank, total, pct: rank / total }];
  });
}

// ── Inline bar chart ──────────────────────────────────────────────────────────

interface BarChartProps {
  metric: MetricDef;
  subjectBank: BankInfo;
  subjectMap: Record<string, number | null> | null;
  peers: BankInfo[];
  peerDataMap: Record<string, PeerEntry>;
  selectedQuarter?: string | null;
}

const MetricBarChart = ({ metric, subjectBank, subjectMap, peers, peerDataMap, selectedQuarter }: BarChartProps) => {
  const banks: { name: string; val: number; isSubject: boolean }[] = [];

  const sv = subjectMap?.[metric.code] ?? null;
  if (sv !== null) banks.push({ name: subjectBank.name, val: sv, isSubject: true });
  for (const peer of peers) {
    const e = peerDataMap[peer.rssd];
    if (!e || e.length === 0) continue;
    const v = getMetrics(e, selectedQuarter)[metric.code] ?? null;
    if (v !== null) banks.push({ name: peer.name, val: v, isSubject: false });
  }

  if (banks.length === 0) return <p className="text-xs text-muted-foreground">No data available.</p>;

  const sorted = [...banks].sort((a, b) => metric.higherGood ? b.val - a.val : a.val - b.val);
  const vals = sorted.map((b) => b.val);
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const range = maxVal - minVal || 1;

  return (
    <div className="space-y-2 py-1">
      {sorted.map((bank, i) => {
        const barPct = ((bank.val - minVal) / range) * 75 + 10;
        return (
          <div key={bank.name + i} className="flex items-center gap-3">
            <span className={`text-xs w-44 truncate text-right shrink-0 ${bank.isSubject ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              {bank.name}
            </span>
            <div className="flex-1 h-6 flex items-center">
              <div
                className={`h-5 rounded transition-all ${bank.isSubject ? "bg-primary" : "bg-muted-foreground/25"}`}
                style={{ width: `${barPct}%` }}
              />
            </div>
            <span className={`text-xs tabular-nums w-20 shrink-0 ${bank.isSubject ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              {formatValue(bank.val, metric.format)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const PeerComparison = ({ subjectBank, peerBanks, selectedQuarter, onPeerDataLoaded }: PeerComparisonProps) => {
  const cache = useRef<Map<string, QuarterData[] | null>>(new Map());
  const [subjectData, setSubjectData] = useState<QuarterData[] | null | undefined>(undefined);
  const [peerDataMap, setPeerDataMap] = useState<Record<string, PeerEntry>>({});
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);

  const peerRssdKey = useMemo(() => peerBanks.map(p => p.rssd).sort().join(","), [peerBanks]);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      // Subject
      const subjectCached = cache.current.get(subjectBank.rssd);
      if (subjectCached !== undefined) {
        if (!cancelled) setSubjectData(subjectCached);
      } else {
        try {
          const data = await fetchUBPRData(subjectBank.rssd);
          cache.current.set(subjectBank.rssd, data);
          if (!cancelled) setSubjectData(data);
        } catch {
          cache.current.set(subjectBank.rssd, null);
          if (!cancelled) setSubjectData(null);
        }
      }

      // Peers — show cached immediately, mark uncached as loading
      const initialMap: Record<string, PeerEntry> = {};
      for (const peer of peerBanks) {
        initialMap[peer.rssd] = cache.current.has(peer.rssd)
          ? cache.current.get(peer.rssd)
          : undefined;
      }
      if (!cancelled) setPeerDataMap({ ...initialMap });

      const uncached = peerBanks.filter(p => !cache.current.has(p.rssd));
      await Promise.all(
        uncached.map(async (peer) => {
          try {
            const data = await fetchUBPRData(peer.rssd);
            cache.current.set(peer.rssd, data);
            if (!cancelled) setPeerDataMap(prev => ({ ...prev, [peer.rssd]: data }));
          } catch {
            cache.current.set(peer.rssd, null);
            if (!cancelled) setPeerDataMap(prev => ({ ...prev, [peer.rssd]: null }));
          }
        }),
      );

      // Notify parent that all data (subject + every peer) has settled
      if (!cancelled && onPeerDataLoaded) {
        const subjectResult = cache.current.get(subjectBank.rssd) ?? null;
        const peerMap = new Map<string, QuarterData[] | null>();
        for (const peer of peerBanks) {
          peerMap.set(peer.rssd, cache.current.get(peer.rssd) ?? null);
        }
        onPeerDataLoaded(subjectResult, peerMap);
      }
    }

    if (peerBanks.length > 0) loadAll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectBank.rssd, peerRssdKey]);

  const isLoadingAny =
    subjectData === undefined || peerBanks.some(p => peerDataMap[p.rssd] === undefined);

  const subjectMetricsMap = subjectData ? getMetrics(subjectData, selectedQuarter) : null;

  const summary = useMemo(() => {
    if (subjectData === undefined || peerBanks.some(p => peerDataMap[p.rssd] === undefined) || !subjectMetricsMap)
      return null;
    return computeSummary(subjectMetricsMap, peerBanks, peerDataMap, selectedQuarter);
  }, [subjectData, subjectMetricsMap, peerBanks, peerDataMap, selectedQuarter]);

  const strengths  = summary?.filter(s => s.pct <= 0.33) ?? [];
  const weaknesses = summary?.filter(s => s.pct >= 0.67) ?? [];

  const totalCols = peerBanks.length + 4; // metric + subject + peers + avg + rank

  if (peerBanks.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="border-b-2 border-primary pb-3">
          <h3 className="font-display text-lg text-foreground">Peer Comparison</h3>
        </div>
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Select peer banks to enable comparison analysis.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="border-b-2 border-primary pb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg text-foreground">Peer Comparison</h3>
          {subjectData && subjectData.length > 0 && (() => {
            const dateStr = selectedQuarter ?? subjectData[0].report_date;
            const d = new Date(dateStr + "T00:00:00");
            const m = d.getMonth();
            const q = m < 3 ? "Q1" : m < 6 ? "Q2" : m < 9 ? "Q3" : "Q4";
            return (
              <span className="text-sm bg-amber-500/10 text-amber-700 border border-amber-200 rounded-full px-3 py-1 font-semibold">
                {q} {d.getFullYear()}
              </span>
            );
          })()}
        </div>
        <p className="text-sm text-muted-foreground">
          {subjectBank.name} vs. {peerBanks.length} peer{peerBanks.length !== 1 ? "s" : ""}
          {isLoadingAny && " — loading data…"}
        </p>
      </div>

      {/* Summary strip */}
      {summary && (strengths.length > 0 || weaknesses.length > 0) && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 px-1">
          {strengths.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-green-700 uppercase tracking-wide shrink-0">
                Strengths
              </span>
              {strengths.map(({ metric }) => (
                <span
                  key={metric.code}
                  className="text-xs bg-green-500/10 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5 font-medium cursor-pointer hover:bg-green-500/20 transition-colors"
                  onClick={() => setExpandedMetric(prev => prev === metric.code ? null : metric.code)}
                >
                  {metric.label}
                </span>
              ))}
            </div>
          )}
          {weaknesses.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-red-600 uppercase tracking-wide shrink-0">
                Lagging
              </span>
              {weaknesses.map(({ metric }) => (
                <span
                  key={metric.code}
                  className="text-xs bg-red-500/10 text-red-600 border border-red-200 rounded-full px-2.5 py-0.5 font-medium cursor-pointer hover:bg-red-500/20 transition-colors"
                  onClick={() => setExpandedMetric(prev => prev === metric.code ? null : metric.code)}
                >
                  {metric.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main table */}
      <Card className="overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/5">
              <TableHead className="font-semibold min-w-[180px] text-xs">Metric</TableHead>
              <TableHead className="text-right font-semibold bg-primary/10 border-x border-primary/20 min-w-[120px] text-xs">
                {subjectBank.name}
              </TableHead>
              {peerBanks.map(peer => (
                <TableHead key={peer.rssd} className="text-right font-semibold text-xs min-w-[100px]">
                  {peer.name}
                </TableHead>
              ))}
              <TableHead className="text-right font-semibold bg-muted/30 border-l-2 border-border min-w-[90px] text-xs">
                Peer Avg
              </TableHead>
              <TableHead className="text-right font-semibold min-w-[70px] text-xs">Rank</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {METRICS.flatMap((metric) => {
              const subjectVal = subjectMetricsMap
                ? (subjectMetricsMap[metric.code] ?? null)
                : null;

              const peerVals = peerBanks.map(peer => {
                const entry = peerDataMap[peer.rssd];
                if (!entry) return null;
                return getMetrics(entry, selectedQuarter)[metric.code] ?? null;
              });

              const validPeerVals = peerVals.filter((v): v is number => v !== null);
              const avg = validPeerVals.length > 0
                ? validPeerVals.reduce((s, v) => s + v, 0) / validPeerVals.length
                : null;

              let rankStr = "—";
              let subjectColorClass = "";
              if (subjectVal !== null) {
                const allVals = [subjectVal, ...validPeerVals];
                const sorted = [...allVals].sort((a, b) => metric.higherGood ? b - a : a - b);
                const rank = sorted.indexOf(subjectVal) + 1;
                const total = allVals.length;
                rankStr = `${rank} of ${total}`;
                const pct = rank / total;
                if (pct <= 0.33) subjectColorClass = "text-green-600 font-semibold";
                else if (pct >= 0.67) subjectColorClass = "text-red-500 font-semibold";
              }

              const isExpanded = expandedMetric === metric.code;

              const dataRow = (
                <TableRow
                  key={metric.code}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedMetric(isExpanded ? null : metric.code)}
                >
                  <TableCell className="font-medium text-xs py-2 px-4">
                    <span className="flex items-center gap-1.5">
                      <span className={`text-[9px] text-muted-foreground transition-transform inline-block ${isExpanded ? "rotate-90" : ""}`}>
                        ▶
                      </span>
                      {metric.label}
                    </span>
                  </TableCell>
                  <TableCell className={`text-right tabular-nums text-xs bg-primary/5 border-x border-primary/20 py-2 px-4 ${subjectColorClass}`}>
                    {subjectData === undefined ? <Shimmer /> : formatValue(subjectVal, metric.format)}
                  </TableCell>
                  {peerBanks.map(peer => {
                    const entry = peerDataMap[peer.rssd];
                    const loading = entry === undefined;
                    const peerVal = entry && entry.length > 0
                      ? (getMetrics(entry, selectedQuarter)[metric.code] ?? null)
                      : null;
                    return (
                      <TableCell key={peer.rssd} className="text-right tabular-nums text-xs py-2 px-4">
                        {loading
                          ? <Shimmer />
                          : peerVal === null
                            ? <span className="text-muted-foreground">—</span>
                            : formatValue(peerVal, metric.format)}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right tabular-nums text-xs bg-muted/30 font-medium border-l-2 border-border py-2 px-4">
                    {avg !== null ? formatValue(avg, metric.format) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs py-2 px-4 text-muted-foreground">
                    {rankStr}
                  </TableCell>
                </TableRow>
              );

              if (!isExpanded) return [dataRow];

              const expandedRow = (
                <TableRow key={`${metric.code}-chart`} className="bg-muted/20 hover:bg-muted/20">
                  <TableCell colSpan={totalCols} className="px-6 py-4 border-b">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                      {metric.label} — All Banks Ranked
                    </p>
                    <MetricBarChart
                      metric={metric}
                      subjectBank={subjectBank}
                      subjectMap={subjectMetricsMap}
                      peers={peerBanks}
                      peerDataMap={peerDataMap}
                      selectedQuarter={selectedQuarter}
                    />
                  </TableCell>
                </TableRow>
              );

              return [dataRow, expandedRow];
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default PeerComparison;
