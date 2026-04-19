import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  extractPeerRunIds,
  parsePeerRunResult,
  mergeMarketIntelResults,
  hasUsableMarketIntelData,
  type PeerRunResult,
} from './market-intel-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FFIEC_CDR_URL = 'https://cdr.ffiec.gov/public/ManageFacsimiles.aspx';

const stringifyError = (error: unknown) => {
  if (!error) return null;
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown TinyFish error';
  }
};

const parseJsonLikeResult = (value: unknown) => {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string') return null;

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    const jsonStart = value.indexOf('{');
    const jsonEnd = value.lastIndexOf('}') + 1;

    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        return JSON.parse(value.substring(jsonStart, jsonEnd)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }

    return null;
  }
};

const extractPdfUrl = (runData: Record<string, any>) => {
  const topLevelDownloads = Array.isArray(runData.downloads) ? runData.downloads : [];
  const resultData = runData.result;
  const parsedResult = parseJsonLikeResult(resultData);
  const resultDownloads = Array.isArray((parsedResult as any)?.downloads)
    ? (parsedResult as any).downloads
    : [];

  const directUrl =
    parsedResult?.pdfUrl ??
    parsedResult?.downloadUrl ??
    parsedResult?.url ??
    runData.pdfUrl ??
    runData.downloadUrl ??
    runData.url ??
    topLevelDownloads[0]?.url ??
    topLevelDownloads[0] ??
    resultDownloads[0]?.url ??
    resultDownloads[0] ??
    null;

  if (typeof directUrl === 'string' && directUrl.startsWith('http')) {
    return directUrl;
  }

  if (typeof resultData === 'string') {
    const urlMatch = resultData.match(/https?:\/\/[^\s"']+\.pdf[^\s"']*/i);
    if (urlMatch) {
      return urlMatch[0];
    }
  }

  return null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId } = await req.json();

    if (!jobId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Job ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: job, error: jobError } = await supabase
      .from('ffiec_report_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ success: false, error: 'FFIEC job not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (job.status === 'completed') {
      if (job.report_type === 'ubpr_metrics' || job.report_type === 'market_intel') {
        return new Response(
          JSON.stringify({
            success: true,
            jobId: job.id,
            reportType: job.report_type,
            status: 'completed',
            source: job.source ?? 'live',
            data: job.result_metrics,
            streamingUrl: job.tinyfish_streaming_url,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          jobId: job.id,
          reportType: job.report_type,
          status: 'completed',
          source: job.source ?? 'live',
          pdfUrl: job.result_pdf_url,
          ffiecUrl: job.result_pdf_url ? undefined : FFIEC_CDR_URL,
          message: job.result_pdf_url ? undefined : job.error_message,
          streamingUrl: job.tinyfish_streaming_url,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (job.status === 'failed') {
      return new Response(
        JSON.stringify({
          success: true,
          jobId: job.id,
          reportType: job.report_type,
          status: 'failed',
          error: job.error_message ?? 'FFIEC retrieval failed',
          streamingUrl: job.tinyfish_streaming_url,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Multi-run market intel ────────────────────────────────────────────────
    // When _runIds.peers is present, poll every peer-bank run and merge results.
    // Falls through to the legacy single-run path when _runIds is absent.
    if (job.report_type === 'market_intel') {
      const peerRunIds = extractPeerRunIds(job.result_metrics);
      if (peerRunIds && peerRunIds.length > 0) {
        const apiKey = Deno.env.get('TINYFISH_API_KEY');
        if (!apiKey) {
          return new Response(
            JSON.stringify({ success: false, error: 'TinyFish API key not configured' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        // Poll all peer runs concurrently
        const runPolls = await Promise.all(
          peerRunIds.map(async (runId) => {
            const resp = await fetch(`https://agent.tinyfish.ai/v1/runs/${runId}`, {
              headers: { 'X-API-Key': apiKey },
            });
            if (!resp.ok) {
              console.error(`TinyFish status error for run ${runId}: ${resp.status}`);
              return { runId, tinyfishStatus: 'ERROR', data: null as Record<string, unknown> | null };
            }
            const data = await resp.json() as Record<string, unknown>;
            const tinyfishStatus = typeof data?.status === 'string' ? data.status.toUpperCase() : 'RUNNING';
            return { runId, tinyfishStatus, data };
          }),
        );

        // Preserve null slots so index i maps to peerRunIds[i] (and therefore peerBanks[i])
        const streamingUrls = runPolls
          .map(r => (r.data && typeof r.data.streaming_url === 'string') ? r.data.streaming_url : null);

        // At least one run still in progress — stay in processing
        const stillRunning = runPolls.some(
          r => r.tinyfishStatus === 'PENDING' || r.tinyfishStatus === 'RUNNING',
        );
        if (stillRunning) {
          await supabase
            .from('ffiec_report_jobs')
            .update({ status: 'processing', tinyfish_streaming_url: streamingUrls[0] ?? null })
            .eq('id', job.id);

          // Collect results from already-completed runs for progressive client delivery
          const perRunResults: { index: number; result: PeerRunResult }[] = [];
          for (let i = 0; i < runPolls.length; i++) {
            const r = runPolls[i];
            if (r.tinyfishStatus === 'COMPLETED' && r.data) {
              const parsed = parsePeerRunResult(r.data);
              if (parsed) perRunResults.push({ index: i, result: parsed });
            }
          }

          return new Response(
            JSON.stringify({
              success: true,
              jobId: job.id,
              reportType: job.report_type,
              status: 'processing',
              source: job.source ?? 'live',
              streamingUrl: streamingUrls[0] ?? null,
              streamingUrls,
              perRunResults,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        // All terminal — collect usable results from completed runs
        const successfulResults: PeerRunResult[] = [];
        for (const r of runPolls) {
          if (r.tinyfishStatus === 'COMPLETED' && r.data) {
            const parsed = parsePeerRunResult(r.data);
            if (parsed) {
              successfulResults.push(parsed);
            } else {
              console.error(`Run ${r.runId} completed but returned no usable data`);
            }
          } else {
            console.error(`Run ${r.runId} terminal with status ${r.tinyfishStatus}`);
          }
        }

        const merged = mergeMarketIntelResults(successfulResults);

        if (!hasUsableMarketIntelData(merged)) {
          const errorMessage = `All ${peerRunIds.length} peer run(s) failed or returned no usable market intel data`;
          await supabase
            .from('ffiec_report_jobs')
            .update({
              status: 'failed',
              error_message: errorMessage,
              tinyfish_streaming_url: streamingUrls[0] ?? null,
              completed_at: new Date().toISOString(),
            })
            .eq('id', job.id);

          return new Response(
            JSON.stringify({
              success: true,
              jobId: job.id,
              reportType: job.report_type,
              status: 'failed',
              error: errorMessage,
              streamingUrls,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        // Preserve existing metadata (_peerRssds, _runIds) alongside the merged results
        const existingMeta = (job.result_metrics as Record<string, unknown>) ?? {};
        const finalMetrics = { ...existingMeta, ...merged };

        await supabase
          .from('ffiec_report_jobs')
          .update({
            status: 'completed',
            source: 'live',
            result_metrics: finalMetrics,
            tinyfish_streaming_url: streamingUrls[0] ?? null,
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        return new Response(
          JSON.stringify({
            success: true,
            jobId: job.id,
            reportType: job.report_type,
            status: 'completed',
            source: 'live',
            data: merged,
            streamingUrl: streamingUrls[0] ?? null,
            streamingUrls,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }
    // ── End multi-run market intel ────────────────────────────────────────────

    if (!job.tinyfish_run_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'TinyFish run ID is missing for this job' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const apiKey = Deno.env.get('TINYFISH_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'TinyFish API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const runResponse = await fetch(`https://agent.tinyfish.ai/v1/runs/${job.tinyfish_run_id}`, {
      headers: {
        'X-API-Key': apiKey,
      },
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error('TinyFish run status error:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: `TinyFish status error: ${runResponse.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const runData = await runResponse.json();
    const tinyfishStatus = typeof runData?.status === 'string' ? runData.status.toUpperCase() : 'RUNNING';
    const streamingUrl = typeof runData?.streaming_url === 'string' ? runData.streaming_url : null;

    if (tinyfishStatus === 'PENDING' || tinyfishStatus === 'RUNNING') {
      await supabase
        .from('ffiec_report_jobs')
        .update({ status: 'processing', tinyfish_streaming_url: streamingUrl })
        .eq('id', job.id);

      return new Response(
        JSON.stringify({
          success: true,
          jobId: job.id,
          reportType: job.report_type,
          status: 'processing',
          source: job.source ?? 'live',
          streamingUrl,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (tinyfishStatus === 'FAILED' || tinyfishStatus === 'CANCELLED') {
      const errorMessage = stringifyError(runData?.error) ?? `TinyFish run ${tinyfishStatus.toLowerCase()}`;

      await supabase
        .from('ffiec_report_jobs')
        .update({
          status: 'failed',
          error_message: errorMessage,
          tinyfish_streaming_url: streamingUrl,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return new Response(
        JSON.stringify({
          success: true,
          jobId: job.id,
          reportType: job.report_type,
          status: 'failed',
          error: errorMessage,
          streamingUrl,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (job.report_type === 'ubpr_bulk') {
      // For bulk downloads, look for download URLs in TinyFish results
      const parsedResult = parseJsonLikeResult(runData?.result);
      const downloads = Array.isArray(runData?.downloads) ? runData.downloads : [];
      const downloadUrl = 
        parsedResult?.downloadUrl ??
        downloads[0]?.url ??
        downloads[0] ??
        null;

      console.log('Bulk download TinyFish result:', JSON.stringify({ parsedResult, downloads, downloadUrl }));

      if (downloadUrl && typeof downloadUrl === 'string') {
        // Store the download URL and mark as completed - processing happens separately
        await supabase
          .from('ffiec_report_jobs')
          .update({
            status: 'completed',
            source: 'live',
            result_pdf_url: downloadUrl,
            result_metrics: parsedResult,
            tinyfish_streaming_url: streamingUrl,
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        return new Response(
          JSON.stringify({
            success: true,
            jobId: job.id,
            reportType: job.report_type,
            status: 'completed',
            source: 'live',
            downloadUrl,
            streamingUrl,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // TinyFish completed but no download URL found
      const resultStr = typeof runData?.result === 'string' ? runData.result : JSON.stringify(runData?.result);
      console.log('Bulk download - no download URL found. Full result:', resultStr);

      await supabase
        .from('ffiec_report_jobs')
        .update({
          status: 'completed',
          source: 'fallback',
          error_message: 'TinyFish completed but could not capture the download URL. The FFIEC bulk download may require manual retrieval.',
          result_metrics: { rawResult: resultStr, downloads },
          tinyfish_streaming_url: streamingUrl,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return new Response(
        JSON.stringify({
          success: true,
          jobId: job.id,
          reportType: job.report_type,
          status: 'completed',
          source: 'fallback',
          rawResult: resultStr,
          streamingUrl,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (job.report_type === 'market_intel') {
      const parsedResult = parseJsonLikeResult(runData?.result);

      if (!parsedResult) {
        const errorMessage = 'TinyFish completed but did not return market intel data';
        await supabase
          .from('ffiec_report_jobs')
          .update({
            status: 'failed',
            error_message: errorMessage,
            tinyfish_streaming_url: streamingUrl,
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        return new Response(
          JSON.stringify({
            success: true,
            jobId: job.id,
            reportType: job.report_type,
            status: 'failed',
            error: errorMessage,
            streamingUrl,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      await supabase
        .from('ffiec_report_jobs')
        .update({
          status: 'completed',
          source: 'live',
          result_metrics: parsedResult,
          tinyfish_streaming_url: streamingUrl,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return new Response(
        JSON.stringify({
          success: true,
          jobId: job.id,
          reportType: job.report_type,
          status: 'completed',
          source: 'live',
          data: parsedResult,
          streamingUrl,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (job.report_type === 'ubpr_metrics') {
      const parsedResult = parseJsonLikeResult(runData?.result);
      const quarters = Array.isArray((parsedResult as any)?.quarters) ? (parsedResult as any).quarters : null;

      if (!quarters?.length) {
        const errorMessage = 'TinyFish completed but did not return UBPR quarter data';
        await supabase
          .from('ffiec_report_jobs')
          .update({
            status: 'failed',
            error_message: errorMessage,
            tinyfish_streaming_url: streamingUrl,
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        return new Response(
          JSON.stringify({
            success: true,
            jobId: job.id,
            reportType: job.report_type,
            status: 'failed',
            error: errorMessage,
            streamingUrl,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const reportDate = quarters[0]?.date || new Date().toISOString().split('T')[0];
      const resultMetrics = { quarters };

      const { error: upsertError } = await supabase
        .from('ubpr_cache')
        .upsert(
          {
            rssd: job.rssd,
            bank_name: job.bank_name,
            report_date: reportDate,
            metrics: resultMetrics,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: 'rssd,report_date' },
        );

      if (upsertError) {
        console.error('Cache write error:', upsertError);
      }

      await supabase
        .from('ffiec_report_jobs')
        .update({
          status: 'completed',
          source: 'live',
          result_metrics: resultMetrics,
          tinyfish_streaming_url: streamingUrl,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return new Response(
        JSON.stringify({
          success: true,
          jobId: job.id,
          reportType: job.report_type,
          status: 'completed',
          source: 'live',
          data: resultMetrics,
          streamingUrl,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const pdfSourceUrl = extractPdfUrl(runData);

    if (pdfSourceUrl) {
      let finalPdfUrl = pdfSourceUrl;
      const storagePath = `${job.rssd}/ubpr-latest.pdf`;

      try {
        const pdfResponse = await fetch(pdfSourceUrl);
        if (pdfResponse.ok) {
          const pdfBuffer = await pdfResponse.arrayBuffer();
          const { error: uploadError } = await supabase.storage
            .from('ubpr-reports')
            .upload(storagePath, pdfBuffer, {
              contentType: 'application/pdf',
              upsert: true,
            });

          if (uploadError) {
            console.error('Storage upload error:', uploadError);
          } else {
            const { data: urlData } = supabase.storage.from('ubpr-reports').getPublicUrl(storagePath);
            finalPdfUrl = urlData.publicUrl;
          }
        }
      } catch (downloadError) {
        console.error('Failed to download/store PDF:', downloadError);
      }

      await supabase
        .from('ffiec_report_jobs')
        .update({
          status: 'completed',
          source: 'live',
          result_pdf_url: finalPdfUrl,
          tinyfish_streaming_url: streamingUrl,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return new Response(
        JSON.stringify({
          success: true,
          jobId: job.id,
          reportType: job.report_type,
          status: 'completed',
          source: 'live',
          pdfUrl: finalPdfUrl,
          streamingUrl,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const fallbackMessage = 'Could not automatically download PDF. Use the FFIEC CDR link to access the report.';

    await supabase
      .from('ffiec_report_jobs')
      .update({
        status: 'completed',
        source: 'fallback',
        error_message: fallbackMessage,
        tinyfish_streaming_url: streamingUrl,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    return new Response(
      JSON.stringify({
        success: true,
        jobId: job.id,
        reportType: job.report_type,
        status: 'completed',
        source: 'fallback',
        pdfUrl: null,
        ffiecUrl: FFIEC_CDR_URL,
        message: fallbackMessage,
        streamingUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error checking FFIEC job status:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
