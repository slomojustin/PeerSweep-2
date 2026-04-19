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
  selectedQuarters?: string[];
}

interface MetricDef {
  code: string;
  label: string;
  format: "ratio" | "dollar";
  higherGood: boolean;
}

const METRICS: MetricDef[] = [
  { code: "CALC_ROA",  label: "Return on Assets",      format: "ratio",  higherGood: true  },
  { code: "CALC_ROE",  label: "Return on Equity",       format: "ratio",  higherGood: true  },
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

function getLatestMetrics(quarters: QuarterData[]): Record<string, number | null> {
  return quarters[0]?.metrics ?? {};
}

const Shimmer = () => (
  <div className="animate-pulse bg-muted rounded h-4 w-12 ml-auto" />
);

// null  = fetched, no data / error
// undefined = not yet fetched (loading)
type PeerEntry = QuarterData[] | null | undefined;

const PeerComparison = ({ subjectBank, peerBanks }: PeerComparisonProps) => {
  const cache = useRef<Map<string, QuarterData[] | null>>(new Map());
  const [subjectData, setSubjectData] = useState<QuarterData[] | null | undefined>(undefined);
  const [peerDataMap, setPeerDataMap] = useState<Record<string, PeerEntry>>({});

  const peerRssdKey = useMemo(
    () => peerBanks.map(p => p.rssd).sort().join(","),
    [peerBanks],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      // ── Subject bank ──────────────────────────────────────────
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

      // ── Peers ─────────────────────────────────────────────────
      // Show cached peers immediately, mark uncached as loading
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
    }

    if (peerBanks.length > 0) {
      loadAll();
    }

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectBank.rssd, peerRssdKey]);

  const isLoadingAny =
    subjectData === undefined ||
    peerBanks.some(p => peerDataMap[p.rssd] === undefined);

  const subjectMetricsMap = subjectData ? getLatestMetrics(subjectData) : null;

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
    <div className="space-y-6 animate-fade-in">
      <div className="border-b-2 border-primary pb-3">
        <h3 className="font-display text-lg text-foreground">Peer Comparison</h3>
        <p className="text-sm text-muted-foreground">
          {subjectBank.name} vs. {peerBanks.length} peer{peerBanks.length !== 1 ? "s" : ""}
          {isLoadingAny && " — loading data…"}
        </p>
      </div>

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
            {METRICS.map((metric) => {
              const subjectVal = subjectMetricsMap
                ? (subjectMetricsMap[metric.code] ?? null)
                : null;

              const peerVals = peerBanks.map(peer => {
                const entry = peerDataMap[peer.rssd];
                if (!entry || entry === undefined) return null;
                return getLatestMetrics(entry)[metric.code] ?? null;
              });

              const validPeerVals = peerVals.filter(v => v !== null) as number[];
              const avg = validPeerVals.length > 0
                ? validPeerVals.reduce((s, v) => s + v, 0) / validPeerVals.length
                : null;

              // Rank subject among all (subject + peers with data)
              let rankStr = "—";
              let subjectColorClass = "";
              if (subjectVal !== null) {
                const allVals = [subjectVal, ...validPeerVals];
                const sorted = [...allVals].sort((a, b) =>
                  metric.higherGood ? b - a : a - b,
                );
                const rank = sorted.indexOf(subjectVal) + 1;
                const total = allVals.length;
                rankStr = `${rank} of ${total}`;
                const pct = rank / total;
                if (pct <= 0.33) subjectColorClass = "text-green-600 font-semibold";
                else if (pct >= 0.67) subjectColorClass = "text-red-500 font-semibold";
              }

              return (
                <TableRow key={metric.code}>
                  <TableCell className="font-medium text-xs py-2 px-4">{metric.label}</TableCell>
                  <TableCell
                    className={`text-right tabular-nums text-xs bg-primary/5 border-x border-primary/20 py-2 px-4 ${subjectColorClass}`}
                  >
                    {subjectData === undefined
                      ? <Shimmer />
                      : formatValue(subjectVal, metric.format)}
                  </TableCell>
                  {peerBanks.map(peer => {
                    const entry = peerDataMap[peer.rssd];
                    const loading = entry === undefined;
                    const peerVal = entry && entry.length > 0
                      ? (getLatestMetrics(entry)[metric.code] ?? null)
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
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default PeerComparison;
