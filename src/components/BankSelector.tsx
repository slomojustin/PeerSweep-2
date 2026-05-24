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
    if (!search.trim()) return allBanks.slice(0, MAX_RESULTS);
    const q = search.toLowerCase();
    const results: BankInfo[] = [];
    for (const bank of allBanks) {
      if (
        bank.name.toLowerCase().includes(q) ||
        bank.rssd.includes(q) ||
        bank.city.toLowerCase().includes(q) ||
        bank.state.toLowerCase().includes(q)
      ) {
        results.push(bank);
        if (results.length >= MAX_RESULTS) break;
      }
    }
    return results;
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
                {filtered.length >= MAX_RESULTS && (
                  <p className="p-2 text-xs text-muted-foreground text-center">
                    {search.trim() === "" ? `Showing first ${MAX_RESULTS} banks — type to search all 4,920` : `Showing first ${MAX_RESULTS} results — refine your search`}
                  </p>
                )}
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
