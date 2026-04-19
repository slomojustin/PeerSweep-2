import { supabase } from '@/integrations/supabase/client';

export interface AgentRunStatusResponse {
  success: boolean;
  jobId?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  source?: 'cache' | 'live' | 'fallback';
  data?: unknown;
  error?: string;
  streamingUrl?: string | null;
  streamingUrls?: (string | null)[];
}

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120;

export const pollAgentRuns = async (
  jobId: string,
  onStreamingUrl?: (url: string) => void,
  onStatusUpdate?: (message: string) => void,
  onStreamingUrls?: (urls: (string | null)[]) => void,
  signal?: AbortSignal,
  onPerRunResult?: (index: number, result: unknown) => void,
): Promise<AgentRunStatusResponse> => {
  const reportedIndices = new Set<number>();
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (attempt === 0) onStatusUpdate?.("Connecting to agent…");
    else if (attempt === 1) onStatusUpdate?.("Agents are researching — this takes 1–3 minutes…");
    else if (attempt === 6) onStatusUpdate?.("Still working…");
    else if (attempt === 12) onStatusUpdate?.("Almost there, finalizing data…");

    const { data, error } = await supabase.functions.invoke<AgentRunStatusResponse>('poll-agent-runs', {
      body: { jobId },
    });

    if (error) {
      throw new Error(`Failed to check agent run status: ${error.message}`);
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to check agent run status');
    }

    if (data.streamingUrl && onStreamingUrl) {
      onStreamingUrl(data.streamingUrl);
    }
    if (data.streamingUrls && onStreamingUrls) {
      onStreamingUrls(data.streamingUrls);
    }

    // Fire per-run results as individual agents complete (deduplicated across poll cycles)
    if (onPerRunResult && Array.isArray((data as any).perRunResults)) {
      for (const item of (data as any).perRunResults as { index: number; result: unknown }[]) {
        if (!reportedIndices.has(item.index)) {
          reportedIndices.add(item.index);
          onPerRunResult(item.index, item.result);
        }
      }
    }

    if (data.status === 'completed') {
      onStatusUpdate?.("Data loaded successfully");
      return data;
    }

    if (data.status === 'failed') {
      onStatusUpdate?.(data.error || 'Agent run failed');
      return data;
    }

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, POLL_INTERVAL_MS);
      signal?.addEventListener(
        'abort',
        () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); },
        { once: true },
      );
    });
  }

  throw new Error('Agent run is taking longer than expected. Please try again.');
};
