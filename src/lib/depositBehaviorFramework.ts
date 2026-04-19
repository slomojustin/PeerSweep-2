import type { BankMetrics } from "@/data/bankData";

export interface FrameworkInputs {
  capital: {
    tier1_leverage_ratio: number;
    total_risk_based_capital: number;
    capital_trend: "increasing" | "stable" | "decreasing";
    peer_percentile: number;
  };
  earnings: {
    net_interest_margin: number;
    nim_trend: "increasing" | "stable" | "decreasing";
    cost_of_funds: number;
    cost_of_funds_trend: "increasing" | "stable" | "decreasing";
    cost_of_funds_vs_peer: "above" | "in_line" | "below";
    roa: number;
    roa_trend: "increasing" | "stable" | "decreasing";
  };
  asset_quality: {
    npa_ratio: number;
    npa_trend: "improving" | "stable" | "deteriorating";
    net_charge_offs: number;
    acl_to_loans: number;
  };
  liquidity: {
    loan_to_deposit_ratio: number;
    ldr_trend: "increasing" | "stable" | "decreasing";
    non_core_funding_dependence: number;
    non_core_trend: "increasing" | "stable" | "decreasing";
    brokered_deposits_ratio: number;
    borrowings_ratio: number;
    borrowings_trend: "increasing" | "stable" | "decreasing";
    liquid_assets_ratio: number;
  };
}

export interface DerivedSignals {
  deposit_need: "low" | "moderate" | "high";
  pricing_posture: "already_competitive" | "becoming_competitive" | "not_rate_competitive";
  growth_capacity: "strong" | "moderate" | "constrained";
  earnings_flexibility: "high" | "moderate" | "pressured";
}

export type BehaviorProfile =
  | "aggressive_deposit_competitor"
  | "rate_competitive_position"
  | "defensive_deposit_gatherer"
  | "relationship_focused_funding"
  | "liquidity_stable_no_urgency"
  | "transition_to_competition";

function detectTrend(values: number[]): "increasing" | "stable" | "decreasing" {
  if (values.length < 2) return "stable";
  const recent = values.slice(0, Math.min(3, values.length));
  const diffs = recent.slice(1).map((v, i) => recent[i] - v); // note: index 0 is most recent
  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  if (avgDiff > 0.05) return "increasing";
  if (avgDiff < -0.05) return "decreasing";
  return "stable";
}

function detectNpaTrend(values: number[]): "improving" | "stable" | "deteriorating" {
  const trend = detectTrend(values);
  if (trend === "decreasing") return "improving"; // lower NPAs = improving
  if (trend === "increasing") return "deteriorating";
  return "stable";
}

export function deriveInputsFromMetrics(
  metrics: BankMetrics[],
  peerAvgCostOfFunds?: number,
  peerAvgRoa?: number
): FrameworkInputs {
  const latest = metrics[0];
  const peerCoF = peerAvgCostOfFunds ?? latest.costOfFunds;
  const peerRoa = peerAvgRoa ?? latest.roaa;

  const cofDiff = latest.costOfFunds - peerCoF;
  const cofVsPeer: "above" | "in_line" | "below" =
    cofDiff > 0.15 ? "above" : cofDiff < -0.15 ? "below" : "in_line";

  return {
    capital: {
      tier1_leverage_ratio: latest.tier1Capital,
      total_risk_based_capital: latest.totalCapital,
      capital_trend: detectTrend(metrics.map((m) => m.tier1Capital)),
      peer_percentile: 50, // default without peer data
    },
    earnings: {
      net_interest_margin: latest.nim,
      nim_trend: detectTrend(metrics.map((m) => m.nim)),
      cost_of_funds: latest.costOfFunds,
      cost_of_funds_trend: detectTrend(metrics.map((m) => m.costOfFunds)),
      cost_of_funds_vs_peer: cofVsPeer,
      roa: latest.roaa,
      roa_trend: detectTrend(metrics.map((m) => m.roaa)),
    },
    asset_quality: {
      npa_ratio: latest.nplRatio,
      npa_trend: detectNpaTrend(metrics.map((m) => m.nplRatio)),
      net_charge_offs: 0,
      acl_to_loans: latest.allowanceRatio,
    },
    liquidity: {
      loan_to_deposit_ratio: latest.loanToDeposit,
      ldr_trend: detectTrend(metrics.map((m) => m.loanToDeposit)),
      non_core_funding_dependence: 0,
      non_core_trend: "stable",
      brokered_deposits_ratio: 0,
      borrowings_ratio: 0,
      borrowings_trend: "stable",
      liquid_assets_ratio: 0,
    },
  };
}

