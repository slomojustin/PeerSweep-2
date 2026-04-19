import { useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import { getConceptsBySection, sectionOrder } from "@/lib/ubprConceptMap";

interface QuarterData {
  report_date: string;
  metrics: Record<string, number | string>;
}

interface Props {
  bankName: string;
  rssd: string;
  quarters: QuarterData[];
  selectedQuarters?: string[];
}

// ── Formatting ────────────────────────────────────────────────────────────────

function formatValue(raw: unknown, fmt: string): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  const num = typeof raw === "string" ? parseFloat(raw) : (raw as number);
  if (isNaN(num)) return String(raw);
  if (fmt === "dollar") return Math.round(num / 1000).toLocaleString("en-US");
  if (fmt === "ratio") return num.toFixed(2) + "%";
  if (fmt === "count") return Math.round(num).toLocaleString("en-US");
  return String(raw);
}

function formatQuarterLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const month = d.getMonth();
  const year = d.getFullYear();
  const q = month < 3 ? "Q1" : month < 6 ? "Q2" : month < 9 ? "Q3" : "Q4";
  return `${q} ${year}`;
}

// ── Color coding ──────────────────────────────────────────────────────────────

type ColorHint = "higher-good" | "lower-good" | "none";

const RATIO_COLOR_CONFIG: Record<string, { hint: ColorHint; greenThreshold: number; redThreshold: number }> = {
  CALC_ROA: { hint: "higher-good", greenThreshold: 1.0,  redThreshold: 0.5  },
  // CALC_ROE: { hint: "higher-good", greenThreshold: 8.0, redThreshold: 4.0 }, // TODO: fix 0-value data issue post-demo
  CALC_NIM: { hint: "higher-good", greenThreshold: 3.0,  redThreshold: 2.0  },
  CALC_EFF: { hint: "lower-good",  greenThreshold: 60.0, redThreshold: 75.0 },
  UBPRE130: { hint: "lower-good",  greenThreshold: 0.5,  redThreshold: 1.5  },
  UBPRD670: { hint: "lower-good",  greenThreshold: 0.5,  redThreshold: 1.5  },
};

function getRatioColorClass(code: string, raw: unknown): string {
  const config = RATIO_COLOR_CONFIG[code];
  if (!config || raw === null || raw === undefined || raw === "") return "";
  const num = typeof raw === "string" ? parseFloat(raw) : (raw as number);
  if (isNaN(num)) return "";

  if (config.hint === "higher-good") {
    if (num >= config.greenThreshold) return "text-green-600 font-semibold";
    if (num < config.redThreshold) return "text-red-500 font-semibold";
  } else {
    if (num <= config.greenThreshold) return "text-green-600 font-semibold";
    if (num > config.redThreshold) return "text-red-500 font-semibold";
  }
  return "";
}

// ── KPI Tiles ─────────────────────────────────────────────────────────────────

const KPI_TILES = [
  { label: "Return on Assets",    code: "CALC_ROA",  fmt: "ratio"  },
  // { label: "Return on Equity", code: "CALC_ROE", fmt: "ratio" }, // TODO: fix 0-value data issue post-demo
  { label: "Net Interest Margin", code: "CALC_NIM",  fmt: "ratio"  },
  { label: "Efficiency Ratio",    code: "CALC_EFF",  fmt: "ratio"  },
  { label: "Total Assets",        code: "UBPR2170",  fmt: "dollar" },
  { label: "Total Deposits",      code: "UBPRD154",  fmt: "dollar" },
];

interface KpiStripProps {
  metrics: Record<string, number | string>;
}

