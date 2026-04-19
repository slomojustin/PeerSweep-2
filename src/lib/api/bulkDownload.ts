import { supabase } from '@/integrations/supabase/client';
import { pollAgentRuns } from '@/lib/api/pollAgentRuns';

interface BulkDownloadResponse {
  success: boolean;
  error?: string;
  status?: string;
  jobId?: string;
  reportDate?: string;
}

interface ProcessResponse {
  success: boolean;
  error?: string;
  totalRecords?: number;
  inserted?: number;
  errors?: number;
}

export const startBulkDownload = async (
  reportDate: string,
  onStreamingUrl?: (url: string) => void,
): Promise<{ jobId: string }> => {
  const { data, error } = await supabase.functions.invoke<BulkDownloadResponse>('bulk-download-ubpr', {
    body: { reportDate },
  });

  if (error) throw new Error(`Failed to start bulk download: ${error.message}`);
  if (!data?.success) throw new Error(data?.error || 'Failed to start bulk download');
  if (!data.jobId) throw new Error('No job ID returned');

  return { jobId: data.jobId };
};

export const processBulkDownload = async (
  downloadUrl: string,
  jobId?: string,
): Promise<ProcessResponse> => {
  const { data, error } = await supabase.functions.invoke<ProcessResponse>('process-bulk-ubpr', {
    body: { downloadUrl, jobId },
  });

  if (error) throw new Error(`Failed to process bulk download: ${error.message}`);
  if (!data?.success) throw new Error(data?.error || 'Failed to process bulk data');

  return data;
};
