import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { detectAndParse, type ParsedBank } from "@/lib/parseUBPR";

interface UploadedFile {
  name: string;
  size: number;
  status: "reading" | "parsed" | "inserting" | "done" | "error";
  records: ParsedBank[];
  inserted: number;
  errors: number;
  error?: string;
}

const BATCH_SIZE = 50;

const AdminUpload = () => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();

  const updateFile = (index: number, updates: Partial<UploadedFile>) => {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  };

  const handleFiles = useCallback(async (fileList: FileList) => {
    for (const file of Array.from(fileList)) {
      const idx = files.length + Array.from(fileList).indexOf(file);
      const newFile: UploadedFile = {
        name: file.name,
        size: file.size,
        status: "reading",
        records: [],
        inserted: 0,
        errors: 0,
      };

      setFiles((prev) => [...prev, newFile]);

      try {
        const text = await file.text();
        const records = detectAndParse(text);

        if (records.length === 0) {
          setFiles((prev) =>
            prev.map((f) =>
              f.name === file.name && f.status === "reading"
                ? { ...f, status: "error" as const, error: "No records found — unrecognized format" }
                : f
            )
          );
          continue;
        }

        setFiles((prev) =>
          prev.map((f) =>
            f.name === file.name && f.status === "reading"
              ? { ...f, status: "parsed" as const, records }
              : f
          )
        );
      } catch (err: any) {
        setFiles((prev) =>
          prev.map((f) =>
            f.name === file.name && f.status === "reading"
              ? { ...f, status: "error" as const, error: err.message || "Failed to read file" }
              : f
          )
        );
      }
    }
  }, [files.length]);

  const processFile = async (index: number) => {
    const file = files[index];
    if (!file || file.status !== "parsed") return;

    updateFile(index, { status: "inserting", inserted: 0, errors: 0 });

    let totalInserted = 0;
    let totalErrors = 0;

    try {
      for (let i = 0; i < file.records.length; i += BATCH_SIZE) {
        const batch = file.records.slice(i, i + BATCH_SIZE).map((r) => ({
          rssd: r.rssd,
          report_date: r.reportDate,
          bank_name: r.bankName || null,
          metrics: r.metrics,
          source_concepts: r.sourceConcepts,
        }));

        const { data, error } = await supabase.functions.invoke("insert-ubpr-batch", {
          body: { records: batch },
        });

        if (error || !data?.success) {
          totalErrors += batch.length;
        } else {
          totalInserted += data.inserted || batch.length;
          totalErrors += data.errors || 0;
        }

        updateFile(index, { inserted: totalInserted, errors: totalErrors });
      }

      updateFile(index, { status: "done" });
      toast({
        title: "Processing complete",
        description: `${totalInserted} records from ${file.name}`,
      });
    } catch (err: any) {
      updateFile(index, { status: "error", error: err.message });
      toast({ title: "Processing error", description: err.message, variant: "destructive" });
    }
  };

  const processAll = async () => {
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === "parsed") {
        await processFile(i);
      }
    }
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const parsedCount = files.filter((f) => f.status === "parsed").length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link to="/" className="tracking-[0.18em] font-bold uppercase text-accent text-sm hover:opacity-80 transition-opacity">
              PeerSweep
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-medium">Admin: Bulk Data Upload</span>
          </div>
          <Link to="/">
            <Button variant="outline" size="sm" className="gap-1">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          </Link>
        </div>
      </header>

      <main className="container max-w-2xl py-10 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload UBPR Data Files
            </CardTitle>
            <CardDescription>
              Drop XBRL or tab-delimited files. They are parsed in your browser and inserted in batches.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
                dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.multiple = true;
                input.accept = ".xml,.xbrl,.txt,.tsv";
                input.onchange = (e) => {
                  const target = e.target as HTMLInputElement;
                  if (target.files?.length) handleFiles(target.files);
                };
                input.click();
              }}
            >
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium">Drop UBPR files here or click to browse</p>
                <p className="text-xs text-muted-foreground">.xml, .xbrl, .txt, or .tsv files</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {files.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Files ({files.length})</CardTitle>
              {parsedCount > 0 && (
                <Button size="sm" onClick={processAll}>
                  Insert All ({parsedCount})
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {files.map((file, i) => (
                <div key={`${file.name}-${i}`} className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(1)} MB
                        {file.records.length > 0 && ` • ${file.records.length} records parsed`}
                        {file.status === "inserting" && ` • ${file.inserted}/${file.records.length} inserted`}
                        {file.status === "done" && ` • ${file.inserted} inserted`}
                        {file.errors > 0 && ` • ${file.errors} errors`}
                        {file.error && ` • ${file.error}`}
                      </p>
                    </div>
                    {file.status === "reading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {file.status === "parsed" && (
                      <Button size="sm" variant="outline" onClick={() => processFile(i)}>
                        Insert
                      </Button>
                    )}
                    {file.status === "inserting" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {file.status === "done" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                    {file.status === "error" && <AlertCircle className="h-5 w-5 text-destructive" />}
                  </div>
                  {file.status === "inserting" && file.records.length > 0 && (
                    <Progress
                      value={(file.inserted / file.records.length) * 100}
                      className="h-2"
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default AdminUpload;