const KpiStrip = ({ metrics }: KpiStripProps) => (
  <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
    {KPI_TILES.map(({ label, code, fmt }) => {
      const raw = metrics[code];
      const display = formatValue(raw, fmt);
      const colorClass = fmt === "ratio" ? getRatioColorClass(code, raw) : "";
      return (
        <div
          key={code}
          className="bg-muted/50 rounded-xl p-4 border flex flex-col gap-1"
        >
          <span className="text-xs text-muted-foreground leading-tight">{label}</span>
          <span className={`text-lg font-bold leading-tight ${colorClass || "text-foreground"}`}>
            {display}
          </span>
        </div>
      );
    })}
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

const UBPRReportPreview = ({ bankName, rssd, quarters, selectedQuarters }: Props) => {
  const [activeSection, setActiveSection] = useState<string>("All");

  const allSorted = [...quarters].sort((a, b) => b.report_date.localeCompare(a.report_date));
  const sorted =
    selectedQuarters && selectedQuarters.length > 0
      ? allSorted.filter((q) => selectedQuarters.includes(formatQuarterLabel(q.report_date)))
      : allSorted.slice(0, 5);

  const quarterLabels = sorted.map((q) => formatQuarterLabel(q.report_date));
  const conceptsBySection = getConceptsBySection();
  const mostRecent = sorted[0]?.metrics ?? {};

  // Compute which sections have visible data
  const visibleSections = sectionOrder.filter((sectionName) => {
    const items = conceptsBySection[sectionName];
    if (!items) return false;
    return items.some((item) =>
      sorted.some(
        (q) => q.metrics[item.code] !== undefined && q.metrics[item.code] !== null
      )
    );
  });

  const sectionsToRender =
    activeSection === "All"
      ? visibleSections
      : visibleSections.filter((s) => s === activeSection);

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="text-center space-y-1 pb-4 border-b-2 border-primary">
        <h2 className="text-lg font-bold text-foreground tracking-tight">
          Uniform Bank Performance Report (UBPR)
        </h2>
        <p className="text-sm text-muted-foreground">
          {bankName} &bull; RSSD #{rssd}
        </p>
        <p className="text-xs text-muted-foreground">
          Report generated{" "}
          {new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}{" "}
          &bull; Dollar amounts in thousands
        </p>
      </div>

      {/* KPI Tiles */}
      {sorted.length > 0 && <KpiStrip metrics={mostRecent} />}

      {/* Section Filter Tab Bar */}
      {visibleSections.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-2 border-b mb-6 scrollbar-hide">
          {["All", ...visibleSections].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSection(tab)}
              className={
                activeSection === tab
                  ? "bg-primary text-primary-foreground rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap shrink-0"
                  : "text-muted-foreground hover:text-foreground px-4 py-1.5 text-sm rounded-full transition-colors whitespace-nowrap shrink-0"
              }
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* Sections */}
      {sectionsToRender.map((sectionName) => {
        const items = conceptsBySection[sectionName];
        if (!items) return null;

        const visibleItems = items.filter((item) =>
          sorted.some(
            (q) =>
              q.metrics[item.code] !== undefined &&
              q.metrics[item.code] !== null
          )
        );
        if (visibleItems.length === 0) return null;

        return (
          <Card key={sectionName} className="overflow-hidden">
            <div className="bg-primary px-4 py-2 sticky top-0 z-10">
              <h3 className="text-sm font-semibold text-primary-foreground">
                {sectionName}
              </h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[220px] text-xs font-semibold">
                    Line Item
                  </TableHead>
                  {quarterLabels.map((label) => (
                    <TableHead
                      key={label}
                      className="text-right text-xs font-semibold"
                    >
                      {label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleItems.map((item, idx) => (
                  <TableRow
                    key={item.code}
                    className={idx % 2 === 0 ? "" : "bg-muted/30"}
                  >
                    <TableCell className="text-xs font-medium py-1.5 px-4">
                      {item.label}
                    </TableCell>
                    {sorted.map((q) => {
                      const raw = q.metrics[item.code];
                      const colorClass =
                        item.format === "ratio"
                          ? getRatioColorClass(item.code, raw)
                          : "";
                      return (
                        <TableCell
                          key={q.report_date}
                          className={`text-right text-xs py-1.5 px-4 tabular-nums ${colorClass}`}
                        >
                          {formatValue(raw, item.format)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        );
      })}
    </div>
  );
};

export default UBPRReportPreview;
