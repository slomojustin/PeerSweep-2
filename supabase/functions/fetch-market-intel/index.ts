import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SubjectBankInfo {
  name: string;
  rssd: string;
  city?: string;
  state?: string;
}

interface PeerBankInfo {
  name: string;
  city?: string;
  state?: string;
}

/**
 * Full per-peer prompt: deposit rates + recent news about that bank + social media.
 * Each TinyFish run covers exactly one peer bank and returns all three data types.
 */
function buildPeerBankIntelGoal(subjectBank: SubjectBankInfo, peerBank: PeerBankInfo): string {
  const location = [peerBank.city, peerBank.state].filter(Boolean).join(', ');
  return `You are researching ONE specific bank: "${peerBank.name}"${location ? ` (${location})` : ''}. Complete all three tasks below. Every result must be about ${peerBank.name} only — do not include information about other banks or general market news.

TASK 1 — Deposit Rates:
Visit ${peerBank.name}'s official website and find their currently advertised deposit rates (savings, money market, CDs of all terms). Look for a "rates" or "personal banking" section.

TASK 2 — Recent News about ${peerBank.name}:
Search Google News for recent articles specifically and only about ${peerBank.name}. Do not return articles about other banks or general industry news. Look for:
- ${peerBank.name} rate changes, branch openings, or deposit promotions
- ${peerBank.name} press releases, earnings news, or community announcements
- Local news coverage that directly mentions ${peerBank.name} by name
Extract up to 5 relevant articles. For each article, open the article page and read its content so you can write a thorough 4-5 sentence summary that explains: what happened, why it matters to the bank or its customers, any specific figures or dates mentioned, and the broader context or impact.

TASK 3 — Social Media & Marketing:
Find ${peerBank.name}'s social media presence:
- LinkedIn: search "site:linkedin.com/company ${peerBank.name}" — note follower count and recent rate/promotion posts
- Facebook: search "site:facebook.com ${peerBank.name}" — note promoted rates or community engagement
- Instagram: search "site:instagram.com ${peerBank.name}" — note any marketing campaigns or promotions

Return all results as a single JSON object with this exact structure:
{
  "peerBankRates": [
    { "bankName": "${peerBank.name}", "product": "12-Month CD", "rate": 4.50, "source": "bankwebsite.com" }
  ],
  "localNews": [
    { "bankName": "${peerBank.name}", "headline": "Article title", "source": "Publication Name", "url": "https://...", "date": "2026-03-28", "summary": "4-5 sentence summary covering what happened, why it matters, key figures or dates mentioned, and the broader impact on the bank or its customers." }
  ],
  "socialMedia": [
    { "bankName": "${peerBank.name}", "platform": "LinkedIn", "profileUrl": "https://...", "followers": 5000, "recentPromo": "...", "lastPostDate": "2026-03-25" }
  ]
}
All rate values must be numbers (not strings). Use null for missing scalar fields. Use empty arrays when no records are found.`;
}

