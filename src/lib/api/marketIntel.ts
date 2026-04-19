import { supabase } from '@/integrations/supabase/client';
import { pollAgentRuns } from '@/lib/api/pollAgentRuns';
import { openAgentSSEConnections } from '@/lib/api/marketIntelSSE';
import type { BankInfo } from '@/data/bankData';

export interface CompetitorRate {
  institution: string;
  product: string;
  rate: number;
  source: string;
  date: string;
}

export interface FDICCompetitor {
  name: string;
  deposits: number;
  branches: number;
  marketSharePct: number;
}

export interface FDICMarketShare {
  bankName: string;
  marketArea: string;
  totalDeposits: number;
  branches: number;
  marketSharePct: number;
  competitors: FDICCompetitor[];
}

export interface PeerBankRate {
  bankName: string;
  product: string;
  rate: number;
  source: string;
}

export interface LocalNewsItem {
  bankName?: string;
  headline: string;
  source: string;
  url: string | null;
  date: string | null;
  summary: string;
}

export interface SocialMediaEntry {
  bankName: string;
  platform: string;
  profileUrl: string | null;
  followers: number | null;
  recentPromo: string | null;
  lastPostDate: string | null;
}

export interface AgentStreamInfo {
  bankName: string;
  streamingUrl: string | null;
}

export interface MarketIntelData {
  competitorRates?: CompetitorRate[];
  fdicMarketShare?: FDICMarketShare | null;
  peerBankRates?: PeerBankRate[];
  localNews?: LocalNewsItem[];
  socialMedia?: SocialMediaEntry[];
}

interface MarketIntelResponse {
  success: boolean;
  error?: string;
  source?: 'cache' | 'live';
  status?: 'processing' | 'completed' | 'failed';
  jobId?: string;
  runIds?: string[];
  data?: MarketIntelData;
}

function parseMarketIntelResult(raw: unknown): MarketIntelData {
  if (!raw || typeof raw !== 'object') return raw as MarketIntelData;
  const obj = raw as Record<string, unknown>;
  if (obj.peerBankRates || obj.localNews || obj.socialMedia) return raw as MarketIntelData;
  if (typeof obj.result === 'string') {
    const cleaned = obj.result.replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '');
    try { return JSON.parse(cleaned) as MarketIntelData; } catch { /* fall through */ }
  }
  return raw as MarketIntelData;
}

export const fetchMarketIntel = async (
  bank: BankInfo,
  peerBanks: BankInfo[],
  onStreamingUrl?: (url: string) => void,
  onAgentStreams?: (streams: AgentStreamInfo[]) => void,
  signal?: AbortSignal,
  onRunIds?: (runIds: string[]) => void,
  onJobId?: (jobId: string) => void,
  onBankResult?: (index: number, data: MarketIntelData) => void,
): Promise<MarketIntelData> => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const { data, error } = await supabase.functions.invoke<MarketIntelResponse>('fetch-market-intel', {
    body: {
      bankName: bank.name,
      rssd: bank.rssd,
      state: bank.state,
      city: bank.city,
      peerBanks: peerBanks.map(p => ({ name: p.name, rssd: p.rssd, city: p.city, state: p.state })),
    },
  });

  if (error) {
    throw new Error(`Failed to fetch market intel: ${error.message}`);
  }

  if (data?.success && data?.status === 'completed' && data?.data) {
    return parseMarketIntelResult(data.data);
  }

  if (data?.success && data?.status === 'processing' && data?.jobId) {
    onJobId?.(data.jobId);

    if (data.runIds && data.runIds.length > 0) {
      onRunIds?.(data.runIds);
    }

    if (data.runIds && data.runIds.length > 0 && onAgentStreams) {
      // Initialise streams with null URLs; SSE fills them in as events arrive
      const streams: AgentStreamInfo[] = peerBanks.map(p => ({
        bankName: p.name,
        streamingUrl: null,
      }));

      const cleanup = openAgentSSEConnections(
        data.runIds,
        {
          onStreamingUrl: (index, url) => {
            streams[index] = { ...streams[index], streamingUrl: url };
            onAgentStreams([...streams]);
            // Fire legacy single-URL callback for backward compat
            if (index === 0) onStreamingUrl?.(url);
          },
          onResult: (index, result) => {
            onBankResult?.(index, result);
          },
          onError: (index, message) => {
            console.warn(
              `Agent SSE error for peer[${index}] (${peerBanks[index]?.name}): ${message}`,
            );
          },
          onAllComplete: () => {
            cleanup();
          },
        },
        signal,
      );

      // Ensure SSE connections are torn down if the caller aborts
      signal?.addEventListener('abort', cleanup, { once: true });
    }

    const finalJob = await pollAgentRuns(
      data.jobId,
      onStreamingUrl,
      undefined,
      onAgentStreams
        ? (urls) => onAgentStreams(
            peerBanks.map((p, i) => ({ bankName: p.name, streamingUrl: urls[i] ?? null })),
          )
        : undefined,
      signal,
      onBankResult
        ? (index, result) => onBankResult(index, result as MarketIntelData)
        : undefined,
    );

    if (finalJob.status !== 'completed' || !finalJob.data) {
      throw new Error(finalJob.error || 'No market intel data returned');
    }

    return parseMarketIntelResult(finalJob.data);
  }

  throw new Error(data?.error || 'No market intel data returned');
};
