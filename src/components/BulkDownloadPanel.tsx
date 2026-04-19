import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Loader2, CheckCircle, AlertTriangle, ExternalLink, Database } from "lucide-react";
import { startBulkDownload } from "@/lib/api/bulkDownload";
import { pollAgentRuns } from "@/lib/api/pollAgentRuns";
import { useToast } from "@/hooks/use-toast";

const BulkDownloadPanel = () => {
  const [reportDate, setReportDate] = useState("12/31/2024");
  const [status, setStatus] = useState<"idle" | "downloading" | "processing" | "complete" | "error">("idle");
  const [streamingUrl, setStreamingUrl] = useState<string | null>(null);
  const [result, setResult] = useState<{ totalRecords?: number; inserted?: number; errors?: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { toast } = useToast();

  const handleBulkDownload = async () => {
    setStatus("downloading");
    setStreamingUrl(null);
    setResult(null);
    setErrorMessage(null);

    try {
      const { jobId } = await startBulkDownload(reportDate, (url) => setStreamingUrl(url));

      // Poll for TinyFish completion
      const finalJob = await pollAgentRuns(jobId, (url) => setStreamingUrl(url));

      if (finalJob.status === "failed") {
        throw new Error(finalJob.error || "Bulk download failed");
      }

      setStatus("processing");

      // If TinyFish returned a download URL, process it
      if (finalJob.pdfUrl) {
        // pdfUrl field is reused for the download URL in bulk context
        const processResult = await import("@/lib/api/bulkDownload").then((m) =>
          m.processBulkDownload(finalJob.pdfUrl!, jobId),
        );
        setResult(processResult);
      }

      setStatus("complete");
      toast({
        title: "Bulk Download Complete",
        description: `Successfully imported UBPR data for report date ${reportDate}.`,
      });
    } catch (error) {
      console.error("Bulk download error:", error);
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
      toast({
        title: "Bulk Download Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Database className="h-6 w-6 text-primary" />
        <div>
          <h3 className="font-semibold text-foreground">Bulk UBPR Data Download</h3>
          <p className="text-sm text-muted-foreground">
            Download UBPR data for all banks from the FFIEC CDR bulk data repository.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reportDate">Report Date</Label>
        <Input
          id="reportDate"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          placeholder="MM/DD/YYYY"
          disabled={status === "downloading" || status === "processing"}
        />
        <p className="text-xs text-muted-foreground">
          Format: MM/DD/YYYY (e.g., 12/31/2024, 09/30/2024)
        </p>
      </div>

      <Button
        onClick={handleBulkDownload}
        disabled={status === "downloading" || status === "processing" || !reportDate}
        className="gap-2 w-full"
      >
        {status === "downloading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Navigating FFIEC CDR…
          </>
        ) : status === "processing" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Parsing & storing data…
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Start Bulk Download
          </>
        )}
      </Button>

      {(status === "downloading" || status === "processing") && (
        <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-2">
          <p className="font-medium">
            {status === "downloading"
              ? "TinyFish is navigating the FFIEC bulk download page…"
              : "Parsing XBRL files and storing data in the database…"}
          </p>
          <p>This may take several minutes for the full dataset.</p>
          {streamingUrl && (
            <a
              href={streamingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
            >
              Watch live progress
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {status === "complete" && result && (
        <div className="flex items-start gap-2 text-sm bg-primary/5 border border-primary/20 rounded-lg p-3">
          <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">Import Complete</p>
            <p className="text-muted-foreground">
              {result.totalRecords} bank-period records found. {result.inserted} inserted successfully.
              {result.errors ? ` ${result.errors} errors.` : ""}
            </p>
          </div>
        </div>
      )}

      {status === "error" && errorMessage && (
        <div className="flex items-start gap-2 text-sm bg-destructive/5 border border-destructive/20 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">Download Failed</p>
            <p className="text-muted-foreground">{errorMessage}</p>
          </div>
        </div>
      )}
    </Card>
  );
};

export default BulkDownloadPanel;