function parseMarketIntelResult(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const obj = raw as Record<string, unknown>;
  // Strip internal metadata before returning
  const cleaned = { ...obj };
  delete (cleaned as Record<string, unknown>)._peerRssds;
  delete (cleaned as Record<string, unknown>)._runIds;
  if (cleaned.peerBankRates || cleaned.localNews || cleaned.socialMedia) return cleaned;
  if (typeof cleaned.result === 'string') {
    const stripped = (cleaned.result as string).replace(/^```json\s*/i, '').replace(/\s*```\s*$/,'');
    try { return JSON.parse(stripped); } catch { return cleaned; }
  }
  return cleaned;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // DEBUG — remove once deployment is confirmed
    console.log('FETCH_MARKET_INTEL_VERSION=parallel-peer-v1');

    const { bankName, rssd, state, city, peerBanks, bypassCache } = await req.json();

    if (!bankName || !rssd) {
      return new Response(
        JSON.stringify({ success: false, error: 'bankName and rssd are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Deterministic cache key: "<subject_rssd>:<sorted_peer_rssds>"
    const sortedPeerRssds = ((peerBanks || []) as { rssd?: string }[])
      .map(p => p.rssd)
      .filter(Boolean)
      .sort()
      .join(',');
    const cacheKey = `${rssd}:${sortedPeerRssds}`;

    const apiKey = Deno.env.get('TINYFISH_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'TinyFish API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!bypassCache) {
      // Check cache: 24-hour TTL, keyed on subject RSSD + sorted peer RSSDs
      const ttlExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existingJob } = await supabase
        .from('ffiec_report_jobs')
        .select('id, status, result_metrics, completed_at')
        .eq('cache_key', cacheKey)
        .eq('report_type', 'market_intel')
        .eq('status', 'completed')
        .gt('completed_at', ttlExpiry)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingJob?.result_metrics) {
        console.log(`Market intel cache hit for ${bankName} (key: ${cacheKey})`);
        const parsed = parseMarketIntelResult(existingJob.result_metrics);
        return new Response(
          JSON.stringify({ success: true, source: 'cache', status: 'completed', data: parsed }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Check if there's already a processing job for this exact subject+peer combination
      const { data: pendingJob } = await supabase
        .from('ffiec_report_jobs')
        .select('id')
        .eq('cache_key', cacheKey)
        .eq('report_type', 'market_intel')
        .eq('status', 'processing')
        .limit(1)
        .maybeSingle();

      if (pendingJob) {
        return new Response(
          JSON.stringify({ success: true, status: 'processing', jobId: pendingJob.id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    } else {
      console.log(`Cache bypass requested for ${bankName} (key: ${cacheKey}) — starting fresh TinyFish run`);
    }

    const subjectBankInfo: SubjectBankInfo = { name: bankName, rssd, city, state };

    const peerBankDetails: PeerBankInfo[] = (peerBanks || []).map(
      (p: { name: string; city?: string; state?: string }) => ({ name: p.name, city: p.city, state: p.state }),
    );

    // One run per peer bank — each covers rates + news + social for that peer only
    interface RunRequest { label: string; goal: string; }
    const runRequests: RunRequest[] = peerBankDetails.map(p => ({
      label: `peer:${p.name}`,
      goal: buildPeerBankIntelGoal(subjectBankInfo, p),
    }));

    if (runRequests.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'At least one peer bank is required for market intel' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // DEBUG — confirm parallel path and starting URL
    console.log(`[parallel-peer-v1] peer banks: ${peerBankDetails.length} → ${peerBankDetails.map(p => p.name).join(', ')}`);
    console.log(`[parallel-peer-v1] run count: ${runRequests.length} (one per peer, NOT combined)`);
    console.log(`[parallel-peer-v1] TinyFish starting URL: https://www.google.com`);
    console.log(`Starting ${runRequests.length} parallel peer-bank TinyFish runs for ${bankName}...`);

    // Fire all runs concurrently
    const runResults = await Promise.all(
      runRequests.map(async ({ label, goal }) => {
        const resp = await fetch('https://agent.tinyfish.ai/v1/automation/run-async', {
          method: 'POST',
          headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://www.google.com', goal, browser_profile: 'lite' }),
        });
        if (!resp.ok) {
          const text = await resp.text();
          console.error(`TinyFish error for ${label} (HTTP ${resp.status}):`, text.slice(0, 300));
          return { label, runId: null as string | null };
        }
        const data = await resp.json();
        const runId: string | null = data?.run_id ?? null;
        if (!runId) console.error(`No run_id from TinyFish for ${label}:`, data);
        return { label, runId };
      }),
    );

    const peerRunIds = runResults
      .filter(r => r.runId)
      .map(r => r.runId as string);

    if (peerRunIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'All TinyFish peer runs failed to start' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Store peer RSSDs list so cache can be matched later
    const peerRssdList = ((peerBanks || []) as { rssd?: string }[])
      .map(p => p.rssd)
      .filter(Boolean)
      .sort();

    const { data: job, error: jobError } = await supabase
      .from('ffiec_report_jobs')
      .insert({
        rssd,
        bank_name: bankName,
        report_type: 'market_intel',
        status: 'processing',
        source: 'live',
        cache_key: cacheKey,
        // tinyfish_run_id holds the first peer run as a fallback so the existing poller guard doesn't fire.
        // TODO: update poll-agent-runs to read _runIds.peers, poll all runs, and merge results before completing.
        tinyfish_run_id: peerRunIds[0],
        result_metrics: {
          _peerRssds: peerRssdList,
          _runIds: { peers: peerRunIds },
        },
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('Job insert error:', jobError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create market intel job' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`Started ${peerRunIds.length} peer market intel runs for ${bankName}, job ${job.id}`, { peerRunIds });

    return new Response(
      JSON.stringify({
        success: true,
        source: 'live',
        status: 'processing',
        jobId: job.id,
        runIds: peerRunIds,
        debugVersion: 'parallel-peer-v1', // DEBUG — remove after confirming deployment
        debugRunCount: peerRunIds.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error fetching market intel:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
