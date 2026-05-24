import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { type BankInfo } from "@/data/bankData";
import { fetchUBPR } from "@/lib/api/ubpr";
import BankSelector from "@/components/BankSelector";
import UBPRReport from "@/components/UBPRReport";
import AINarrativePanel from "@/components/AINarrativePanel";
import PeerComparison from "@/components/PeerComparison";
import type { QuarterData } from "@/lib/api/ubprPdf";

import MarketResearch from "@/components/MarketResearch";
import EmailCaptureBar from "@/components/EmailCaptureBar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Brain, Users, Globe, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { BankMetrics } from "@/data/bankData";
import type { MarketIntelData } from "@/lib/api/marketIntel";

const DEMO_SUBJECT_BANK: BankInfo = { rssd: "962966", name: "SOFI BANK, NATIONAL ASSOCIATION", city: "Cottonwood Heights", state: "UT" };

const DEMO_PEER_BANK: BankInfo = { rssd: "2917317", name: "AXOS BANK", city: "San Diego", state: "CA" };

const Index = () => {
  const [subjectBank, setSubjectBank] = useState<BankInfo[]>([]);
  const [peerBanks, setPeerBanks] = useState<BankInfo[]>([]);
  const [showDashboard, setShowDashboard] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [metrics, setMetrics] = useState<BankMetrics[]>([]);
  const [dataSource, setDataSource] = useState<"live" | "cache" | "mock" | null>(null);
  const [isUbprLoading, setIsUbprLoading] = useState(false);
  const [ubprError, setUbprError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [activeTab, setActiveTab] = useState("ubpr");
  const [marketIntelData, setMarketIntelData] = useState<MarketIntelData | null>(null);
  const [isMarketIntelLoading, setIsMarketIntelLoading] = useState(false);
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null);
  const [availableQuarters, setAvailableQuarters] = useState<string[]>([]);
  const [peerLoadedData, setPeerLoadedData] = useState<{
    subject: QuarterData[] | null;
    peers: Map<string, QuarterData[] | null>;
  } | null>(null);
  const [showEmailBanner, setShowEmailBanner] = useState(false);
  const emailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  function toQuarterLabel(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    const m = d.getMonth();
    const q = m < 3 ? "Q1" : m < 6 ? "Q2" : m < 9 ? "Q3" : "Q4";
    return `${q} ${d.getFullYear()}`;
  }

  function handleQuartersLoaded(dates: string[]) {
    setAvailableQuarters(dates);
    setSelectedQuarter(prev => prev ?? dates[0] ?? null);
  }

  const selectedBank = subjectBank[0];

  const handleNavigate = async (tab: string) => {
    if (!selectedBank) return;

    setActiveTab(tab);
    setShowDashboard(true);

    // TEMP: UBPR fetch disabled for testing — re-enable when needed
    // setUbprError(null);
    // setStatusMessage(null);
    // setIsUbprLoading(true);
    // try {
    //   const result = await fetchUBPR(selectedBank.rssd, selectedBank.name, setStatusMessage);
    //   setMetrics(result.metrics);
    //   setDataSource(result.source);
    //   setAnalysisReady(true);
    // } catch (error) {
    //   console.error('UBPR fetch failed:', error);
    //   setUbprError(error instanceof Error ? error.message : 'Failed to load UBPR data');
    //   setMetrics([]);
    //   setDataSource('mock');
    // } finally {
    //   setIsUbprLoading(false);
    //   setStatusMessage(null);
    // }
  };

  useEffect(() => {
    if (!showDashboard || activeTab === "ubpr") return;
    if (localStorage.getItem("ps_email_captured")) return;
    emailTimerRef.current = setTimeout(() => setShowEmailBanner(true), 20_000);
    return () => { if (emailTimerRef.current) clearTimeout(emailTimerRef.current); };
  }, [showDashboard, activeTab]);

  if (showDashboard && selectedBank) {
    return (
      <div className="min-h-screen bg-background">
        {/* Dashboard Header */}
        <header className="border-b sticky top-0 z-10 bg-primary shadow-sm">
          <div className="container flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <button onClick={() => setShowDashboard(false)} className="cursor-pointer hover:opacity-80 transition-opacity tracking-[0.18em] font-bold uppercase text-accent text-sm">
                PeerSweep
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-white/10 border border-white/20 rounded-full px-2.5 py-0.5 text-primary-foreground font-semibold hidden sm:block">🏦 {selectedBank.name}</span>
              {[selectedBank.city, selectedBank.state].filter(Boolean).length > 0 && (
                <span className="text-xs bg-white/10 border border-white/20 rounded-full px-2.5 py-0.5 text-primary-foreground/70 hidden md:block">
                  📍 {[selectedBank.city, selectedBank.state].filter(Boolean).join(', ')}
                </span>
              )}
              <span className="text-xs bg-white/10 border border-white/20 rounded-full px-2.5 py-0.5 text-primary-foreground/70 hidden md:block">
                RSSD {selectedBank.rssd}
              </span>
              {peerBanks[0] && (
                <span className="text-xs bg-white/10 border border-white/20 rounded-full px-2.5 py-0.5 text-primary-foreground/70 hidden md:block">
                  👥 vs. {peerBanks[0].name}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={() => setShowDashboard(false)} className="ml-2 border-white/30 text-primary-foreground bg-transparent hover:bg-white/10 hover:text-primary-foreground">
                Change Bank
              </Button>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="container py-6">
          {isUbprLoading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
              <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              {statusMessage ?? "Loading UBPR data…"}
            </div>
          )}
          {ubprError && !isUbprLoading && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
              {ubprError}
            </div>
          )}
          {availableQuarters.length > 1 && (activeTab === "ubpr" || activeTab === "peers") && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-muted-foreground font-medium">Period:</span>
              {activeTab === "ubpr" && (
                <button
                  onClick={() => setSelectedQuarter(null)}
                  className={cn(
                    "text-xs rounded-full px-3 py-1 border font-medium transition-colors",
                    selectedQuarter === null
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                  )}
                >
                  All
                </button>
              )}
              {availableQuarters.map(date => (
                <button
                  key={date}
                  onClick={() => setSelectedQuarter(date)}
                  className={cn(
                    "text-xs rounded-full px-3 py-1 border font-medium transition-colors",
                    selectedQuarter === date
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                  )}
                >
                  {toQuarterLabel(date)}
                </button>
              ))}
            </div>
          )}

          {showEmailBanner && (
            <EmailCaptureBar
              source="dashboard"
              bankRssd={selectedBank.rssd}
              onDismiss={() => {
                setShowEmailBanner(false);
                localStorage.setItem("ps_email_captured", "true");
              }}
            />
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="bg-card rounded-2xl shadow-md border overflow-hidden">
              <TabsList className="grid w-full grid-cols-4 h-14 rounded-none p-2 bg-muted/40 gap-1 border-b">
                <TabsTrigger value="ubpr" className="gap-2 text-sm font-medium rounded-lg data-[state=active]:shadow-md data-[state=active]:bg-card transition-all">
                  <FileText className="h-4 w-4" />
                  FFIEC Reports
                  {isUbprLoading && (
                    <span className="ml-1 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  )}
                  {!isUbprLoading && metrics.length > 0 && (
                    <span className="ml-1 h-2 w-2 rounded-full bg-green-500" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="insights" className="gap-2 text-sm font-medium rounded-lg data-[state=active]:shadow-md data-[state=active]:bg-card transition-all">
                  <Brain className="h-4 w-4" />
                  AI Insights
                  {analysisReady && (
                    <span className="ml-1 h-2 w-2 rounded-full bg-green-500" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="peers" className="gap-2 text-sm font-medium rounded-lg data-[state=active]:shadow-md data-[state=active]:bg-card transition-all">
                  <Users className="h-4 w-4" />
                  Peer Bank Analysis
                  {metrics.length > 0 && (
                    <span className="ml-1 h-2 w-2 rounded-full bg-green-500" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="market" className="gap-2 text-sm font-medium rounded-lg data-[state=active]:shadow-md data-[state=active]:bg-card transition-all">
                  <Globe className="h-4 w-4" />
                  Market Intel
                  {isMarketIntelLoading && (
                    <span className="ml-1 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  )}
                  {!isMarketIntelLoading && marketIntelData && (
                    <span className="ml-1 h-2 w-2 rounded-full bg-green-500" />
                  )}
                </TabsTrigger>
              </TabsList>

              <div className="p-6 min-h-[520px]">
                <TabsContent value="ubpr" forceMount className="data-[state=inactive]:sr-only mt-0">
                  <UBPRReport
                    bankName={selectedBank.name}
                    rssd={selectedBank.rssd}
                    selectedQuarter={selectedQuarter}
                    onQuartersLoaded={handleQuartersLoaded}
                  />
                </TabsContent>

                <TabsContent value="insights" forceMount className="data-[state=inactive]:sr-only mt-0">
                  <AINarrativePanel
                    bankName={selectedBank.name}
                    rssd={selectedBank.rssd}
                    peerBanks={peerBanks}
                    peerLoadedData={peerLoadedData}
                    marketIntelData={marketIntelData}
                    selectedQuarter={selectedQuarter}
                  />
                </TabsContent>

                <TabsContent value="peers" forceMount className="data-[state=inactive]:sr-only mt-0">
                  <PeerComparison
                    subjectBank={selectedBank}
                    subjectMetrics={metrics}
                    peerBanks={peerBanks}
                    selectedQuarter={selectedQuarter}
                    onPeerDataLoaded={(subject, peers) => setPeerLoadedData({ subject, peers })}
                  />
                </TabsContent>

                <TabsContent value="market" forceMount className="data-[state=inactive]:sr-only mt-0">
                  <MarketResearch bank={selectedBank} peerBanks={peerBanks} cachedData={marketIntelData} onDataLoaded={setMarketIntelData} onLoadingChange={setIsMarketIntelLoading} />
                </TabsContent>
              </div>
            </div>
          </Tabs>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex items-center justify-center">
        <div className="container max-w-2xl py-16">
          <div className="text-center mb-12 animate-fade-in">
              <h1 className="tracking-[0.18em] font-bold uppercase text-accent text-4xl md:text-5xl mb-1">
                PeerSweep
              </h1>
              <p className="text-accent font-semibold tracking-wide uppercase text-sm">
                Actionable Market Intel — Fast.
              </p>
            </div>

          <div className="bg-card rounded-2xl shadow-md border p-6 space-y-5 animate-fade-in" style={{ animationDelay: "0.15s" }}>
            <BankSelector
              label="Subject Bank"
              description="Select the bank to analyze"
              selected={subjectBank}
              onSelect={setSubjectBank}
            />

            <BankSelector
              label="Peer Bank"
              description="Select one bank to compare against"
              selected={peerBanks}
              onSelect={setPeerBanks}
            />
            <div className="flex items-center gap-2 mt-1">
              <p className={cn("text-xs", peerBanks.length >= 1 ? "text-green-600" : "text-yellow-600")}>
                {peerBanks.length >= 1 ? "Peer bank selected ✓" : "Select a peer bank to continue"}
              </p>
              <button
                onClick={() => { setSubjectBank([DEMO_SUBJECT_BANK]); setPeerBanks([DEMO_PEER_BANK]); }}
                className="text-xs text-accent underline hover:text-accent/80 font-medium transition-colors"
              >
                load demo preset
              </button>
            </div>

          </div>

          <div className="mt-6 grid grid-cols-4 gap-3 text-center animate-fade-in" style={{ animationDelay: "0.15s" }}>
            {[
              { icon: BarChart3, label: "Subject Bank\nFFIEC Report", tab: "ubpr" },
              { icon: Brain, label: "Detailed\nAnalysis", tab: "insights" },
              { icon: Users, label: "Peer Bank\nAnalysis", tab: "peers" },
              { icon: Globe, label: "Current Market\nIntelligence", tab: "market" },
            ].map(({ icon: Icon, label, tab }) => (
              <button
                key={label}
                disabled={!selectedBank || isUbprLoading || peerBanks.length < 1}
                onClick={() => handleNavigate(tab)}
                className={cn(
                  "p-3 rounded-lg transition-all",
                  selectedBank && !isUbprLoading && (peerBanks.length >= 1)
                    ? "bg-accent/15 border-2 border-accent text-accent cursor-pointer hover:bg-accent/25 hover:scale-105"
                    : "bg-muted/50 text-muted-foreground cursor-default"
                )}
              >
                <Icon className={cn("h-5 w-5 mx-auto mb-1.5", selectedBank && !isUbprLoading && (peerBanks.length >= 1) ? "text-accent" : "text-primary/70")} />
                <p className="text-xs font-medium whitespace-pre-line">{label}</p>
              </button>
            ))}
          </div>

          <div className="mt-4 animate-fade-in" style={{ animationDelay: "0.25s" }}>
            <EmailCaptureBar source="landing" />
          </div>

        </div>
      </div>

      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        Data sourced from FFIEC CDR • AI-powered analysis • Not a substitute for regulatory examination
      </footer>
    </div>
  );
};

export default Index;
