import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailCaptureBarProps {
  source: "landing" | "dashboard";
  bankRssd?: string;
  onDismiss?: () => void;
}

const LS_KEY = "ps_email_captured";

export default function EmailCaptureBar({ source, bankRssd, onDismiss }: EmailCaptureBarProps) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "duplicate">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");

    const { error } = await supabase.from("email_signups").insert({
      email: email.trim().toLowerCase(),
      company: company.trim() || null,
      source,
      bank_rssd: bankRssd ?? null,
    });

    if (!error) {
      localStorage.setItem(LS_KEY, "true");
      setStatus("success");
    } else if (error.code === "23505") {
      localStorage.setItem(LS_KEY, "true");
      setStatus("duplicate");
    } else {
      setStatus("idle");
    }
  };

  const isDone = status === "success" || status === "duplicate";

  if (source === "dashboard") {
    return (
      <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          {isDone ? (
            <p className="text-sm font-medium text-accent flex items-center gap-1.5">
              <Check className="h-4 w-4" />
              {status === "duplicate" ? "Already signed up — we'll be in touch." : "You're on the list. We'll share updates as we build."}
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">Enjoying PeerSweep? We're adding new data and features weekly.</p>
              <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2 flex-wrap">
                <Input
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="h-8 text-sm w-52"
                />
                <Input
                  type="text"
                  placeholder="Your bank or company (optional)"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  className="h-8 text-sm w-56"
                />
                <Button type="submit" size="sm" disabled={status === "loading"} className="h-8 bg-accent hover:bg-accent/90 text-white">
                  {status === "loading" ? "Saving…" : "Get updates"}
                </Button>
              </form>
            </>
          )}
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  // Landing variant
  return (
    <div className={cn("rounded-xl border border-border bg-muted/30 px-5 py-4 text-center", isDone && "py-3")}>
      {isDone ? (
        <p className="text-sm font-medium text-accent flex items-center justify-center gap-1.5">
          <Check className="h-4 w-4" />
          {status === "duplicate" ? "Already signed up — we'll be in touch." : "You're on the list. No spam, just updates."}
        </p>
      ) : (
        <>
          <p className="text-sm font-semibold text-foreground mb-0.5">Stay in the loop</p>
          <p className="text-xs text-muted-foreground mb-3">We're building PeerSweep for banking teams. No spam, just progress updates.</p>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center gap-2 justify-center">
            <Input
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-9 text-sm max-w-[220px]"
            />
            <Input
              type="text"
              placeholder="Your bank or company (optional)"
              value={company}
              onChange={e => setCompany(e.target.value)}
              className="h-9 text-sm max-w-[240px]"
            />
            <Button type="submit" size="sm" disabled={status === "loading"} className="h-9 bg-accent hover:bg-accent/90 text-white">
              {status === "loading" ? "Saving…" : "Notify me"}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
