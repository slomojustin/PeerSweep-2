import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Globe, ExternalLink, Loader2, Landmark, Newspaper, Share2, ChevronDown, ChevronUp, X, TrendingUp, ChevronsDown, ChevronsUp, XCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { fetchMarketIntel, type MarketIntelData, type AgentStreamInfo } from "@/lib/api/marketIntel";
import { cancelAgentRuns } from "@/lib/api/cancelMarketIntel";
import type { BankInfo } from "@/data/bankData";

interface MarketResearchProps {
  bank: BankInfo;
  peerBanks: BankInfo[];
  cachedData?: MarketIntelData | null;
  onDataLoaded?: (data: MarketIntelData) => void;
  onLoadingChange?: (loading: boolean) => void;
}

type AgentStreamEntry = AgentStreamInfo & {
  status: 'pending' | 'running' | 'done' | 'error' | 'cancelled';
  result?: MarketIntelData;
  errorMsg?: string;
};

const TinyFishBadge = () => (
  <a
    href="https://tinyfish.ai"
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-2 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl px-4 py-2 hover:from-orange-100 hover:to-amber-100 hover:border-orange-300 transition-all shadow-sm group"
  >
    <img src="/tinyfish-logo.png" alt="TinyFish" className="h-7 w-7 object-contain group-hover:scale-110 transition-transform" />
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] text-orange-400 font-medium uppercase tracking-widest">Powered by</span>
      <span className="text-sm font-bold text-orange-600">TinyFish</span>
    </div>
  </a>
);

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   cls: 'bg-muted text-muted-foreground' },
  running:   { label: 'Running',   cls: 'bg-blue-500/10 text-blue-600' },
  done:      { label: 'Done ✓',    cls: 'bg-green-500/10 text-green-600' },
  error:     { label: 'Error',     cls: 'bg-red-500/10 text-red-500' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-500/10 text-red-500' },
};

