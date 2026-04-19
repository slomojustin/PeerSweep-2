export interface UBPRConceptDef {
  label: string;
  section: string;
  format: 'dollar' | 'ratio' | 'count' | 'text';
  order: number;
}

/** Organised by FFIEC UBPR report sections */
export const ubprConceptMap: Record<string, UBPRConceptDef> = {
  // ── Performance Ratios ──────────────────────────────────────
  CALC_ROA:  { label: 'Return on Assets (ROAA)',        section: 'Performance Ratios', format: 'ratio',  order: 1 },
  CALC_ROE:  { label: 'Return on Equity (ROAE)',         section: 'Performance Ratios', format: 'ratio',  order: 2 },
  CALC_EFF:  { label: 'Efficiency Ratio',                section: 'Performance Ratios', format: 'ratio',  order: 3 },
  CALC_NIM:  { label: 'Net Interest Margin',             section: 'Performance Ratios', format: 'ratio',  order: 4 },
  CALC_NIS:  { label: 'Net Interest Spread',             section: 'Performance Ratios', format: 'ratio',  order: 5 },
  CALC_NIA:  { label: 'Noninterest Income to Assets',    section: 'Performance Ratios', format: 'ratio',  order: 6 },
  CALC_NEA:  { label: 'Noninterest Expense to Assets',   section: 'Performance Ratios', format: 'ratio',  order: 7 },
  CALC_COF:  { label: 'Cost of Funds',                   section: 'Performance Ratios', format: 'ratio',  order: 8 },
  CALC_LGR:  { label: 'Loan Growth Rate',                section: 'Performance Ratios', format: 'ratio',  order: 9 },

  // ── Summary Ratios ──────────────────────────────────────────
  UBPRD660: { label: 'Net Income',                            section: 'Summary Ratios', format: 'dollar', order: 1 },
  UBPRD661: { label: 'Net Income Attributable to Bank',       section: 'Summary Ratios', format: 'dollar', order: 2 },
  UBPRD662: { label: 'Average Assets',                        section: 'Summary Ratios', format: 'dollar', order: 3 },
  UBPRD653: { label: 'Net Interest Income (FTE)',              section: 'Summary Ratios', format: 'dollar', order: 4 },
  UBPRD655: { label: 'Noninterest Income',                    section: 'Summary Ratios', format: 'dollar', order: 5 },
  UBPRE119: { label: 'Noninterest Expense',                   section: 'Summary Ratios', format: 'dollar', order: 6 },
  UBPRD672: { label: 'Noncurrent Loans & Leases',             section: 'Summary Ratios', format: 'dollar', order: 7 },
  UBPRD670: { label: 'Provision for Loan & Lease Losses',     section: 'Summary Ratios', format: 'dollar', order: 8 },

  // ── Balance Sheet – Assets ──────────────────────────────────
  UBPR2170:  { label: 'Total Assets',                    section: 'Balance Sheet – Assets', format: 'dollar', order: 1 },
  UBPR0071:  { label: 'Total Earning Assets',            section: 'Balance Sheet – Assets', format: 'dollar', order: 2 },
  CALC_AEA:  { label: 'Average Earning Assets',          section: 'Balance Sheet – Assets', format: 'dollar', order: 3 },
  UBPRB528:  { label: 'Total Loans & Leases',            section: 'Balance Sheet – Assets', format: 'dollar', order: 4 },
  UBPRD142:  { label: 'Real Estate Loans',               section: 'Balance Sheet – Assets', format: 'dollar', order: 5 },
  UBPRD143:  { label: 'Commercial & Industrial Loans',   section: 'Balance Sheet – Assets', format: 'dollar', order: 6 },
  UBPRD146:  { label: 'Consumer Loans',                  section: 'Balance Sheet – Assets', format: 'dollar', order: 7 },
  UBPRB538:  { label: 'Loans to Individuals',            section: 'Balance Sheet – Assets', format: 'dollar', order: 8 },
  UBPR2122:  { label: 'Total Securities',                section: 'Balance Sheet – Assets', format: 'dollar', order: 9 },
  UBPR2130:  { label: 'Fed Funds Sold & Reverse Repos',  section: 'Balance Sheet – Assets', format: 'dollar', order: 10 },
  UBPR2145:  { label: 'Trading Account Assets',          section: 'Balance Sheet – Assets', format: 'dollar', order: 11 },
  UBPRD191:  { label: 'Intangible Assets',               section: 'Balance Sheet – Assets', format: 'dollar', order: 12 },
  UBPR1773:  { label: 'Other Assets',                    section: 'Balance Sheet – Assets', format: 'dollar', order: 13 },

  // ── Balance Sheet – Liabilities & Capital ───────────────────
  UBPRD154:  { label: 'Total Deposits',                  section: 'Balance Sheet – Liabilities & Capital', format: 'dollar', order: 1 },
  UBPRD175:  { label: 'Domestic Deposits',               section: 'Balance Sheet – Liabilities & Capital', format: 'dollar', order: 2 },
  UBPRD176:  { label: 'Foreign Deposits',                section: 'Balance Sheet – Liabilities & Capital', format: 'dollar', order: 3 },
  CALC_DDM:  { label: 'Demand Deposits',                 section: 'Balance Sheet – Liabilities & Capital', format: 'dollar', order: 4 },
  CALC_TD250:{ label: 'Time Deposits > $250K',           section: 'Balance Sheet – Liabilities & Capital', format: 'dollar', order: 5 },
  CALC_CDR:  { label: 'Core Deposit Ratio',              section: 'Balance Sheet – Liabilities & Capital', format: 'ratio',  order: 6 },
  CALC_BDR:  { label: 'Brokered Deposit Ratio',          section: 'Balance Sheet – Liabilities & Capital', format: 'ratio',  order: 7 },
  UBPRD169:  { label: 'Other Borrowed Funds',            section: 'Balance Sheet – Liabilities & Capital', format: 'dollar', order: 8 },
  UBPRD253:  { label: 'Subordinated Debt',               section: 'Balance Sheet – Liabilities & Capital', format: 'dollar', order: 9 },
  UBPR2365:  { label: 'Total Equity Capital',            section: 'Balance Sheet – Liabilities & Capital', format: 'dollar', order: 10 },
  UBPR2366:  { label: 'Common Equity',                   section: 'Balance Sheet – Liabilities & Capital', format: 'dollar', order: 11 },
  UBPRD211:  { label: 'Tier 1 Capital',                  section: 'Balance Sheet – Liabilities & Capital', format: 'dollar', order: 12 },
  UBPRD217:  { label: 'Total Risk-Based Capital',        section: 'Balance Sheet – Liabilities & Capital', format: 'dollar', order: 13 },

  // ── Income Statement ────────────────────────────────────────
  UBPRD081:  { label: 'Total Interest Income',           section: 'Income Statement', format: 'dollar', order: 1 },
  UBPRD113:  { label: 'Total Interest Expense',          section: 'Income Statement', format: 'dollar', order: 2 },
  UBPRD126:  { label: 'Net Interest Income',             section: 'Income Statement', format: 'dollar', order: 3 },
  UBPRD233:  { label: 'Total Noninterest Income',        section: 'Income Statement', format: 'dollar', order: 4 },
  UBPRD296:  { label: 'Total Noninterest Expense',       section: 'Income Statement', format: 'dollar', order: 5 },
  UBPRD491:  { label: 'Pre-Tax Net Operating Income',    section: 'Income Statement', format: 'dollar', order: 6 },
  UBPRD503:  { label: 'Applicable Income Taxes',         section: 'Income Statement', format: 'dollar', order: 7 },
  UBPRD514:  { label: 'Net Operating Income',            section: 'Income Statement', format: 'dollar', order: 8 },
  UBPRD429:  { label: 'Pre-Provision Net Revenue',       section: 'Income Statement', format: 'dollar', order: 9 },

  // ── Interest Income Detail ──────────────────────────────────
  UBPRD079:  { label: 'Int Inc – Loans & Leases',        section: 'Interest Income Detail', format: 'dollar', order: 1 },
  UBPRD078:  { label: 'Int Inc – Balances Due',          section: 'Interest Income Detail', format: 'dollar', order: 2 },
  UBPRD620:  { label: 'Int Inc – Securities',            section: 'Interest Income Detail', format: 'dollar', order: 3 },
  UBPRD623:  { label: 'Int Inc – Trading Assets',        section: 'Interest Income Detail', format: 'dollar', order: 4 },

  // ── Interest Expense Detail ─────────────────────────────────
  UBPRD602:  { label: 'Int Exp – Total Deposits',        section: 'Interest Expense Detail', format: 'dollar', order: 1 },
  UBPRD632:  { label: 'Int Exp – Other Borrowed Funds',  section: 'Interest Expense Detail', format: 'dollar', order: 2 },
  UBPRD631:  { label: 'Int Exp – Subordinated Notes',    section: 'Interest Expense Detail', format: 'dollar', order: 3 },

  // ── Loan Mix & Quality ──────────────────────────────────────
  UBPRE131:  { label: 'Total Loans & Leases (Gross)',    section: 'Loan Mix & Quality', format: 'dollar', order: 1 },
  UBPRE130:  { label: 'Noncurrent Loans & Leases',       section: 'Loan Mix & Quality', format: 'dollar', order: 2 },
  UBPRE125:  { label: 'Allowance for Loan Losses',       section: 'Loan Mix & Quality', format: 'dollar', order: 3 },
  UBPRE126:  { label: 'Net Charge-Offs',                 section: 'Loan Mix & Quality', format: 'dollar', order: 4 },
  UBPRE129:  { label: 'Recoveries',                      section: 'Loan Mix & Quality', format: 'dollar', order: 5 },

  // ── Capital Adequacy ────────────────────────────────────────
  UBPRK431:  { label: 'Total Risk-Weighted Assets',      section: 'Capital Adequacy', format: 'dollar', order: 1 },
  UBPRK434:  { label: 'Tier 1 Risk-Based Capital',       section: 'Capital Adequacy', format: 'dollar', order: 2 },
  UBPRK437:  { label: 'Common Equity Tier 1 Capital',    section: 'Capital Adequacy', format: 'dollar', order: 3 },
  UBPRK426:  { label: 'Total Risk-Based Capital (Amt)',  section: 'Capital Adequacy', format: 'dollar', order: 4 },
  CALC_T1L:  { label: 'Tier 1 Leverage Ratio',           section: 'Capital Adequacy', format: 'ratio',  order: 5 },
  CALC_RBC:  { label: 'Total Risk-Based Capital Ratio',  section: 'Capital Adequacy', format: 'ratio',  order: 6 },

  // ── Liquidity ───────────────────────────────────────────────
  UBPRD665:  { label: 'Total Deposits (Avg)',            section: 'Liquidity', format: 'dollar', order: 1 },
  UBPRD663:  { label: 'Total Liabilities (Avg)',         section: 'Liquidity', format: 'dollar', order: 2 },
  UBPRE878:  { label: 'Total Equity (Avg)',              section: 'Liquidity', format: 'dollar', order: 3 },
  CALC_LIQ:  { label: 'Liquidity Ratio',                 section: 'Liquidity', format: 'ratio',  order: 4 },
};

/** Return the concept map entries grouped by section, sorted by order */
export function getConceptsBySection(): Record<string, Array<{ code: string } & UBPRConceptDef>> {
  const sections: Record<string, Array<{ code: string } & UBPRConceptDef>> = {};
  for (const [code, def] of Object.entries(ubprConceptMap)) {
    if (!sections[def.section]) sections[def.section] = [];
    sections[def.section].push({ code, ...def });
  }
  for (const items of Object.values(sections)) {
    items.sort((a, b) => a.order - b.order);
  }
  return sections;
}

/** Ordered section names matching official UBPR report structure */
export const sectionOrder = [
  'Performance Ratios',
  'Summary Ratios',
  'Balance Sheet – Assets',
  'Balance Sheet – Liabilities & Capital',
  'Income Statement',
  'Interest Income Detail',
  'Interest Expense Detail',
  'Loan Mix & Quality',
  'Capital Adequacy',
  'Liquidity',
];
