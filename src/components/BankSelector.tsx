import { useState, useEffect, useMemo } from "react";
import { loadBanks, type BankInfo } from "@/data/bankData";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface BankSelectorProps {
  label: string;
  description: string;
  selected: BankInfo[];
  onSelect: (banks: BankInfo[]) => void;
  multiple?: boolean;
  maxSelections?: number;
}

const MAX_RESULTS = 150;

const BankSelector = ({ label, description, selected, onSelect, multiple = false, maxSelections = 25 }: BankSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [allBanks, setAllBanks] = useState<BankInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    loadBanks().then(banks => {
      setAllBanks(banks);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allBanks.slice(0, MAX_RESULTS);

    const STATE_ABBREVS: Record<string, string> = {
      al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california",
      co: "colorado", ct: "connecticut", de: "delaware", fl: "florida", ga: "georgia",
      hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa",
      ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland",
      ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi",
      mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire",
      nj: "new jersey", nm: "new mexico", ny: "new york", nc: "north carolina",
      nd: "north dakota", oh: "ohio", ok: "oklahoma", or: "oregon", pa: "pennsylvania",
      ri: "rhode island", sc: "south carolina", sd: "south dakota", tn: "tennessee",
      tx: "texas", ut: "utah", vt: "vermont", va: "virginia", wa: "washington",
      wv: "west virginia", wi: "wisconsin", wy: "wyoming", dc: "district of columbia",
    };

    const normalize = (s: string) =>
      s.replace(/\b1st\b/g, "first").replace(/\bfst\b/g, "first")
       .replace(/\bnatl\b/g, "national").replace(/\bnat'l\b/g, "national")
       .replace(/\bfed\b/g, "federal").replace(/\bbk\b/g, "bank")
       .replace(/\bsav\b/g, "savings").replace(/\bn\.a\.?/g, "");

    const qNorm = normalize(q);
    const tokens = qNorm.split(/\s+/).filter(Boolean);

    const scored: { bank: BankInfo; score: number }[] = [];

    for (const bank of allBanks) {
      const nameLow = normalize(bank.name.toLowerCase());
      const nameWords = nameLow.split(/\s+/);
      const cityWords = bank.city.toLowerCase().split(/\s+/);
      const stateLow = bank.state.toLowerCase();
      const stateFullLow = STATE_ABBREVS[stateLow] ?? stateLow;

      const tokenMatchesName = (token: string) => {
        const se = STATE_ABBREVS[token] ?? token;
        return nameWords.some(w => w === token || w.startsWith(token) || w.includes(token))
          || nameLow.includes(se);
      };
      const tokenMatchesMeta = (token: string) => {
        const se = STATE_ABBREVS[token] ?? token;
        return bank.rssd === token
          || cityWords.some(w => w === token || w.startsWith(token))
          || stateLow === token
          || stateFullLow.includes(token)
          || stateFullLow.includes(se);
      };

      const allMatch = tokens.every(t => tokenMatchesName(t) || tokenMatchesMeta(t));
      if (!allMatch) continue;

      const nameMatchCount = tokens.filter(t => tokenMatchesName(t)).length;
      const cityOnlyMatch = nameMatchCount === 0;

      let score = 0;

      // Name-based scoring for the first token
      const t0 = tokens[0];
      if (nameLow.startsWith(t0)) score += 100;
      else if (nameWords[0] === t0) score += 90;        // first word is exact match
      else if (nameWords.some(w => w === t0)) score += 75;  // any word exact match
      else if (nameWords.some(w => w.startsWith(t0))) score += 50; // word prefix

      // Full query bonus
      if (nameLow.startsWith(qNorm)) score += 50;
      if (nameLow === qNorm) score += 200;

      // Penalize results where name doesn't match at all (city/state/RSSD only)
      if (cityOnlyMatch) score -= 40;

      // Shorter names rank slightly higher (more specific matches)
      score -= bank.name.length * 0.1;

      scored.push({ bank, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_RESULTS).map(s => s.bank);
  }, [search, allBanks]);

  const handleSelect = (bank: BankInfo) => {
    if (multiple) {
      const isSelected = selected.some(b => b.rssd === bank.rssd);
      if (isSelected) {
        onSelect(selected.filter(b => b.rssd !== bank.rssd));
      } else if (selected.length < maxSelections) {
        onSelect([...selected, bank]);
      }
      // Don't clear search — keep the list visible so the user can keep selecting
    } else {
      onSelect([bank]);
      setOpen(false);
      setSearch("");
    }
  };

  const removeBank = (rssd: string) => {
    onSelect(selected.filter(b => b.rssd !== rssd));
  };

  return (
    <div className="space-y-2">
      <div>
        <label className="text-sm font-medium text-foreground">{label}</label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-auto min-h-[40px] text-left"
          >
            {selected.length === 0 ? (
              <span className="text-muted-foreground">Select bank{multiple ? 's' : ''}...</span>
            ) : !multiple ? (
              <span>{selected[0].name} | {selected[0].rssd} | {selected[0].city}, {selected[0].state}</span>
            ) : (
              <span className="text-muted-foreground">{selected.length} bank{selected.length > 1 ? 's' : ''} selected</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[460px] p-0" align="start">
          <div className="p-2">
            <Input
              placeholder="Search by name, RSSD, city, or state..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <ScrollArea className="h-[300px]">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground text-center">Loading banks...</p>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">No bank found.</p>
            ) : (
              <div className="p-1">
                {filtered.map((bank) => (
                  <button
                    key={bank.rssd}
                    onClick={() => handleSelect(bank)}
                    className="flex items-center w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent/10 text-left"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        selected.some(b => b.rssd === bank.rssd) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="font-medium truncate">{bank.name}</span>
                    <span className="ml-2 text-muted-foreground text-xs whitespace-nowrap">
                      | {bank.rssd} | {bank.city}, {bank.state}
                    </span>
                  </button>
                ))}
                <p className="p-2 text-xs text-muted-foreground text-center">
                  {search.trim() === ""
                    ? `Showing ${filtered.length} of 4,920 banks — type to search`
                    : filtered.length >= MAX_RESULTS
                    ? `Showing first ${MAX_RESULTS} results — refine your search`
                    : `${filtered.length} result${filtered.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
      {multiple && selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selected.map((bank) => (
            <Badge key={bank.rssd} variant="secondary" className="gap-1 pr-1">
              {bank.name}
              <button onClick={() => removeBank(bank.rssd)} className="ml-1 rounded-full hover:bg-muted">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

export default BankSelector;