export function deriveSignals(inputs: FrameworkInputs): DerivedSignals {
  // Deposit need
  let depositNeedLevel = 0;
  if (inputs.liquidity.loan_to_deposit_ratio >= 95) depositNeedLevel = 3;
  else if (inputs.liquidity.loan_to_deposit_ratio >= 85) depositNeedLevel = 2;
  else depositNeedLevel = 1;

  if (inputs.liquidity.borrowings_trend === "increasing") depositNeedLevel = Math.min(depositNeedLevel + 1, 3);
  if (inputs.liquidity.non_core_trend === "increasing") depositNeedLevel = Math.min(depositNeedLevel + 1, 3);

  const deposit_need: DerivedSignals["deposit_need"] =
    depositNeedLevel >= 3 ? "high" : depositNeedLevel >= 2 ? "moderate" : "low";

  // Pricing posture
  let pricing_posture: DerivedSignals["pricing_posture"];
  if (inputs.earnings.cost_of_funds_vs_peer === "above") {
    pricing_posture = "already_competitive";
  } else if (
    inputs.earnings.cost_of_funds_vs_peer === "in_line" &&
    inputs.earnings.cost_of_funds_trend === "increasing"
  ) {
    pricing_posture = "becoming_competitive";
  } else {
    pricing_posture = "not_rate_competitive";
  }

  // Growth capacity
  let growth_capacity: DerivedSignals["growth_capacity"];
  if (
    ["stable", "increasing"].includes(inputs.capital.capital_trend) &&
    ["improving", "stable"].includes(inputs.asset_quality.npa_trend)
  ) {
    growth_capacity = "strong";
  } else if (
    inputs.capital.capital_trend === "decreasing" &&
    inputs.asset_quality.npa_trend === "deteriorating"
  ) {
    growth_capacity = "constrained";
  } else {
    growth_capacity = "moderate";
  }

  // Earnings flexibility
  let earnings_flexibility: DerivedSignals["earnings_flexibility"];
  if (inputs.earnings.nim_trend === "decreasing" && inputs.earnings.cost_of_funds_trend === "increasing") {
    earnings_flexibility = "pressured";
  } else if (inputs.earnings.roa_trend !== "decreasing" && inputs.earnings.nim_trend !== "decreasing") {
    earnings_flexibility = "high";
  } else {
    earnings_flexibility = "moderate";
  }

  return { deposit_need, pricing_posture, growth_capacity, earnings_flexibility };
}

export function classifyBehaviorProfile(signals: DerivedSignals): BehaviorProfile {
  if (signals.deposit_need === "high" && signals.earnings_flexibility === "pressured") {
    return "defensive_deposit_gatherer";
  }
  if (signals.deposit_need === "high" && signals.growth_capacity === "strong") {
    return "aggressive_deposit_competitor";
  }
  if (signals.pricing_posture === "already_competitive") {
    return "rate_competitive_position";
  }
  if (signals.pricing_posture === "becoming_competitive") {
    return "transition_to_competition";
  }
  if (signals.deposit_need === "low" && signals.pricing_posture === "not_rate_competitive") {
    return "relationship_focused_funding";
  }
  if (signals.deposit_need === "low") {
    return "liquidity_stable_no_urgency";
  }
  return "relationship_focused_funding";
}

interface QuarterDataLike {
  report_date: string;
  metrics: Record<string, number | null>;
}

export function deriveInputsFromQuarterData(
  quarters: QuarterDataLike[],
  peerAvgCostOfFunds?: number,
): FrameworkInputs {
  const latest = quarters[0].metrics;

  const cof = latest['CALC_COF'] ?? 0;
  const peerCoF = peerAvgCostOfFunds ?? cof;
  const cofDiff = cof - peerCoF;
  const cofVsPeer: "above" | "in_line" | "below" =
    cofDiff > 0.15 ? "above" : cofDiff < -0.15 ? "below" : "in_line";

  const totalLoans = latest['UBPRB528'];
  const totalDeposits = latest['UBPRD154'];
  const ldr =
    totalLoans != null && totalDeposits != null && totalDeposits !== 0
      ? (totalLoans / totalDeposits) * 100
      : 0;

  function trend(code: string): "increasing" | "stable" | "decreasing" {
    return detectTrend(quarters.map(q => q.metrics[code] ?? 0));
  }

  return {
    capital: {
      tier1_leverage_ratio: latest['CALC_T1L'] ?? 0,
      total_risk_based_capital: latest['CALC_RBC'] ?? 0,
      capital_trend: trend('CALC_T1L'),
      peer_percentile: 50,
    },
    earnings: {
      net_interest_margin: latest['CALC_NIM'] ?? 0,
      nim_trend: trend('CALC_NIM'),
      cost_of_funds: cof,
      cost_of_funds_trend: trend('CALC_COF'),
      cost_of_funds_vs_peer: cofVsPeer,
      roa: latest['CALC_ROA'] ?? 0,
      roa_trend: trend('CALC_ROA'),
    },
    asset_quality: {
      npa_ratio: latest['UBPRE130'] ?? 0,
      npa_trend: detectNpaTrend(quarters.map(q => q.metrics['UBPRE130'] ?? 0)),
      net_charge_offs: latest['UBPRE126'] ?? 0,
      acl_to_loans: latest['UBPRE125'] ?? 0,
    },
    liquidity: {
      loan_to_deposit_ratio: ldr,
      ldr_trend: "stable",
      non_core_funding_dependence: 0,
      non_core_trend: "stable",
      brokered_deposits_ratio: latest['CALC_BDR'] ?? 0,
      borrowings_ratio: 0,
      borrowings_trend: "stable",
      liquid_assets_ratio: latest['CALC_LIQ'] ?? 0,
    },
  };
}

export const PROFILE_LABELS: Record<BehaviorProfile, string> = {
  aggressive_deposit_competitor: "Aggressive Deposit Competitor",
  rate_competitive_position: "Rate-Competitive Position",
  defensive_deposit_gatherer: "Defensive Deposit Gatherer",
  relationship_focused_funding: "Relationship-Focused Funding",
  liquidity_stable_no_urgency: "Liquidity Stable — No Urgency",
  transition_to_competition: "Transition to Competition",
};
