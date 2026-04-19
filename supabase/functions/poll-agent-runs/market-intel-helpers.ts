// Pure helpers for multi-run market intel polling and result merging.
// No Deno or Supabase dependencies — safe to import in unit tests.

export interface PeerRunResult {
  peerBankRates: unknown[];
  localNews: unknown[];
  socialMedia: unknown[];
}

/** Extracts peer run IDs from result_metrics._runIds.peers. Returns null if not present. */
export function extractPeerRunIds(resultMetrics: unknown): string[] | null {
  if (!resultMetrics || typeof resultMetrics !== 'object') return null;
  const m = resultMetrics as Record<string, unknown>;
  const runIds = m._runIds;
  if (!runIds || typeof runIds !== 'object') return null;
  const r = runIds as Record<string, unknown>;
  if (!Array.isArray(r.peers) || r.peers.length === 0) return null;
  const ids = r.peers.filter((id): id is string => typeof id === 'string');
  return ids.length > 0 ? ids : null;
}

/** Parses a completed TinyFish run payload into a PeerRunResult. Returns null if the output is unusable. */
export function parsePeerRunResult(runData: Record<string, unknown>): PeerRunResult | null {
  const raw = runData?.result;
  let parsed: Record<string, unknown> | null = null;

  if (raw && typeof raw === 'object') {
    parsed = raw as Record<string, unknown>;
  } else if (typeof raw === 'string') {
    // Strip markdown code fences TinyFish sometimes wraps output in
    const stripped = raw.replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '');
    try {
      parsed = JSON.parse(stripped);
    } catch {
      // Fall back to extracting the outermost JSON object
      const start = stripped.indexOf('{');
      const end = stripped.lastIndexOf('}') + 1;
      if (start >= 0 && end > start) {
        try { parsed = JSON.parse(stripped.substring(start, end)); } catch { /* unparseable */ }
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const peerBankRates = Array.isArray(parsed.peerBankRates) ? parsed.peerBankRates : [];
  const localNews = Array.isArray(parsed.localNews) ? parsed.localNews : [];
  const socialMedia = Array.isArray(parsed.socialMedia) ? parsed.socialMedia : [];

  // A completed run with all empty arrays is treated as unusable
  if (peerBankRates.length === 0 && localNews.length === 0 && socialMedia.length === 0) return null;

  return { peerBankRates, localNews, socialMedia };
}

/** Concatenates results from multiple successful peer-bank runs into one merged object. */
export function mergeMarketIntelResults(results: PeerRunResult[]): PeerRunResult {
  return {
    peerBankRates: results.flatMap(r => r.peerBankRates),
    localNews: results.flatMap(r => r.localNews),
    socialMedia: results.flatMap(r => r.socialMedia),
  };
}

/** Returns true if the merged result contains at least one record in any category. */
export function hasUsableMarketIntelData(merged: PeerRunResult): boolean {
  return merged.peerBankRates.length > 0 || merged.localNews.length > 0 || merged.socialMedia.length > 0;
}