const BankResultsView = ({ result, bankName }: { result: MarketIntelData; bankName: string }) => {
  const rates = result.peerBankRates?.filter(r => r.bankName === bankName) ?? [];
  const news = result.localNews?.filter(n => !n.bankName || n.bankName === bankName) ?? [];
  const social = result.socialMedia?.filter(s => s.bankName === bankName) ?? [];

  if (!rates.length && !news.length && !social.length) {
    return <p className="px-4 py-4 text-sm text-muted-foreground italic">No data returned for this bank.</p>;
  }

  const maxRate = rates.length ? Math.max(...rates.map(r => r.rate)) : 0;

  return (
    <div className="divide-y divide-border">

      {/* ── Advertised Rates ── blue tint */}
      {rates.length > 0 && (
        <div className="bg-blue-50/60 px-4 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-blue-600 shrink-0" />
            <h4 className="text-sm font-bold text-blue-900 tracking-tight">Advertised Rates</h4>
            <span className="text-xs text-blue-500">({rates.length} products)</span>
          </div>
          <div className="rounded-lg border border-blue-200 overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-blue-100/80">
                  <TableHead className="text-xs font-semibold text-blue-800 h-8 py-2 pl-3">Product</TableHead>
                  <TableHead className="text-xs text-right font-semibold text-blue-800 h-8 py-2">APY</TableHead>
                  <TableHead className="text-xs font-semibold text-blue-800 h-8 py-2 pr-3">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((r, i) => {
                  const isBest = r.rate === maxRate && maxRate > 0;
                  const sourceUrl = r.source.startsWith('http') ? r.source : `https://${r.source}`;
                  return (
                    <TableRow
                      key={i}
                      onClick={() => window.open(sourceUrl, '_blank', 'noopener,noreferrer')}
                      className={cn(
                        'cursor-pointer transition-colors',
                        isBest ? 'bg-accent/8 hover:bg-accent/15' : 'hover:bg-blue-100/60',
                      )}
                    >
                      <TableCell className="text-sm text-foreground font-medium py-2.5 pl-3">
                        <div className="flex items-center gap-2">
                          {r.product}
                          {isBest && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent text-white shrink-0">
                              Best
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={cn(
                        'text-sm text-right tabular-nums font-bold py-2.5',
                        isBest ? 'text-accent' : 'text-foreground',
                      )}>
                        {r.rate}%
                      </TableCell>
                      <TableCell className="py-2.5 pr-3">
                        <span className="text-xs text-blue-600 flex items-center gap-1 font-medium group-hover:underline">
                          {r.source}
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ── Local News ── amber tint, whole card clickable */}
      {news.length > 0 && (
        <div className="bg-amber-50/60 px-4 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-amber-600 shrink-0" />
            <h4 className="text-sm font-bold text-amber-900 tracking-tight">Local News</h4>
            <span className="text-xs text-amber-500">({news.length} articles)</span>
          </div>
          <div className="space-y-2">
            {news.map((item, i) => (
              item.url ? (
                <a
                  key={i}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-amber-200 border-l-[3px] border-l-amber-500 bg-white/70 p-3 space-y-1.5 hover:bg-amber-50 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <p className="text-sm font-semibold leading-snug text-amber-900 group-hover:text-amber-700">{item.headline}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.summary}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">{item.source}</span>
                    {item.date && <span className="text-xs text-muted-foreground">{item.date}</span>}
                    <ExternalLink className="h-3 w-3 text-amber-400 ml-auto shrink-0" />
                  </div>
                </a>
              ) : (
                <div key={i} className="rounded-lg border border-amber-200 border-l-[3px] border-l-amber-500 bg-white/70 p-3 space-y-1.5">
                  <p className="text-sm font-semibold leading-snug text-amber-900">{item.headline}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.summary}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">{item.source}</span>
                    {item.date && <span className="text-xs text-muted-foreground">{item.date}</span>}
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {/* ── Social & Marketing ── violet tint, whole card clickable */}
      {social.length > 0 && (
        <div className="bg-violet-50/60 px-4 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-violet-600 shrink-0" />
            <h4 className="text-sm font-bold text-violet-900 tracking-tight">Social & Marketing</h4>
            <span className="text-xs text-violet-400">({social.length} platforms)</span>
          </div>
          <div className="grid gap-2">
            {social.map((s, i) => {
              const inner = (
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-violet-800">{s.platform}</span>
                      {s.profileUrl && <ExternalLink className="h-3 w-3 text-violet-400 shrink-0" />}
                    </div>
                    {s.recentPromo && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{s.recentPromo}</p>
                    )}
                    {s.lastPostDate && (
                      <p className="text-xs text-violet-400">Last post: {s.lastPostDate}</p>
                    )}
                  </div>
                  {s.followers != null && (
                    <div className="shrink-0 text-right">
                      <p className="text-base font-bold text-violet-700 tabular-nums">{s.followers.toLocaleString()}</p>
                      <p className="text-xs text-violet-400">followers</p>
                    </div>
                  )}
                </div>
              );
              return s.profileUrl ? (
                <a
                  key={i}
                  href={s.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-violet-200 bg-white/70 p-3 hover:bg-violet-50 hover:shadow-sm transition-all cursor-pointer"
                >
                  {inner}
                </a>
              ) : (
                <div key={i} className="rounded-lg border border-violet-200 bg-white/70 p-3">
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const QuickCompareBar = ({ streams }: { streams: AgentStreamEntry[] }) => {
  const banksWithRates = streams
    .filter(s => s.result?.peerBankRates?.length)
    .map(s => {
      const rates = s.result!.peerBankRates!;
      const bestRate = Math.max(...rates.map(r => r.rate));
      const bestProduct = rates.find(r => r.rate === bestRate);
      return { bankName: s.bankName, bestRate, product: bestProduct?.product ?? '' };
    })
    .sort((a, b) => b.bestRate - a.bestRate);

  if (!banksWithRates.length) return null;

  return (
    <div className="rounded-lg border bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary">Quick Compare — Best Rates</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {banksWithRates.map((b, i) => (
          <div key={i} className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
            {i === 0 && <span className="text-xs">🏆</span>}
            <span className="text-xs font-medium truncate max-w-[120px]">{b.bankName}</span>
            <span className="text-xs font-bold text-accent tabular-nums">{b.bestRate}%</span>
            <span className="text-xs text-muted-foreground">{b.product}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const AgentStreamPanel = ({
  stream,
  index,
  isExpanded,
  onToggle,
  onCancel,
}: {
  stream: AgentStreamEntry;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onCancel: () => void;
}) => {
  const panelId = `agent-stream-${index}`;
  const statusCfg = STATUS_CONFIG[stream.status];

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        aria-expanded={isExpanded}
        aria-controls={panelId}
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{stream.bankName}</span>
          <span className={cn('shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium', statusCfg.cls)}>
            {statusCfg.label}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {stream.status !== 'cancelled' && stream.status !== 'done' && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(); }}
              className="text-muted-foreground hover:text-red-500 transition-colors p-0.5 rounded"
              aria-label={`Cancel extraction for ${stream.bankName}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <ChevronDown className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform',
            isExpanded && 'rotate-180',
          )} />
        </div>
      </button>

      {isExpanded && (
        <div id={panelId} className="border-t bg-muted/20">
          {stream.status === 'cancelled' && (
            <p className="px-3 py-2 text-xs text-red-500">Extraction cancelled.</p>
          )}
          {stream.status === 'error' && (
            <p className="px-3 py-2 text-xs text-red-500">{stream.errorMsg ?? 'Agent error.'}</p>
          )}
          {stream.status === 'done' && stream.result && (
            <BankResultsView result={stream.result} bankName={stream.bankName} />
          )}
          {stream.status === 'done' && !stream.result && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No data returned.</p>
          )}
          {(stream.status === 'running' || stream.status === 'pending') && (
            stream.streamingUrl ? (
              <iframe
                src={stream.streamingUrl}
                title={`Live extraction — ${stream.bankName}`}
                className="w-full h-48 border-0"
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <p className="px-3 py-2 text-xs text-muted-foreground">Waiting for agent to start…</p>
            )
          )}
        </div>
      )}
    </div>
  );
};

// Flat results view for cached data
const FlatResultsView = ({
  data,
  onRefresh,
  onRunLive,
  isLoading,
}: {
  data: MarketIntelData;
  onRefresh: () => void;
  onRunLive: () => void;
  isLoading: boolean;
}) => (
  <div className="space-y-8">
    {data.peerBankRates && data.peerBankRates.length > 0 && (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-accent" />
          <h4 className="font-semibold text-sm">Peer Bank Advertised Rates</h4>
        </div>
        <Card className="overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/5">
                <TableHead className="font-semibold">Bank</TableHead>
                <TableHead className="font-semibold">Product</TableHead>
                <TableHead className="text-right font-semibold">APY (%)</TableHead>
                <TableHead className="font-semibold">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.peerBankRates.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-sm">{r.bankName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.product}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-accent">{r.rate}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">{r.source} <ExternalLink className="h-3 w-3" /></span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    )}

    {data.localNews && data.localNews.length > 0 && (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-accent" />
          <h4 className="font-semibold text-sm">Local News & Market Coverage</h4>
        </div>
        <div className="space-y-2">
          {data.localNews.map((item, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <h5 className="text-sm font-medium leading-tight">
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">
                        {item.headline}
                      </a>
                    ) : item.headline}
                  </h5>
                  <p className="text-xs text-muted-foreground">{item.summary}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium">{item.source}</span>
                    {item.date && <span>• {item.date}</span>}
                  </div>
                </div>
                {item.url && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>
    )}

    {data.socialMedia && data.socialMedia.length > 0 && (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Share2 className="h-4 w-4 text-accent" />
          <h4 className="font-semibold text-sm">Social Media & Marketing Activity</h4>
        </div>
        <Card className="overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/5">
                <TableHead className="font-semibold">Bank</TableHead>
                <TableHead className="font-semibold">Platform</TableHead>
                <TableHead className="text-right font-semibold">Followers</TableHead>
                <TableHead className="font-semibold">Recent Promotion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.socialMedia.map((s, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-sm">{s.bankName}</TableCell>
                  <TableCell className="text-sm">
                    {s.profileUrl ? (
                      <a href={s.profileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                        {s.platform} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : s.platform}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {s.followers != null ? s.followers.toLocaleString() : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {s.recentPromo || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    )}

    <div className="text-center pt-2 space-y-3">
      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading} className="gap-2">
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
          Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={onRunLive} disabled={isLoading} className="gap-2 border-accent/40 text-accent hover:bg-accent/10">
          <RefreshCw className="h-3 w-3" />
          Run Live
        </Button>
      </div>
      <div className="flex justify-center"><TinyFishBadge /></div>
    </div>
  </div>
);

const MarketResearch = ({ bank, peerBanks, cachedData, onDataLoaded, onLoadingChange }: MarketResearchProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const setIsLoadingWithCallback = (v: boolean) => { setIsLoading(v); onLoadingChange?.(v); };
  const [cachedResult, setCachedResult] = useState<MarketIntelData | null>(cachedData ?? null);
  const [agentStreams, setAgentStreams] = useState<AgentStreamEntry[]>([]);
  const [expandedPanels, setExpandedPanels] = useState<Set<number>>(new Set());
  const [agentCount, setAgentCount] = useState<number>(peerBanks.length);
  const { toast } = useToast();
  const abortControllerRef = useRef<AbortController | null>(null);
  const runIdsRef = useRef<string[]>([]);
  const jobIdRef = useRef<string | null>(null);

  const togglePanel = (i: number) =>
    setExpandedPanels(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });

  const expandAll = () => setExpandedPanels(new Set(agentStreams.map((_, i) => i)));
  const collapseAll = () => setExpandedPanels(new Set());

  const handleCancelAll = () => {
    cancelAgentRuns(runIdsRef.current, jobIdRef.current ?? undefined);
    abortControllerRef.current?.abort();
    runIdsRef.current = [];
    jobIdRef.current = null;
    setIsLoadingWithCallback(false);
    setAgentStreams(prev => prev.map(s =>
      s.status === 'pending' || s.status === 'running'
        ? { ...s, status: 'cancelled', streamingUrl: null }
        : s
    ));
  };

  const handleCancelOne = (index: number) => {
    setAgentStreams(prev =>
      prev.map((s, i) => i === index ? { ...s, status: 'cancelled', streamingUrl: null } : s)
    );
  };

  const handleFetch = async (bypassCache = false) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoadingWithCallback(true);
    setCachedResult(null);
    setExpandedPanels(new Set());
    const count = Math.min(Math.max(1, agentCount), peerBanks.length);
    const shuffled = [...peerBanks].sort(() => Math.random() - 0.5);
    const activePeers = count >= peerBanks.length ? peerBanks : shuffled.slice(0, count);
    // Initialise all as pending
    setAgentStreams(activePeers.map(p => ({
      bankName: p.name,
      streamingUrl: null,
      status: 'pending',
    })));

    try {
      const result = await fetchMarketIntel(
        bank,
        activePeers,
        () => {},
        (streams) => {
          // Merge incoming streamingUrl updates without clobbering status/result
          setAgentStreams(prev => streams.map((s, i) => ({
            ...prev[i],
            ...s,
            status: (prev[i]?.status === 'pending' && s.streamingUrl)
              ? 'running'
              : prev[i]?.status ?? 'pending',
          })));
        },
        controller.signal,
        (ids) => { runIdsRef.current = ids; },
        (id) => { jobIdRef.current = id; },
        (index, bankResult) => {
          setAgentStreams(prev => prev.map((s, i) =>
            i === index ? { ...s, status: 'done', result: bankResult, streamingUrl: null } : s
          ));
          // Auto-expand the panel when its results arrive
          setExpandedPanels(prev => new Set([...prev, index]));
        },
        bypassCache,
      );
      // Mark any still-running agents done; split merged result by bank name
      setAgentStreams(prev => prev.map(s => {
        if (s.status !== 'running' && s.status !== 'pending') return s;
        const bankResult: MarketIntelData = {
          peerBankRates: result.peerBankRates?.filter(r => r.bankName === s.bankName) ?? [],
          localNews: result.localNews?.filter(n => !n.bankName || n.bankName === s.bankName) ?? [],
          socialMedia: result.socialMedia?.filter(sm => sm.bankName === s.bankName) ?? [],
        };
        return { ...s, status: 'done', result: s.result ?? bankResult };
      }));
      // Auto-expand panels that just got results from the polling fallback
      setExpandedPanels(prev => {
        const next = new Set(prev);
        agentStreams.forEach((s, i) => {
          if (s.status === 'running' || s.status === 'pending') next.add(i);
        });
        return next;
      });
      onDataLoaded?.(result);
      toast({ title: "Market Intel Retrieved", description: "Live market data loaded successfully." });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled — panels already marked by handleCancelAll
      } else {
        console.error("Market intel error:", err);
        toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to fetch market intel", variant: "destructive" });
      }
    } finally {
      runIdsRef.current = [];
      jobIdRef.current = null;
      setIsLoadingWithCallback(false);
    }
  };

  const showAgentView = agentStreams.length > 0;
  const doneCount = agentStreams.filter(s => s.status === 'done').length;
  const allCancelledOrError = agentStreams.length > 0 && !isLoading && agentStreams.every(s => s.status === 'cancelled' || s.status === 'error');

  const handleRestart = () => {
    setAgentStreams([]);
    setExpandedPanels(new Set());
    runIdsRef.current = [];
    jobIdRef.current = null;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="border-b-2 border-primary pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <h3 className="font-display text-lg text-foreground">Market Research</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 border border-black rounded-lg px-2.5 py-1 bg-background">
              <span className="text-xs font-medium text-muted-foreground">Agents:</span>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={agentCount === 0 ? '' : agentCount}
                  onKeyDown={e => {
                    if (e.key === 'Backspace') { e.preventDefault(); setAgentCount(0); return; }
                    const n = parseInt(e.key);
                    if (!isNaN(n) && n >= 1 && n <= peerBanks.length) { e.preventDefault(); setAgentCount(n); }
                    else if (isNaN(n) && e.key.length === 1) e.preventDefault();
                  }}
                  onBlur={() => { if (agentCount === 0) setAgentCount(1); }}
                  disabled={isLoading}
                  readOnly
                  className="w-5 text-center text-sm font-bold border-0 bg-transparent text-foreground focus:outline-none disabled:opacity-50 caret-transparent"
                />
                <div className="flex flex-col gap-px">
                  <button
                    onClick={() => setAgentCount(c => Math.min(peerBanks.length, c + 1))}
                    disabled={isLoading || agentCount >= peerBanks.length}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 leading-none"
                  ><ChevronUp className="h-3 w-3" /></button>
                  <button
                    onClick={() => setAgentCount(c => Math.max(1, c - 1))}
                    disabled={isLoading || agentCount <= 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 leading-none"
                  ><ChevronDown className="h-3 w-3" /></button>
                </div>
              </div>
              <span className="text-xs text-muted-foreground/60">/ {peerBanks.length}</span>
            </div>
            <TinyFishBadge />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Competitive intelligence for {bank.name}</p>
      </div>

      {/* Initial fetch card */}
      {!showAgentView && !cachedResult && (
        <Card className="p-6 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Scrape peer bank websites for deposit rates, search local news coverage, and scan social media for competitor marketing activity.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={() => handleFetch(false)} disabled={isLoading} className="gap-2">
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Gathering Market Intel…</>
              ) : (
                <><Globe className="h-4 w-4" />Retrieve Market Intel</>
              )}
            </Button>
            <Button onClick={() => handleFetch(true)} disabled={isLoading} variant="outline" className="gap-2 border-accent/40 text-accent hover:bg-accent/10">
              <RefreshCw className="h-4 w-4" />
              Run Live
            </Button>
          </div>
        </Card>
      )}

      {/* Per-agent panels view (live fetch) */}
      {showAgentView && (
        <div className="space-y-4">
          <QuickCompareBar streams={agentStreams} />

          {isLoading && (
            <div className="space-y-2">
              <div className="relative h-3 w-full rounded-full bg-muted overflow-visible">
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-primary"
                  style={{ animation: 'swim 90s ease-in-out forwards' }}
                >
                  <img
                    src="/tinyfish-logo.png"
                    alt="TinyFish extracting data"
                    className="absolute right-0 top-1/2 h-7 w-7 object-contain -translate-y-1/2 translate-x-1/2"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                TinyFish is researching {agentStreams.length} peer bank{agentStreams.length !== 1 ? 's' : ''} in parallel…
              </p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium">
                {doneCount} of {agentStreams.length} complete
              </p>
              <div className="flex items-center gap-1.5">
                <button onClick={expandAll} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border border-border hover:bg-muted transition-colors">
                  <ChevronsDown className="h-3.5 w-3.5" />
                  Expand all
                </button>
                <button onClick={collapseAll} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border border-border hover:bg-muted transition-colors">
                  <ChevronsUp className="h-3.5 w-3.5" />
                  Collapse all
                </button>
                {isLoading && (
                  <button onClick={handleCancelAll} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border border-red-300 text-red-500 hover:bg-red-50 transition-colors">
                    <XCircle className="h-3.5 w-3.5" />
                    Cancel all
                  </button>
                )}
                {allCancelledOrError && (
                  <button onClick={handleRestart} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border border-primary text-primary hover:bg-primary/10 transition-colors">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Run again
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              {agentStreams.map((stream, i) => (
                <AgentStreamPanel
                  key={i}
                  stream={stream}
                  index={i}
                  isExpanded={expandedPanels.has(i)}
                  onToggle={() => togglePanel(i)}
                  onCancel={() => handleCancelOne(i)}
                />
              ))}
            </div>
          </div>

          {!isLoading && (
            <div className="text-center pt-2 space-y-3">
              <Button variant="outline" size="sm" onClick={handleFetch} className="gap-2">
                <Globe className="h-3 w-3" />
                Run Again
              </Button>
              <div className="flex justify-center"><TinyFishBadge /></div>
            </div>
          )}
        </div>
      )}

      {/* Flat cached results view */}
      {cachedResult && !showAgentView && (
        <FlatResultsView data={cachedResult} onRefresh={() => handleFetch(false)} onRunLive={() => handleFetch(true)} isLoading={isLoading} />
      )}
    </div>
  );
};

export default MarketResearch;
