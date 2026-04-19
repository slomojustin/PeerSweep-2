import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, Loader2, Send, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchUBPRData, type QuarterData } from "@/lib/api/ubprPdf";
import { buildQueryContext } from "@/lib/buildQueryContext";
import type { MarketIntelData } from "@/lib/api/marketIntel";
import type { BankInfo } from "@/data/bankData";

interface AINarrativePanelProps {
  bankName: string;
  rssd: string;
  peerBanks: BankInfo[];
  peerLoadedData: { subject: QuarterData[] | null; peers: Map<string, QuarterData[] | null> } | null;
  marketIntelData: MarketIntelData | null;
  selectedQuarter: string | null;
}

const SUGGESTED_QUESTIONS = [
  "What is this bank's deposit pricing strategy based on the data?",
  "How does this bank compare to its peers on profitability?",
  "What are the biggest competitive risks facing this bank?",
  "Summarize the key strengths and weaknesses of this bank.",
];

interface DataSource {
  label: string;
  ready: boolean;
  hint: string;
}

const AINarrativePanel = ({
  bankName,
  rssd,
  peerBanks,
  peerLoadedData,
  marketIntelData,
  selectedQuarter,
}: AINarrativePanelProps) => {
  const [subjectQuarters, setSubjectQuarters] = useState<QuarterData[] | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  const [newDataSources, setNewDataSources] = useState<string[]>([]);

  const answerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevPeerData = useRef(peerLoadedData);
  const prevMarketData = useRef(marketIntelData);

  // Fetch subject UBPR data on mount (or when bank changes)
  useEffect(() => {
    setIsDataLoading(true);
    setDataError(null);
    setSubjectQuarters(null);
    setAnswer(null);
    setQueryError(null);
    setQuestion("");

    fetchUBPRData(rssd)
      .then(setSubjectQuarters)
      .catch(err => setDataError(err.message))
      .finally(() => setIsDataLoading(false));
  }, [rssd]);

  // Scroll to answer when it arrives
  useEffect(() => {
    if (answer) {
      answerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [answer]);

  // Detect when peer or market intel data arrives after an answer is already shown
  useEffect(() => {
    if (!answer) {
      prevPeerData.current = peerLoadedData;
      prevMarketData.current = marketIntelData;
      return;
    }
    const arrived: string[] = [];
    if (!prevPeerData.current && peerLoadedData) arrived.push("Peer Analysis");
    if (!prevMarketData.current && marketIntelData) arrived.push("Market Intel");
    if (arrived.length > 0) setNewDataSources(arrived);
    prevPeerData.current = peerLoadedData;
    prevMarketData.current = marketIntelData;
  }, [peerLoadedData, marketIntelData, answer]);

  const dataSources: DataSource[] = [
    {
      label: "FFIEC",
      ready: !isDataLoading && subjectQuarters !== null,
      hint: isDataLoading ? "Loading…" : subjectQuarters ? "Loaded" : "Failed to load",
    },
    {
      label: "Peers",
      ready: peerLoadedData !== null,
      hint: peerLoadedData ? `${peerBanks.length} peers loaded` : "Visit Peer Analysis tab",
    },
    {
      label: "Market Intel",
      ready: marketIntelData !== null,
      hint: marketIntelData ? "Loaded" : "Visit Market Intel tab",
    },
  ];

  const canQuery = !isDataLoading && subjectQuarters !== null && question.trim().length > 0;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canQuery || isQuerying) return;

    setIsQuerying(true);
    setQueryError(null);
    setAnswer(null);

    try {
      const context = buildQueryContext({
        bankName,
        rssd,
        subjectQuarters,
        peerBanks,
        peerData: peerLoadedData?.peers ?? null,
        marketIntelData,
        selectedQuarter,
      });

      const { data, error: fnError } = await supabase.functions.invoke("bank-query", {
        body: { question: question.trim(), context, bankName },
      });

      if (fnError) {
        // Try to surface the server-side error message
        let msg = fnError.message;
        try {
          const body = await (fnError as any).context?.json?.();
          if (body?.error) msg = body.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }

      if (data?.error) throw new Error(data.error);
      if (!data?.answer) throw new Error("No answer returned from AI.");

      setAnswer(data.answer);
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsQuerying(false);
    }
  };

  const handleSuggestedQuestion = (q: string) => {
    setQuestion(q);
    textareaRef.current?.focus();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="rounded-xl bg-primary px-5 py-4">
        <div className="flex items-center gap-2.5 mb-1.5">
          <Brain className="h-5 w-5 text-accent" />
          <h3 className="font-display text-xl font-bold text-primary-foreground">AI Analyst</h3>
        </div>
        <p className="text-sm text-primary-foreground/70 leading-relaxed">
          Ask any question about {bankName} — powered by FFIEC data, peer benchmarks, and market intelligence.
        </p>
      </div>

      {/* Data sources status strip */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">Data sources:</span>
        {dataSources.map(({ label, ready, hint }) => (
          <span
            key={label}
            title={hint}
            className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border font-medium transition-colors ${
              ready
                ? "bg-green-500/10 text-green-700 border-green-200"
                : isDataLoading && label === "FFIEC"
                ? "bg-amber-500/10 text-amber-700 border-amber-200"
                : "bg-muted/50 text-muted-foreground border-border"
            }`}
          >
            {ready ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : isDataLoading && label === "FFIEC" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Clock className="h-3 w-3" />
            )}
            {label}
          </span>
        ))}
      </div>

      {/* New data available banner */}
      {newDataSources.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/5 px-3.5 py-2.5">
          <p className="text-xs text-accent font-medium">
            {newDataSources.join(" & ")} just loaded — your current answer doesn't include it.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setNewDataSources([]); handleSubmit(); }}
              disabled={isQuerying}
              className="text-xs font-semibold text-accent hover:underline disabled:opacity-50"
            >
              Re-run
            </button>
            <button
              onClick={() => setNewDataSources([])}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* FFIEC data error */}
      {dataError && !isDataLoading && (
        <Card className="p-4 border-destructive/50 bg-destructive/5 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{dataError}</p>
        </Card>
      )}

      {/* Query form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={
              isDataLoading
                ? "Loading FFIEC data…"
                : `Ask anything about ${bankName}…`
            }
            disabled={isDataLoading || isQuerying}
            rows={3}
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed pr-24"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!canQuery || isQuerying}
            className="absolute bottom-2.5 right-2.5 gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground"
          >
            {isQuerying ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Analyzing</>
            ) : (
              <><Send className="h-3.5 w-3.5" />Ask</>
            )}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Press Enter to submit · Shift+Enter for new line</p>
      </form>

      {/* Suggested questions */}
      {!answer && !isQuerying && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Suggested questions</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => handleSuggestedQuestion(q)}
                disabled={isDataLoading}
                className="text-xs bg-muted/50 border border-border rounded-full px-3 py-1.5 text-foreground/80 hover:bg-accent/10 hover:border-accent/40 hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Query error */}
      {queryError && (
        <Card className="p-4 border-destructive/50 bg-destructive/5 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Analysis failed</p>
            <p className="text-xs text-destructive/80 mt-0.5">{queryError}</p>
          </div>
        </Card>
      )}

      {/* Answer */}
      {answer && (
        <div ref={answerRef}>
          <Card className="p-5 border-l-4 border-l-accent/60 shadow-sm">
            <div className="flex gap-4">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                <Brain className="h-4 w-4 text-accent" />
              </div>
              <div className="space-y-1 flex-1">
                <p className="text-xs font-semibold text-accent uppercase tracking-wide">AI Analysis</p>
                <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{answer}</div>
              </div>
            </div>
          </Card>

          {/* Ask another question prompt */}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => { setAnswer(null); setQuestion(""); textareaRef.current?.focus(); }}
              className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
            >
              Ask another question
            </button>
            <span className="text-muted-foreground text-xs">·</span>
            <button
              onClick={() => handleSubmit()}
              disabled={isQuerying}
              className="text-xs text-muted-foreground hover:text-foreground underline transition-colors disabled:opacity-50"
            >
              Re-run with updated data
            </button>
          </div>
        </div>
      )}

      <Card className="p-3 bg-muted/30 border-dashed">
        <p className="text-xs text-muted-foreground text-center">
          🤖 AI answers are based on FFIEC UBPR data, peer benchmarks, and market intelligence. Always verify against source documents before acting.
        </p>
      </Card>
    </div>
  );
};

export default AINarrativePanel;
