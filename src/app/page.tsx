"use client";

import { useEffect, useMemo, useState } from "react";

type TxStatus =
  | "PENDING"
  | "SUCCESS"
  | "FAILED_CONFIRMED"
  | "REVERSAL_PENDING"
  | "REVERSED"
  | "REVIEW_REQUIRED"
  | "REVERSAL_FAILED";

type IncidentStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";
type Priority = "P1" | "P2" | "P3";
type Tab =
  | "Overview"
  | "Incidents"
  | "Incident Detail"
  | "Transaction Investigation"
  | "Audit Trail"
  | "Bank Policies"
  | "Integration Layer";

type ReversalPolicy = {
  mode: "manual" | "automatic";
  maxAmount: number;
  allowedChannels: string[];
  requireConfirmedFailure: true;
  blockOnSuccessSignal: true;
  preventDuplicateReversals: true;
  trendMinimumCount: number;
  trendWindowMinutes: number;
};

type ResponderNotification = {
  id: string;
  incidentId: string;
  recipient: string;
  title: string;
  message: string;
  channel: "In-app demo";
  timestamp: string;
};

type ReversalAdapterMode = "existing" | "blueprint";

type Transaction = {
  id: number;
  reference: string;
  amount: number;
  currency: string;
  channel: string;
  service: string;
  sender: string;
  recipient: string;
  status: TxStatus;
  createdAt: string;
  updatedAt: string;
  evidence: string[];
  history: string[];
  stack: "Core-API" | "Card-Host" | "Settlement" | "Gateway";
  errorCode: string;
  operatorNote?: string;
  isEligible: boolean;
  reversalReference?: string;
};

type Incident = {
  id: string;
  title: string;
  service: string;
  status: IncidentStatus;
  priority: Priority;
  detectedAt: string;
  deadline: string;
  owner: string;
  suspectedCause: string;
  confidence: number;
  transactionIds: number[];
  summary: string;
  notes: string;
};

type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  timestamp: string;
  previousState: string;
  newState: string;
  details: string;
};

const tabs: Tab[] = [
  "Overview",
  "Incidents",
  "Incident Detail",
  "Transaction Investigation",
  "Audit Trail",
  "Bank Policies",
  "Integration Layer",
];

const defaultPolicy: ReversalPolicy = {
  mode: "manual",
  maxAmount: 100000,
  allowedChannels: ["Mobile app", "Internet banking", "POS"],
  requireConfirmedFailure: true,
  blockOnSuccessSignal: true,
  preventDuplicateReversals: true,
  trendMinimumCount: 4,
  trendWindowMinutes: 5,
};

const responders = ["Amina Okafor · Payments Ops", "Samuel Nduka · On-call", "Chika Eze · Mobile Platform"];

const statusMeta: Record<TxStatus, { label: string; tone: string }> = {
  PENDING: { label: "Pending", tone: "status pending" },
  SUCCESS: { label: "Success", tone: "status success" },
  FAILED_CONFIRMED: { label: "Failed confirmed", tone: "status failed" },
  REVERSAL_PENDING: { label: "Reversal pending", tone: "status warning" },
  REVERSED: { label: "Reversed", tone: "status reversed" },
  REVIEW_REQUIRED: { label: "Review required", tone: "status review" },
  REVERSAL_FAILED: { label: "Reversal failed", tone: "status failed" },
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);

const isNearDeadline = (incident: Incident) => {
  const hoursLeft = (new Date(incident.deadline).getTime() - new Date("2026-10-15T15:00:00Z").getTime()) / (1000 * 60 * 60);
  return hoursLeft < 8 && hoursLeft > 0;
};

const hasPositiveSuccessSignal = (signals: string[]) => signals.some((signal) => {
  const normalized = signal.toLowerCase();
  if (/\bno\s+(?:later\s+)?(?:confirmed\s+)?(?:successful\s+)?completion\b|\bno\s+(?:later\s+)?success\b|\bwithout\s+(?:a\s+)?(?:confirmed\s+)?success\b/.test(normalized)) return false;
  return /(?:payment|funds|ledger|settlement|status event|acquirer).{0,50}(?:confirmed|confirms|successful|succeeded|success)/.test(normalized);
});

type TrendCluster = {
  service: string;
  signature: string;
  transactions: Transaction[];
  firstSeen: string;
  lastSeen: string;
};

function detectTransactionTrends(transactions: Transaction[], minimumCount: number, windowMinutes: number): TrendCluster[] {
  const grouped = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (!["FAILED_CONFIRMED", "PENDING", "REVIEW_REQUIRED"].includes(tx.status)) continue;
    const key = `${tx.service}::${tx.errorCode}`;
    grouped.set(key, [...(grouped.get(key) ?? []), tx]);
  }

  const clusters: TrendCluster[] = [];
  for (const [key, entries] of grouped) {
    const sorted = [...entries].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    let left = 0;
    let bestWindow: Transaction[] = [];
    for (let right = 0; right < sorted.length; right += 1) {
      while (Date.parse(sorted[right].createdAt) - Date.parse(sorted[left].createdAt) > windowMinutes * 60_000) left += 1;
      const window = sorted.slice(left, right + 1);
      if (window.length > bestWindow.length) bestWindow = window;
    }
    if (bestWindow.length < minimumCount) continue;
    const [service, signature] = key.split("::");
    clusters.push({ service, signature, transactions: bestWindow, firstSeen: bestWindow[0].createdAt, lastSeen: bestWindow[bestWindow.length - 1].createdAt });
  }
  return clusters.sort((a, b) => {
    const aSdkTrend = a.signature.includes("SDK") || a.service.includes("SDK");
    const bSdkTrend = b.signature.includes("SDK") || b.service.includes("SDK");
    return Number(bSdkTrend) - Number(aSdkTrend) || b.transactions.length - a.transactions.length;
  });
}

function getPolicyEligibilityIssues(transaction: Transaction, policy: ReversalPolicy): string[] {
  const issues: string[] = [];
  if (policy.requireConfirmedFailure && (transaction.status !== "FAILED_CONFIRMED" || !transaction.isEligible)) {
    issues.push("Authoritative confirmed-failure evidence is required.");
  }
  if (policy.blockOnSuccessSignal && (transaction.status === "SUCCESS" || hasPositiveSuccessSignal([...transaction.evidence, ...transaction.history]))) {
    issues.push("A successful completion signal blocks reversal.");
  }
  if (policy.preventDuplicateReversals && ["REVERSAL_PENDING", "REVERSED"].includes(transaction.status)) {
    issues.push("A reversal is already pending or completed for this reference.");
  }
  if (transaction.amount > policy.maxAmount) {
    issues.push(`Amount exceeds the configured limit of ${formatCurrency(policy.maxAmount)}.`);
  }
  if (!policy.allowedChannels.includes(transaction.channel)) {
    issues.push(`${transaction.channel} is not included in the policy's allowed channels.`);
  }
  return issues;
}

function getEligibilityExplanation(transaction: Transaction, policy: ReversalPolicy): string {
  if (transaction.status === "SUCCESS") return "Do not reverse: the latest evidence confirms this payment succeeded. Keep the successful transfer intact.";
  if (transaction.status === "PENDING") return "Not ready: the bank or processor has not confirmed the final outcome. Wait for status evidence; a timeout or missing response is not proof of failure.";
  if (transaction.status === "REVIEW_REQUIRED") return "Manual review required: the available evidence is incomplete, conflicting, or diagnostic only. Resolve the payment outcome before considering reversal.";
  if (transaction.status === "REVERSAL_PENDING") return `A reversal request is already pending${transaction.reversalReference ? ` (${transaction.reversalReference})` : ""}. Wait for the bank/processor response; a second request is blocked.`;
  if (transaction.status === "REVERSED") return `This transfer has already been reversed${transaction.reversalReference ? ` (${transaction.reversalReference})` : ""}. It is complete and cannot be reversed again.`;
  if (transaction.status === "REVERSAL_FAILED") return "The previous reversal attempt failed. Investigate the bank response and reconcile the ledger before deciding whether a retry is permitted.";
  const issues = getPolicyEligibilityIssues(transaction, policy);
  if (issues.length) return `Policy blocked this confirmed failure: ${issues.join(" ")}`;
  return "Eligible: authoritative failure evidence is present, no successful completion or duplicate reversal was found, and the amount/channel satisfy the saved policy.";
}

type IconName = "overview" | "incidents" | "detail" | "transactions" | "audit" | "activity" | "policy" | "integration";

function AppIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, string[]> = {
    overview: ["M3 3h7v7H3z", "M14 3h7v4h-7z", "M14 10h7v11h-7z", "M3 14h7v7H3z"],
    incidents: ["M12 9v4", "M12 17h.01", "M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3l-7.5-13.1a2 2 0 0 0-3.4 0Z"],
    detail: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
    transactions: ["M7 7h14", "m17 3 4 4-4 4", "M17 17H3", "m7 13-4 4 4 4"],
    audit: ["M8 4h12v17H4V4h2", "M8 2h8v4H8z", "M8 11h8", "M8 15h6"],
    activity: ["M22 12h-4l-3 9L9 3l-3 9H2"],
    policy: ["M12 3 4.5 6v5.5c0 4.5 3.2 7.8 7.5 9.5 4.3-1.7 7.5-5 7.5-9.5V6L12 3Z", "m9 12 2 2 4-4"],
    integration: ["M8 7h8", "M8 17h8", "M7 4H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z", "M17 14h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Z", "M17 4h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", "M7 14H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2Z"],
  };

  return (
    <svg aria-hidden="true" className="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name].map((path) => <path key={path} d={path} />)}
    </svg>
  );
}

function buildDemoData() {
  const transactions: Transaction[] = Array.from({ length: 1000 }, (_, index) => {
    const createdAt = new Date("2026-10-15T09:00:00Z");
    const incidentStep = index % 60;
    const servicePool = [
      "WEMA-FX-12",
      "WEMA-CORE-17",
      "WEMA-SETTLE-09",
      "NIP-ROUTER-05",
      "CARD-HOST-21",
    ];
    const statusPool: TxStatus[] = [
      "PENDING",
      "SUCCESS",
      "PENDING",
      "FAILED_CONFIRMED",
      "REVIEW_REQUIRED",
      "SUCCESS",
      "PENDING",
    ];

    const service = servicePool[index % servicePool.length];
    const status =
      index >= 100 && index < 115
        ? "FAILED_CONFIRMED"
        : index >= 220 && index < 226
          ? "REVIEW_REQUIRED"
          : statusPool[index % statusPool.length];

    const amount = 15000 + (index * 73) % 250000;
    const createdTime = new Date(
      createdAt.getTime() + index * 20 * 1000 + (index % 9) * 5000,
    ).toISOString();

    return {
      id: index + 1,
      reference: `REF-${String(index + 1).padStart(6, "0")}`,
      amount,
      currency: "NGN",
      channel: index % 3 === 0 ? "Mobile app" : index % 3 === 1 ? "Internet banking" : "POS",
      service,
      sender: `ACC-${(index * 13) % 9000 + 1000}`,
      recipient: `BEN-${(index * 17) % 8000 + 2000}`,
      status,
      createdAt: createdTime,
      updatedAt: createdTime,
      evidence: [
        `Channel event captured at ${new Date(createdTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        index % 4 === 0 ? "Service timeout observed" : "Status synchronized with processor",
        index % 5 === 0 ? "No duplicate reversal record found" : "No conflicting success signal",
      ],
      history: [
        "Batch captured",
        status === "SUCCESS" ? "Funds confirmed by acquirer" : "Awaiting final confirmation",
      ],
      stack: index % 2 === 0 ? "Core-API" : index % 3 === 0 ? "Settlement" : "Gateway",
      errorCode: incidentStep % 7 === 0 ? "TIMEOUT_504" : "ERR_102",
      isEligible: status === "FAILED_CONFIRMED",
    };
  });

  const clusterIds = [101, 102, 103, 104, 105, 106];

  clusterIds.forEach((id, index) => {
    const tx = transactions.find((item) => item.id === id);
    if (!tx) return;
    const clusterTime = new Date(Date.parse("2026-10-15T09:20:00Z") + index * 45 * 1000).toISOString();
    tx.service = "WEMA-CORE-17";
    tx.createdAt = clusterTime;
    tx.updatedAt = clusterTime;
    tx.status = "FAILED_CONFIRMED";
    tx.errorCode = "TIMEOUT_504";
    tx.evidence = [
      "Repeated timeout or no response from WEMA-CORE-17",
      "Same simulated service repeated across multiple payment references",
      "No confirmed successful outcome recorded for the affected set",
    ];
    tx.history = [
      "Initial timeout observed",
      "Processor status check returned failed",
      index % 2 === 0 ? "Operator queued for review" : "Evidence validated against reversal policy",
    ];
    tx.isEligible = true;
  });

  const timeoutThenSuccess = transactions.find((item) => item.id === 320);
  if (timeoutThenSuccess) {
    timeoutThenSuccess.status = "SUCCESS";
    timeoutThenSuccess.evidence = [
      "Timeout event initially logged",
      "Later ledger reconciliation confirmed the payment succeeded",
      "Duplicate reversal request must be blocked",
    ];
    timeoutThenSuccess.isEligible = false;
    timeoutThenSuccess.history = [
      "Customer reported no confirmation",
      "Settlement event later confirmed successful completion",
    ];
  }

  const scenarioB = transactions.find((item) => item.id === 451);
  if (scenarioB) {
    scenarioB.status = "FAILED_CONFIRMED";
    scenarioB.isEligible = true;
    scenarioB.history = ["Payment authorization rejected by issuer", "Settlement trace confirms no successful completion"];
    scenarioB.evidence = [
      "ACH authorisation rejected by issuer",
      "Settlement trace confirms failure with no later success record",
      "No reversal request is already pending",
    ];
  }

  const completedReversal = transactions.find((item) => item.id === 452);
  if (completedReversal) {
    completedReversal.status = "REVERSED";
    completedReversal.isEligible = false;
    completedReversal.reversalReference = "SIM-REV-000452";
    completedReversal.updatedAt = "2026-10-15T10:05:00Z";
    completedReversal.evidence = [
      "Issuer rejection confirmed by the simulated settlement trace",
      "Simulated reversal response: completed successfully",
      "Reversal reference SIM-REV-000452 recorded; no real funds were moved",
    ];
    completedReversal.history = [
      "Payment confirmed failed by issuer",
      "Reversal approved under demo policy",
      "Simulated bank response confirmed reversal · SIM-REV-000452",
    ];
  }

  const isolatedFailure = transactions.find((item) => item.id === 780);
  if (isolatedFailure) {
    isolatedFailure.status = "FAILED_CONFIRMED";
    isolatedFailure.isEligible = true;
    isolatedFailure.evidence = [
      "Single failed payment on unrelated service",
      "No equivalent failure cluster was observed",
    ];
    isolatedFailure.history = ["Single exception captured", "No incident correlation trigger detected"];
  }

  [201, 202, 203, 204].forEach((id, index) => {
    const tx = transactions.find((item) => item.id === id);
    if (!tx) return;
    const clusterTime = new Date(Date.parse("2026-10-15T09:48:00Z") + index * 50 * 1000).toISOString();
    tx.service = "NIP-ROUTER-05";
    tx.createdAt = clusterTime;
    tx.updatedAt = clusterTime;
    tx.status = "REVIEW_REQUIRED";
    tx.errorCode = "TIMEOUT_504";
    tx.isEligible = false;
    tx.history = ["Timeout reported by processor", "No authoritative final outcome", "Flagged for analyst review"];
    tx.evidence = ["Timeout on NIP-ROUTER-05", "No authoritative completion event yet", "Analyst confirmation required"];
  });

  [601, 602, 603, 604, 605, 606].forEach((id, index) => {
    const tx = transactions.find((item) => item.id === id);
    if (!tx) return;
    const eventTime = new Date(Date.parse("2026-10-15T10:12:00Z") + index * 42 * 1000).toISOString();
    tx.service = "MOBILE-TRANSFER-SDK";
    tx.channel = "Mobile app";
    tx.createdAt = eventTime;
    tx.updatedAt = eventTime;
    tx.status = "REVIEW_REQUIRED";
    tx.errorCode = "SDK_DEPRECATED_API";
    tx.isEligible = false;
    tx.evidence = [
      "Transfer adapter returned SDK_DEPRECATED_API after mobile release 6.4",
      "Same deprecated method signature observed across this mobile transfer cluster",
      "Processor completion is unconfirmed; do not reverse from this signal alone",
    ];
    tx.history = ["Mobile transfer submitted", "SDK compatibility error returned", "Outcome placed in manual review"];
  });

  const incidents: Incident[] = [
    {
      id: "INC-017",
      title: "Shared service disruption on WEMA-CORE-17",
      service: "WEMA-CORE-17",
      status: "OPEN",
      priority: "P1",
      detectedAt: "2026-10-15T09:23:00Z",
      deadline: "2026-10-15T17:00:00Z",
      owner: "Amina Okafor",
      suspectedCause: "Repeated timeout and service error signatures on same channel in 12 minute window",
      confidence: 0.92,
      transactionIds: [101, 102, 103, 104, 105, 106],
      summary: "Six payment exceptions cluster around a single service and duplicate timeout signatures.",
      notes: "Validate the processor incident window before closing the case.",
    },
    {
      id: "INC-029",
      title: "Settlement queue variance on NIP-ROUTER-05",
      service: "NIP-ROUTER-05",
      status: "IN_REVIEW",
      priority: "P2",
      detectedAt: "2026-10-15T09:51:00Z",
      deadline: "2026-10-15T18:30:00Z",
      owner: "Samuel Nduka",
      suspectedCause: "Higher than normal timeout rate without a single common error code",
      confidence: 0.7,
      transactionIds: [201, 202, 203, 204],
      summary: "Four transactions match the same time bucket but require analyst confirmation.",
      notes: "Compare individual processor traces; shared root cause is not yet confirmed.",
    },
    {
      id: "INC-042",
      title: "Mobile transfer SDK compatibility spike",
      service: "MOBILE-TRANSFER-SDK",
      status: "OPEN",
      priority: "P1",
      detectedAt: "2026-10-15T10:17:00Z",
      deadline: "2026-10-15T16:30:00Z",
      owner: "Chika Eze",
      suspectedCause: "Possible deprecated transfer API in mobile SDK release 6.4; validate against the app release and dependency inventory.",
      confidence: 0.86,
      transactionIds: [601, 602, 603, 604, 605, 606],
      summary: "Six mobile transfer attempts returned the same SDK deprecation signature within five minutes. This is a diagnostic hypothesis, not proof of root cause or payment failure.",
      notes: "Notify Mobile Platform on-call. Check SDK release notes, adapter version, and final processor outcomes before customer remediation.",
    },
  ];

  const auditEvents: AuditEvent[] = [
    {
      id: "AUD-101",
      actor: "Amina Okafor",
      action: "Incident detected",
      entity: "INC-017",
      timestamp: "2026-10-15T09:28:00Z",
      previousState: "New",
      newState: "Open",
      details: "Threshold exceeded for WEMA-CORE-17 with 6 correlated timeouts.",
    },
    {
      id: "AUD-102",
      actor: "System",
      action: "Eligibility check",
      entity: "REF-000451",
      timestamp: "2026-10-15T09:41:00Z",
      previousState: "FAILED_CONFIRMED",
      newState: "Eligible",
      details: "No successful completion found and no prior reversal was recorded.",
    },
    {
      id: "AUD-103",
      actor: "System",
      action: "Reversal blocked",
      entity: "REF-000320",
      timestamp: "2026-10-15T09:46:00Z",
      previousState: "SUCCESS",
      newState: "SUCCESS",
      details: "A later status event confirmed the payment succeeded.",
    },
    {
      id: "AUD-104",
      actor: "Simulated bank adapter · demo",
      action: "Reversal confirmed",
      entity: "REF-000452",
      timestamp: "2026-10-15T10:05:00Z",
      previousState: "REVERSAL_PENDING",
      newState: "REVERSED",
      details: "Simulated adapter response completed reversal SIM-REV-000452. This is demo state only; no payment rails were called.",
    },
  ];

  const notifications: ResponderNotification[] = detectTransactionTrends(
    transactions,
    defaultPolicy.trendMinimumCount,
    defaultPolicy.trendWindowMinutes,
  ).flatMap((trend, trendIndex) => responders.map((recipient, responderIndex) => {
    const incident = incidents.find((item) => item.service === trend.service);
    return {
      id: `NTF-SEED-${trendIndex}-${responderIndex}`,
      incidentId: incident?.id ?? `TREND-${trend.service}`,
      recipient,
      title: `Payment exception trend · ${trend.service}`,
      message: `${trend.transactions.length} transfers share ${trend.signature} within ${defaultPolicy.trendWindowMinutes} minutes. Investigate processor, SDK, and final payment outcome.`,
      channel: "In-app demo" as const,
      timestamp: "2026-10-15T10:22:00Z",
    };
  }));

  const notifiedIncidents = [...new Map(notifications.map((notification) => [notification.incidentId, notification])).values()];
  notifiedIncidents.forEach((notification, index) => {
    auditEvents.unshift({
      id: `AUD-SEED-NOTIFY-${index + 1}`,
      actor: "Trend detection · demo",
      action: "Responder team notified",
      entity: notification.incidentId,
      timestamp: notification.timestamp,
      previousState: "TREND_DETECTED",
      newState: "RESPONDERS_NOTIFIED",
      details: `Rule scan detected a shared service/error cluster and automatically created in-app demo notifications for responders. ${notification.message}`,
    });
  });

  return { transactions, incidents, auditEvents, notifications };
}

export default function Home() {
  const seed = useMemo(() => buildDemoData(), []);
  const [data, setData] = useState(seed);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [query, setQuery] = useState("");
  const [incidentStatusFilter, setIncidentStatusFilter] = useState("All");
  const [transactionStatusFilter, setTransactionStatusFilter] = useState("All");
  const [selectedIncidentId, setSelectedIncidentId] = useState(seed.incidents[0].id);
  const [selectedTransactionId, setSelectedTransactionId] = useState(
    seed.transactions.find((item) => item.id === 451)?.id ?? seed.transactions[0].id,
  );
  const [resolutionReason, setResolutionReason] = useState("");
  const [decisionFeedback, setDecisionFeedback] = useState("");
  const [incidentSearch, setIncidentSearch] = useState("");
  const [policy, setPolicy] = useState<ReversalPolicy>(defaultPolicy);
  const [policyDraft, setPolicyDraft] = useState<ReversalPolicy>(defaultPolicy);
  const [policyFeedback, setPolicyFeedback] = useState("");
  const [trendFeedback, setTrendFeedback] = useState("");
  const [adapterMode, setAdapterMode] = useState<ReversalAdapterMode>("existing");
  const [adapterFeedback, setAdapterFeedback] = useState("");

  const filteredIncidents = useMemo(() => {
    return data.incidents.filter((incident) => {
      const search = incidentSearch.trim().toLowerCase();
      const matchesQuery = !search || [incident.id, incident.title, incident.service, incident.suspectedCause].some((value) => value.toLowerCase().includes(search));
      const matchesStatus = incidentStatusFilter === "All" || (incidentStatusFilter === "DUE_SOON" ? isNearDeadline(incident) : incident.status === incidentStatusFilter);
      return matchesQuery && matchesStatus;
    });
  }, [data.incidents, incidentSearch, incidentStatusFilter]);

  const filteredTransactions = useMemo(() => {
    return data.transactions.filter((tx) => {
      const matchesQuery =
        query.trim() === "" ||
        tx.reference.toLowerCase().includes(query.toLowerCase()) ||
        tx.service.toLowerCase().includes(query.toLowerCase()) ||
        tx.recipient.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = transactionStatusFilter === "All" ||
        (transactionStatusFilter === "UNRESOLVED" && ["PENDING", "REVIEW_REQUIRED", "REVERSAL_PENDING"].includes(tx.status)) ||
        (transactionStatusFilter === "ELIGIBLE" && tx.isEligible && tx.status === "FAILED_CONFIRMED") ||
        tx.status === transactionStatusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [data.transactions, query, transactionStatusFilter]);

  const selectedIncident =
    data.incidents.find((incident) => incident.id === selectedIncidentId) ?? data.incidents[0];
  const selectedTransaction =
    filteredTransactions.find((tx) => tx.id === selectedTransactionId) ??
    filteredTransactions[0] ??
    data.transactions.find((tx) => tx.id === selectedTransactionId) ??
    data.transactions[0];
  const visibleTransactions = useMemo(() => {
    const selectedIndex = filteredTransactions.findIndex((tx) => tx.id === selectedTransaction.id);
    if (selectedIndex > 14) {
      return [filteredTransactions[selectedIndex], ...filteredTransactions.slice(0, 14)];
    }
    return filteredTransactions.slice(0, 15);
  }, [filteredTransactions, selectedTransaction.id]);
  const detectedTrends = useMemo(
    () => detectTransactionTrends(data.transactions, policy.trendMinimumCount, policy.trendWindowMinutes),
    [data.transactions, policy.trendMinimumCount, policy.trendWindowMinutes],
  );

  const overviewStats = useMemo(() => {
    const total = data.transactions.length;
    const unresolved = data.transactions.filter((tx) =>
      ["PENDING", "REVIEW_REQUIRED", "REVERSAL_PENDING"].includes(tx.status),
    ).length;
    const eligible = data.transactions.filter((tx) => tx.isEligible && tx.status === "FAILED_CONFIRMED").length;
    const nearDeadline = data.incidents.filter(isNearDeadline).length;

    return {
      total,
      incidents: data.incidents.length,
      unresolved,
      eligible,
      nearDeadline,
    };
  }, [data.incidents, data.transactions]);

  const handleReset = () => {
    const fresh = buildDemoData();
    setData(fresh);
    setSelectedIncidentId(fresh.incidents[0].id);
    setSelectedTransactionId(fresh.transactions.find((item) => item.id === 451)?.id ?? fresh.transactions[0].id);
    setResolutionReason("");
    setDecisionFeedback("");
    setIncidentSearch("");
    setQuery("");
    setIncidentStatusFilter("All");
    setTransactionStatusFilter("All");
    setPolicy(defaultPolicy);
    setPolicyDraft(defaultPolicy);
    setPolicyFeedback("");
    setTrendFeedback("");
    setAdapterMode("existing");
    setAdapterFeedback("");
  };

  const appendAudit = (entry: Omit<AuditEvent, "id" | "timestamp">) => {
    setData((previous) => ({
      ...previous,
      auditEvents: [
        {
          id: `AUD-${Date.now()}`,
          timestamp: new Date().toISOString(),
          ...entry,
        },
        ...previous.auditEvents,
      ],
    }));
  };

  const handleResolution = (decision: "approve" | "reject") => {
    if (!selectedTransaction) return;

    if (decision === "approve" && policy.mode === "automatic") {
      setDecisionFeedback("Automatic policy is active. Use ‘Evaluate bank policy’ so the configured rules decide this transaction.");
      return;
    }

    if (!resolutionReason.trim()) {
      setDecisionFeedback("Enter a decision rationale before recording this action.");
      return;
    }

    if (decision === "approve") {
      const policyIssues = getPolicyEligibilityIssues(selectedTransaction, policy);
      const isEligible = policyIssues.length === 0;

      if (!isEligible) {
        setDecisionFeedback(`Reversal blocked: ${policyIssues.join(" ")}`);
        appendAudit({
          actor: "Demo operator",
          action: "Reversal blocked",
          entity: selectedTransaction.reference,
          previousState: selectedTransaction.status,
          newState: selectedTransaction.status,
          details: `${resolutionReason} Policy checks: ${policyIssues.join(" ")}`,
        });
        setResolutionReason("");
        return;
      }

      if (!window.confirm(`Confirm simulated reversal for ${selectedTransaction.reference}? This will not move real money.`)) return;

      setData((previous) => ({
        ...previous,
        transactions: previous.transactions.map((tx) =>
          tx.id === selectedTransaction.id
            ? {
                ...tx,
                status: "REVERSAL_PENDING",
                updatedAt: new Date().toISOString(),
                evidence: [...tx.evidence, "Simulated reversal submitted with operator approval."],
                history: [...tx.history, "Authorization captured and reversal queued."],
                operatorNote: resolutionReason || "Approved per policy.",
              }
            : tx,
        ),
      }));
      appendAudit({
        actor: "Demo operator",
        action: "Reversal submitted",
        entity: selectedTransaction.reference,
        previousState: selectedTransaction.status,
        newState: "REVERSAL_PENDING",
        details: resolutionReason || "Approved under reversal policy.",
      });
      setDecisionFeedback("Simulated reversal request recorded. Status is now Reversal pending; no real funds were moved.");
      setResolutionReason("");
      return;
    }

    const rejectionState = selectedTransaction.status === "FAILED_CONFIRMED" ? "REVIEW_REQUIRED" : selectedTransaction.status;
    setData((previous) => ({
      ...previous,
      transactions: previous.transactions.map((tx) =>
        tx.id === selectedTransaction.id
          ? {
              ...tx,
              status: rejectionState,
              updatedAt: new Date().toISOString(),
              evidence: [...tx.evidence, "Operator rejected reversal request and escalated for manual investigation."],
              history: [...tx.history, "Operator rejected reversal request."],
              operatorNote: resolutionReason || "Decision reason missing.",
            }
          : tx,
      ),
    }));
    appendAudit({
      actor: "Demo operator",
      action: "Reversal rejected",
      entity: selectedTransaction.reference,
      previousState: selectedTransaction.status,
      newState: rejectionState,
      details: resolutionReason || "No reason provided for rejection.",
    });
    setDecisionFeedback("Decision recorded and escalated to manual review.");
    setResolutionReason("");
  };

  const evaluateBankPolicy = () => {
    const policyIssues = getPolicyEligibilityIssues(selectedTransaction, policy);
    if (policyIssues.length > 0) {
      setDecisionFeedback(`Policy blocked this transaction: ${policyIssues.join(" ")}`);
      appendAudit({
        actor: "Bank policy engine · demo",
        action: "Policy decision blocked",
        entity: selectedTransaction.reference,
        previousState: selectedTransaction.status,
        newState: selectedTransaction.status,
        details: policyIssues.join(" "),
      });
      return;
    }

    if (policy.mode === "manual") {
      setDecisionFeedback("Eligible under current policy. A bank operator must still provide a reason and approve the reversal.");
      appendAudit({
        actor: "Bank policy engine · demo",
        action: "Policy eligibility confirmed",
        entity: selectedTransaction.reference,
        previousState: selectedTransaction.status,
        newState: "AWAITING_HUMAN_APPROVAL",
        details: `Within ${formatCurrency(policy.maxAmount)} cap; ${selectedTransaction.channel} is allowed. Human approval remains required.`,
      });
      return;
    }

    const policyReason = `Automatically approved by the configured bank policy: confirmed failure, no success signal, no duplicate reversal, amount within ${formatCurrency(policy.maxAmount)} limit, and ${selectedTransaction.channel} allowed.`;
    setData((previous) => ({
      ...previous,
      transactions: previous.transactions.map((tx) => tx.id === selectedTransaction.id
        ? {
            ...tx,
            status: "REVERSAL_PENDING",
            updatedAt: new Date().toISOString(),
            evidence: [...tx.evidence, "Automatic reversal authorized by saved demo bank policy."],
            history: [...tx.history, "Bank policy engine approved reversal and queued simulation."],
            operatorNote: policyReason,
          }
        : tx),
    }));
    appendAudit({
      actor: "Bank policy engine · demo",
      action: "Policy auto-approved reversal",
      entity: selectedTransaction.reference,
      previousState: selectedTransaction.status,
      newState: "REVERSAL_PENDING",
      details: policyReason,
    });
    setDecisionFeedback("Automatically approved by bank policy. Simulated reversal is pending; no real funds moved.");
  };

  const simulateReversalResponse = (outcome: "confirmed" | "failed") => {
    if (selectedTransaction.status !== "REVERSAL_PENDING") return;
    const reversalReference = selectedTransaction.reversalReference ?? `SIM-REV-${String(selectedTransaction.id).padStart(6, "0")}`;
    const nextStatus = outcome === "confirmed" ? "REVERSED" : "REVERSAL_FAILED";
    const eventDescription = outcome === "confirmed"
      ? `Simulated bank response confirmed reversal ${reversalReference}. No real funds were moved.`
      : `Simulated bank response reported reversal failure for ${reversalReference}. Reconcile with the bank before any retry.`;
    setData((previous) => ({
      ...previous,
      transactions: previous.transactions.map((tx) => tx.id === selectedTransaction.id
        ? {
            ...tx,
            status: nextStatus,
            reversalReference,
            updatedAt: new Date().toISOString(),
            evidence: [...tx.evidence, eventDescription],
            history: [...tx.history, eventDescription],
          }
        : tx),
    }));
    appendAudit({
      actor: "Simulated bank adapter · demo",
      action: outcome === "confirmed" ? "Reversal confirmed" : "Reversal failed",
      entity: selectedTransaction.reference,
      previousState: "REVERSAL_PENDING",
      newState: nextStatus,
      details: eventDescription,
    });
    setDecisionFeedback(outcome === "confirmed"
      ? `Simulated reversal completed. Reference ${reversalReference}; no real funds were moved.`
      : `Simulated reversal failed (${reversalReference}). Reconcile the bank response before retrying.`);
  };

  const saveBankPolicy = () => {
    if (!Number.isFinite(policyDraft.maxAmount) || policyDraft.maxAmount <= 0) {
      setPolicyFeedback("Enter a transfer limit greater than zero.");
      return;
    }
    if (policyDraft.allowedChannels.length === 0) {
      setPolicyFeedback("Select at least one permitted transfer channel.");
      return;
    }
    if (!Number.isInteger(policyDraft.trendMinimumCount) || policyDraft.trendMinimumCount < 3 || policyDraft.trendMinimumCount > 25) {
      setPolicyFeedback("The trend threshold must be between 3 and 25 matching transfers.");
      return;
    }
    if (!Number.isInteger(policyDraft.trendWindowMinutes) || policyDraft.trendWindowMinutes < 1 || policyDraft.trendWindowMinutes > 60) {
      setPolicyFeedback("The trend window must be between 1 and 60 minutes.");
      return;
    }
    if (policyDraft.mode === "automatic" && policy.mode !== "automatic" && !window.confirm("Enable automatic reversals for eligible synthetic demo transfers? Only explicitly confirmed failures within this policy limit and permitted channels can pass. This app does not connect to bank rails.")) return;

    setPolicy(policyDraft);
    setPolicyFeedback(`Bank policy saved in this demo session · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    appendAudit({
      actor: "Amina Okafor",
      action: "Bank reversal policy updated",
      entity: "POLICY-REVERSAL-01",
      previousState: policy.mode === "automatic" ? "AUTOMATIC" : "MANUAL",
      newState: policyDraft.mode === "automatic" ? "AUTOMATIC" : "MANUAL",
      details: `Mode: ${policyDraft.mode}; max amount: ${formatCurrency(policyDraft.maxAmount)}; allowed channels: ${policyDraft.allowedChannels.join(", ")}; trend alert: ${policyDraft.trendMinimumCount} matching events within ${policyDraft.trendWindowMinutes} minutes.`,
    });
  };

  const selectAdapterMode = (mode: ReversalAdapterMode) => {
    setAdapterMode(mode);
    setAdapterFeedback(mode === "existing"
      ? "Demo selection saved. No bank endpoint, credentials, or payment rails are connected."
      : "Demo blueprint selected. It outlines an adapter contract; implementation and bank security approval are still required.");
    appendAudit({
      actor: "Amina Okafor",
      action: mode === "existing" ? "Existing reversal adapter selected" : "Reversal adapter blueprint selected",
      entity: "ADAPTER-REVERSAL-DEMO",
      previousState: adapterMode === "existing" ? "EXISTING_ADAPTER" : "BLUEPRINT",
      newState: mode === "existing" ? "EXISTING_ADAPTER" : "BLUEPRINT",
      details: mode === "existing"
        ? "Selected the option to connect a bank-approved reversal interface later. No real endpoint is configured in this demo."
        : "Selected a demo-only adapter blueprint for a bank-owned reversal API. No code was deployed and no payment interface is connected.",
    });
  };

  const notifyRespondersForTrend = (trend: TrendCluster) => {
    const incident = data.incidents.find((item) => item.service === trend.service);
    const incidentId = incident?.id ?? `TREND-${trend.service}`;
    if (incident) setSelectedIncidentId(incident.id);
    const notificationTime = new Date().toISOString();
    const newNotifications = responders.map((recipient, index) => ({
      id: `NTF-${Date.now()}-${index}`,
      incidentId,
      recipient,
      title: `Payment exception trend · ${trend.service}`,
      message: `${trend.transactions.length} transfers share ${trend.signature} within ${policy.trendWindowMinutes} minutes. Investigate processor, SDK, and final payment outcome.`,
      channel: "In-app demo" as const,
      timestamp: notificationTime,
    }));
    setData((previous) => ({ ...previous, notifications: [...newNotifications, ...previous.notifications] }));
    appendAudit({
      actor: "Trend detection · demo",
      action: "Responder team notified",
      entity: incidentId,
      previousState: "DETECTED",
      newState: "RESPONDERS_NOTIFIED",
      details: `${newNotifications.length} simulated in-app notifications sent for ${trend.transactions.length} matching ${trend.signature} events on ${trend.service}. No email, SMS, or external paging service is connected.`,
    });
    setTrendFeedback(`${newNotifications.length} on-call workers notified in the demo inbox for ${incidentId}.`);
  };

  const updateIncident = (updates: Partial<Incident>, action: string, details: string) => {
    setData((previous) => ({
      ...previous,
      incidents: previous.incidents.map((incident) => incident.id === selectedIncident.id ? { ...incident, ...updates } : incident),
    }));
    appendAudit({
      actor: "Amina Okafor",
      action,
      entity: selectedIncident.id,
      previousState: selectedIncident.status,
      newState: updates.status ?? selectedIncident.status,
      details,
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const index = Number(event.key.slice(1)) - 1;
      if (event.key.match(/^F[1-7]$/) && index >= 0) {
        event.preventDefault();
        setActiveTab(tabs[index]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const statusCounts = useMemo(
    () =>
      Object.keys(statusMeta).reduce(
        (acc, key) => {
          const count = data.transactions.filter((tx) => tx.status === key).length;
          acc[key as TxStatus] = count;
          return acc;
        },
        {} as Record<TxStatus, number>,
      ),
    [data.transactions],
  );

  const recentActivity = data.auditEvents.slice(0, 5);
  const pageCopy: Record<Tab, { title: string; description: string }> = {
    Overview: { title: "Operations overview", description: "Monitor payment exceptions, incident health, and recovery activity." },
    Incidents: { title: "Incident queue", description: "Review correlated service disruptions and prioritize investigation." },
    "Incident Detail": { title: "Incident workspace", description: "Assess evidence, ownership, and transactions linked to this incident." },
    "Transaction Investigation": { title: "Transaction investigation", description: "Review payment evidence and make policy-guided recovery decisions." },
    "Audit Trail": { title: "Audit trail", description: "A complete, time-ordered record of investigation and resolution actions." },
    "Bank Policies": { title: "Bank reversal policies", description: "Set the rules that govern manual review, automatic approval, and incident response thresholds." },
    "Integration Layer": { title: "Integration layer", description: "Coordinate evidence and policy decisions across existing bank and payment infrastructure—without replacing those systems." },
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <a className="brand-lockup" href="#overview" onClick={(event) => { event.preventDefault(); setActiveTab("Overview"); }}>
          <span className="brand-mark">R</span>
          <span className="brand-name">Reconcile<span>IQ</span><small>PAYMENT OPERATIONS</small></span>
        </a>

        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Workspace navigation">
          {tabs.map((tab, index) => {
            const iconName: IconName = tab === "Overview" ? "overview" : tab === "Incidents" ? "incidents" : tab === "Incident Detail" ? "detail" : tab === "Transaction Investigation" ? "transactions" : tab === "Bank Policies" ? "policy" : tab === "Integration Layer" ? "integration" : "audit";
            return (
              <button
                key={tab}
                className={activeTab === tab ? "nav-item nav-item-active" : "nav-item"}
                onClick={() => setActiveTab(tab)}
                aria-current={activeTab === tab ? "page" : undefined}
              >
                <AppIcon name={iconName} />
                <span>{tab === "Transaction Investigation" ? "Transactions" : tab}</span>
                {tab === "Incidents" && <span className="nav-count">{data.incidents.length}</span>}
                {tab === "Bank Policies" && <span className="nav-count policy-mode-count">{policy.mode === "automatic" ? "AUTO" : "MANUAL"}</span>}
                <kbd>F{index + 1}</kbd>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />
        <div className="environment-card">
          <span className="environment-indicator" />
          <div><strong>Demo environment</strong><small>Synthetic ledger data</small></div>
        </div>
        <div className="sidebar-footer">RECONCILEIQ <span>•</span> INTERNAL WORKSPACE</div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="workspace-context"><span className="context-dot" /> Operations workspace <span className="context-divider">/</span> {activeTab === "Overview" ? "Overview" : activeTab}</div>
          <div className="topbar-actions">
            <span className="system-status"><span /> All systems operational</span>
            <button className="secondary-button reset-button" onClick={handleReset}>Reset demo</button>
            <div className="operator-pill"><span className="operator-avatar">AO</span><span><strong>Amina Okafor</strong><small>Operations analyst</small></span><span className="operator-chevron">⌄</span></div>
          </div>
        </header>

        <div className="page-shell">
          <div className="page-heading">
            <div><span className="eyebrow">PAYMENT RECOVERY & INCIDENT INTELLIGENCE</span><h1>{pageCopy[activeTab].title}</h1><p>{pageCopy[activeTab].description}</p></div>
            <div className="heading-meta"><span className="live-indicator" /> LIVE DEMO <span className="heading-divider" /> 15 OCT 2026</div>
          </div>

      {activeTab === "Overview" && (
        <section className="screen-grid">
          <div className="metrics-grid">
            <button className="metric-card accent-emerald metric-action" onClick={() => { setQuery(""); setTransactionStatusFilter("All"); setActiveTab("Transaction Investigation"); }} aria-label="View all transactions">
              <div className="metric-header">
                <span className="metric-icon"><AppIcon name="transactions" /></span>
                <span className="metric-label">Transactions</span>
              </div>
              <strong>{overviewStats.total.toLocaleString()}</strong>
              <small>Across the seeded demo ledger</small>
            </button>
            <button className="metric-card accent-blue metric-action" onClick={() => { setIncidentSearch(""); setIncidentStatusFilter("All"); setActiveTab("Incidents"); }} aria-label="View all incidents">
              <div className="metric-header">
                <span className="metric-icon"><AppIcon name="incidents" /></span>
                <span className="metric-label">Incidents</span>
              </div>
              <strong>{overviewStats.incidents}</strong>
              <small>Service clusters under review</small>
            </button>
            <button className="metric-card accent-amber metric-action" onClick={() => { setQuery(""); setTransactionStatusFilter("UNRESOLVED"); setActiveTab("Transaction Investigation"); }} aria-label="Investigate unresolved transactions">
              <div className="metric-header">
                <span className="metric-icon"><AppIcon name="activity" /></span>
                <span className="metric-label">Exceptions</span>
              </div>
              <strong>{overviewStats.unresolved}</strong>
              <small>Pending investigation</small>
            </button>
            <button className="metric-card accent-violet metric-action" onClick={() => { setQuery(""); setTransactionStatusFilter("ELIGIBLE"); setActiveTab("Transaction Investigation"); }} aria-label="View transactions eligible for review">
              <div className="metric-header">
                <span className="metric-icon"><AppIcon name="audit" /></span>
                <span className="metric-label">Eligible</span>
              </div>
              <strong>{overviewStats.eligible}</strong>
              <small>Awaiting review and approval</small>
            </button>
            <button className="metric-card accent-amber metric-action" onClick={() => { setIncidentSearch(""); setIncidentStatusFilter("DUE_SOON"); setActiveTab("Incidents"); }} aria-label="View incidents approaching their deadline">
              <div className="metric-header">
                <span className="metric-icon"><AppIcon name="activity" /></span>
                <span className="metric-label">Due soon</span>
              </div>
              <strong>{overviewStats.nearDeadline}</strong>
              <small>Incidents near their deadline</small>
            </button>
          </div>

          <div className="content-grid two-up">
            <div className="panel">
              <div className="panel-header">
                <h2>Incident queue</h2>
                <span className="badge danger">{data.incidents.filter((incident) => incident.status === "OPEN").length} open</span>
              </div>
              <div className="incident-list">
                {data.incidents.map((incident) => (
                  <button
                    key={incident.id}
                    className="incident-item"
                    onClick={() => {
                      setSelectedIncidentId(incident.id);
                      setActiveTab("Incident Detail");
                    }}
                  >
                    <div>
                      <strong>{incident.title}</strong>
                      <small>{incident.service}</small>
                    </div>
                    <span className={`priority ${incident.priority.toLowerCase()}`}>{incident.priority}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Status distribution</h2>
                <span className="badge neutral">1,000 records</span>
              </div>
              <div className="stacked-bars">
                {Object.entries(statusCounts).map(([status, count]) => (
                  <div key={status} className="stack-row">
                    <div className="stack-label">{statusMeta[status as TxStatus].label}</div>
                    <div className="stack-track">
                      <div
                        className={`stack-fill ${statusMeta[status as TxStatus].tone.replace("status ", "")}`}
                        style={{ width: `${(count / data.transactions.length) * 100}%` }}
                      />
                    </div>
                    <div className="stack-value">{count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="content-grid two-up">
            <div className="panel">
              <div className="panel-header">
                <h2>Deadline alerts</h2>
                <span className="badge warning">{overviewStats.nearDeadline} due soon</span>
              </div>
              {data.incidents.map((incident) => (
                <div key={incident.id} className="deadline-item">
                  <div>
                    <strong>{incident.id}</strong>
                    <small>{incident.service}</small>
                  </div>
                  <span>{new Date(incident.deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Recent activity</h2>
                <span className="badge neutral">Audit trail</span>
              </div>
              <div className="audit-list">
                {recentActivity.map((event) => (
                  <div key={event.id} className="audit-row">
                    <div>
                      <strong>{event.action}</strong>
                      <small>{event.actor}</small>
                    </div>
                    <span>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="content-grid two-up trend-response-grid">
            <div className="panel trend-panel">
              <div className="panel-header">
                <div><span className="eyebrow">DETERMINISTIC SIGNAL SCAN</span><h2>Emerging transfer trends</h2></div>
                <span className="badge warning">{detectedTrends.length} detected</span>
              </div>
              {detectedTrends.length > 0 ? detectedTrends.slice(0, 3).map((trend) => {
                const incident = data.incidents.find((item) => item.service === trend.service);
                const isSdkPattern = trend.signature.includes("SDK") || trend.service.includes("SDK");
                return (
                  <div key={`${trend.service}-${trend.signature}`} className="trend-alert-card">
                    <div className="trend-alert-top"><span className="trend-severity"><span /> P1 SIGNAL</span><span>{trend.transactions.length} events · {policy.trendWindowMinutes}m window</span></div>
                    <strong>{isSdkPattern ? "Possible mobile SDK compatibility regression" : `${trend.service} exception cluster`}</strong>
                    <p>{trend.transactions.length} transfers share <b>{trend.signature}</b> on <b>{trend.service}</b>. {isSdkPattern ? "A deprecated SDK API is a lead to validate against release/dependency data—not a proven cause." : "A shared signature is a correlation, not proof of a common cause."}</p>
                    <div className="trend-alert-meta"><span>{trend.transactions.length} linked synthetic transfers</span><span>{incident?.id ?? "Untriaged signal"}</span></div>
                    <div className="trend-alert-actions">
                      <button className="primary-button" onClick={() => { if (incident) { setSelectedIncidentId(incident.id); setActiveTab("Incident Detail"); } else setActiveTab("Incidents"); }}>Open investigation</button>
                      <button className="secondary-button" onClick={() => notifyRespondersForTrend(trend)}>Re-notify response team</button>
                    </div>
                  </div>
                );
              }) : <p className="empty-state">No clusters meet the current policy threshold.</p>}
              {trendFeedback && <p className="decision-feedback" role="status">{trendFeedback}</p>}
              <small className="demo-channel-note">A matching seeded trend automatically creates in-app demo notifications. Re-notify is a manual escalation. No email, SMS, or external paging integration is connected.</small>
            </div>

            <div className="panel responder-panel">
              <div className="panel-header"><div><span className="eyebrow">IN-APP DEMO INBOX</span><h2>Responder notifications</h2></div><span className="badge neutral">{data.notifications.length} sent</span></div>
              {data.notifications.length ? <div className="responder-notification-list">{data.notifications.slice(0, 5).map((notification) => <div className="responder-notification" key={notification.id}><span className="notification-mark"><AppIcon name="incidents" /></span><div><strong>{notification.recipient}</strong><small>{notification.title}</small><p>{notification.message}</p><span className="notification-time">{notification.channel} · {new Date(notification.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div></div>)}</div> : <div className="inbox-empty"><span className="inbox-empty-icon"><AppIcon name="activity" /></span><strong>No responders paged yet</strong><p>When the trend rule matches, notify the payment operations, on-call, and mobile platform responders here.</p></div>}
            </div>
          </div>
        </section>
      )}

      {activeTab === "Incidents" && (
        <section className="screen-grid">
          <div className="toolbar">
            <input
              value={incidentSearch}
              onChange={(event) => setIncidentSearch(event.target.value)}
              placeholder="Search incidents or service"
              aria-label="Search incidents or service"
              className="search-box"
            />
            <select aria-label="Filter incidents by status" value={incidentStatusFilter} onChange={(event) => setIncidentStatusFilter(event.target.value)} className="filter-box">
              <option value="All">All statuses</option>
              <option value="DUE_SOON">Due soon</option>
              <option value="OPEN">Open</option>
              <option value="IN_REVIEW">In review</option>
              <option value="RESOLVED">Resolved</option>
              <option value="DISMISSED">Dismissed</option>
            </select>
          </div>

          <div className="panel full-panel">
            <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Incident</th>
                  <th>Priority</th>
                  <th>Transactions</th>
                  <th>Cause</th>
                  <th>Status</th>
                  <th>Age</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncidents.map((incident) => (
                  <tr key={incident.id} onClick={() => setSelectedIncidentId(incident.id)}>
                    <td>
                      <button className="link-button" onClick={() => { setSelectedIncidentId(incident.id); setActiveTab("Incident Detail"); }}>{incident.title}</button>
                      <small className="table-secondary">{incident.id} · {incident.service}</small>
                    </td>
                    <td>
                      <span className={`priority ${incident.priority.toLowerCase()}`}>{incident.priority}</span>
                    </td>
                    <td>{incident.transactionIds.length} affected</td>
                    <td>{incident.suspectedCause}</td>
                    <td><span className={`badge ${incident.status === "OPEN" ? "danger" : incident.status === "IN_REVIEW" ? "warning" : "neutral"}`}>{incident.status.replace("_", " ")}</span></td>
                    <td>{Math.max(1, Math.round((Date.parse("2026-10-15T15:00:00Z") - new Date(incident.detectedAt).getTime()) / (1000 * 60 * 60))) + "h"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      )}

      {activeTab === "Incident Detail" && selectedIncident && (
        <section className="screen-grid">
          <div className="panel detail-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Incident detail</span>
                <h2>{selectedIncident.title}</h2>
              </div>
              <div className="header-actions">
                <span className={`priority ${selectedIncident.priority.toLowerCase()}`}>{selectedIncident.priority}</span>
                <span className="badge info">{selectedIncident.status}</span>
              </div>
            </div>

            <div className="detail-layout">
              <div className="detail-column">
                <div className="info-block">
                  <h3>Correlation explanation</h3>
                  <p>{selectedIncident.summary}</p>
                  <div className="confidence-row"><span>Correlation confidence</span><strong>{Math.round(selectedIncident.confidence * 100)}%</strong></div>
                  <div className="confidence-track"><span style={{ width: `${selectedIncident.confidence * 100}%` }} /></div>
                  <p>Shared service <strong>{selectedIncident.service}</strong> · {selectedIncident.transactionIds.length} correlated records · error signature <strong>{data.transactions.find((tx) => selectedIncident.transactionIds.includes(tx.id))?.errorCode ?? "Mixed"}</strong>.</p>
                </div>

                <div className="info-block">
                  <h3>Linked transactions</h3>
                  <div className="table-wrap">
                  <table className="data-table linked-transactions-table">
                    <thead><tr><th>Reference</th><th>Amount</th><th>Status</th><th>Observed</th></tr></thead>
                    <tbody>
                    {selectedIncident.transactionIds.map((id) => {
                      const tx = data.transactions.find((item) => item.id === id);
                      if (!tx) return null;
                      return <tr key={id}><td><button className="link-button" onClick={() => { setSelectedTransactionId(id); setActiveTab("Transaction Investigation"); }}>{tx.reference}</button></td><td>{formatCurrency(tx.amount)}</td><td><span className={statusMeta[tx.status].tone}>{statusMeta[tx.status].label}</span></td><td>{new Date(tx.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td></tr>;
                    })}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>

              <div className="detail-column">
                <div className="info-block">
                  <div className="panel-header case-heading"><h3>Case management</h3><span className={`badge ${selectedIncident.status === "OPEN" ? "danger" : selectedIncident.status === "IN_REVIEW" ? "warning" : "neutral"}`}>{selectedIncident.status.replace("_", " ")}</span></div>
                  <div className="timeline">
                    <div className="timeline-item">
                      <span className="dot blue" />
                      <div>
                        <strong>Detected</strong>
                        <small>{new Date(selectedIncident.detectedAt).toLocaleString()}</small>
                      </div>
                    </div>
                    <div className="timeline-item">
                      <span className="dot amber" />
                      <div>
                        <strong>Ownership</strong>
                        <small>{selectedIncident.owner}</small>
                      </div>
                    </div>
                    <div className="timeline-item">
                      <span className="dot green" />
                      <div>
                        <strong>Review deadline</strong>
                        <small>{new Date(selectedIncident.deadline).toLocaleString()}</small>
                      </div>
                    </div>
                  </div>
                  <label className="field-label" htmlFor="case-owner">Assigned owner</label>
                  <select id="case-owner" className="filter-box case-select" value={selectedIncident.owner} onChange={(event) => updateIncident({ owner: event.target.value }, "Case reassigned", `Case assigned to ${event.target.value}.`)}>
                    <option>Amina Okafor</option><option>Samuel Nduka</option><option>Chika Eze</option>
                  </select>
                  <label className="field-label" htmlFor="case-notes">Case notes</label>
                  <textarea key={selectedIncident.id} id="case-notes" defaultValue={selectedIncident.notes} onBlur={(event) => { if (event.target.value !== selectedIncident.notes) updateIncident({ notes: event.target.value }, "Case note updated", event.target.value || "Case notes cleared."); }} placeholder="Record investigation notes" />
                  <div className="case-actions">
                    {selectedIncident.status !== "IN_REVIEW" && selectedIncident.status !== "RESOLVED" && <button className="secondary-button" onClick={() => updateIncident({ status: "IN_REVIEW" }, "Incident confirmed", "Operator confirmed the suspected incident and started review.")}>Confirm incident</button>}
                    {selectedIncident.status !== "RESOLVED" && <button className="primary-button" onClick={() => updateIncident({ status: "RESOLVED" }, "Incident resolved", "Incident resolution recorded by operator.")}>Mark resolved</button>}
                    {selectedIncident.status !== "DISMISSED" && selectedIncident.status !== "RESOLVED" && <button className="quiet-danger-button" onClick={() => updateIncident({ status: "DISMISSED" }, "Incident dismissed", "Operator dismissed the suspected correlation.")}>Dismiss</button>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === "Transaction Investigation" && (
        <section className="screen-grid investigation-layout">
          <div className="panel left-panel">
            <div className="panel-header">
              <h2>Transaction ledger</h2>
              <span className="badge neutral">{filteredTransactions.length} matches</span>
            </div>
            <div className="toolbar compact">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search ref, service, customer"
                aria-label="Search transactions by reference, service, or customer"
                className="search-box"
              />
              <select aria-label="Filter transactions by status" value={transactionStatusFilter} onChange={(event) => setTransactionStatusFilter(event.target.value)} className="filter-box">
                <option value="All">All states</option>
                <option value="UNRESOLVED">Unresolved exceptions</option>
                <option value="ELIGIBLE">Eligible for reversal</option>
                {Object.entries(statusMeta).map(([status, meta]) => (
                  <option key={status} value={status}>{meta.label}</option>
                ))}
              </select>
            </div>

            <div className="transaction-list">
              {visibleTransactions.map((tx) => (
                <button
                  key={tx.id}
                  className={selectedTransactionId === tx.id ? "tx-row selected" : "tx-row"}
                  onClick={() => setSelectedTransactionId(tx.id)}
                >
                  <div>
                    <strong>{tx.reference}</strong>
                    <small>{tx.service}</small>
                  </div>
                  <div className="tx-meta">
                    <span>{formatCurrency(tx.amount)}</span>
                    <span className={statusMeta[tx.status].tone}>{statusMeta[tx.status].label}</span>
                  </div>
                </button>
              ))}
              {visibleTransactions.length === 0 && <p className="empty-state">No transactions match these search and status filters.</p>}
            </div>
            <div className="scenario-shortcuts" aria-label="Demo scenarios">
              <span>DEMO SCENARIOS</span>
              <button onClick={() => { setQuery(""); setTransactionStatusFilter("All"); setSelectedTransactionId(451); }}>Confirmed failure</button>
              <button onClick={() => { setQuery(""); setTransactionStatusFilter("All"); setSelectedTransactionId(320); }}>Timeout → success</button>
              <button onClick={() => { setQuery(""); setTransactionStatusFilter("All"); setSelectedTransactionId(780); }}>Isolated failure</button>
              <button onClick={() => { setQuery(""); setTransactionStatusFilter("All"); setSelectedTransactionId(601); }}>Mobile SDK trend</button>
              <button onClick={() => { setQuery(""); setTransactionStatusFilter("All"); setSelectedTransactionId(452); }}>Already reversed</button>
            </div>
          </div>

          <div className="panel right-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Evidence</span>
                <h2>{selectedTransaction.reference}</h2>
              </div>
              <span className={statusMeta[selectedTransaction.status].tone}>{statusMeta[selectedTransaction.status].label}</span>
            </div>

            <div className="detail-grid">
              <div>
                <label>Amount</label>
                <strong>{formatCurrency(selectedTransaction.amount)}</strong>
              </div>
              <div>
                <label>Channel</label>
                <strong>{selectedTransaction.channel}</strong>
              </div>
              <div>
                <label>Service</label>
                <strong>{selectedTransaction.service}</strong>
              </div>
              <div>
                <label>Sender</label>
                <strong>{selectedTransaction.sender}</strong>
              </div>
              <div>
                <label>Recipient</label>
                <strong>{selectedTransaction.recipient}</strong>
              </div>
              <div>
                <label>Error signature</label>
                <strong>{selectedTransaction.errorCode}</strong>
              </div>
              <div><label>Created</label><strong>{new Date(selectedTransaction.createdAt).toLocaleString()}</strong></div>
              <div><label>Last updated</label><strong>{new Date(selectedTransaction.updatedAt).toLocaleString()}</strong></div>
            </div>

            <div className="info-block">
              <h3>Processor evidence</h3>
              <ul className="bullet-list">{selectedTransaction.evidence.map((signal, index) => <li key={`${signal}-${index}`}>{signal}</li>)}</ul>
            </div>

            <div className="info-block">
              <h3>Status history</h3>
              <div className="transaction-history">{selectedTransaction.history.map((step, index) => <div key={`${step}-${index}`} className="transaction-history-row"><span className="history-dot" /><span>{step}</span><small>{index === selectedTransaction.history.length - 1 ? new Date(selectedTransaction.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : new Date(selectedTransaction.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>)}</div>
            </div>

            <div className="info-block">
              <h3>Payment outcome &amp; reversal check</h3>
              <ul className="bullet-list">
                <li>Current payment state: <strong>{statusMeta[selectedTransaction.status].label}</strong></li>
                <li>Confirmed failure evidence: <strong>{selectedTransaction.status === "FAILED_CONFIRMED" ? "Present" : "Not confirmed"}</strong></li>
                <li>Successful completion signal: <strong>{selectedTransaction.status === "SUCCESS" || hasPositiveSuccessSignal([...selectedTransaction.evidence, ...selectedTransaction.history]) ? "Present — blocks reversal" : "None found"}</strong></li>
                <li>Prior or pending reversal: <strong>{["REVERSAL_PENDING", "REVERSED"].includes(selectedTransaction.status) ? "Yes — duplicate blocked" : "None found"}</strong></li>
                <li>Bank policy: <strong>{getPolicyEligibilityIssues(selectedTransaction, policy).length === 0 ? "Pass" : "Does not pass"}</strong></li>
              </ul>
              <p className={getPolicyEligibilityIssues(selectedTransaction, policy).length === 0 ? "eligibility-explanation eligibility-pass" : "eligibility-explanation eligibility-blocked"} role="status"><strong>{getPolicyEligibilityIssues(selectedTransaction, policy).length === 0 ? "Eligible for policy review" : "Why no reversal is allowed"}</strong><span>{getEligibilityExplanation(selectedTransaction, policy)}</span></p>
            </div>

            <div className="info-block">
              <div className="panel-header resolution-heading"><div><h3>Resolution action</h3><small>Policy mode: {policy.mode === "automatic" ? "Automatic · enabled" : "Manual approval required"}</small></div><button className="text-link-button" onClick={() => setActiveTab("Bank Policies")}>Configure policy</button></div>
              <p className="policy-guard-summary">Configured limit: <strong>{formatCurrency(policy.maxAmount)}</strong> · Allowed channels: <strong>{policy.allowedChannels.join(", ")}</strong></p>
              <label className="field-label" htmlFor="resolution-reason">Decision rationale</label>
              <textarea
                id="resolution-reason"
                value={resolutionReason}
                onChange={(event) => setResolutionReason(event.target.value)}
                placeholder="Capture a reason for approval or rejection"
              />
              <div className="action-row">
                <button className="primary-button" onClick={evaluateBankPolicy}>Evaluate bank policy</button>
                <button className="secondary-button" disabled={policy.mode === "automatic"} onClick={() => handleResolution("approve")}>Approve manually</button>
                <button className="quiet-danger-button" onClick={() => handleResolution("reject")}>Reject</button>
              </div>
              {selectedTransaction.status === "REVERSAL_PENDING" && <div className="simulated-response-panel"><strong>Simulate bank / processor response</strong><p>The request is pending. Select the synthetic adapter outcome to complete this demo transfer lifecycle.</p><div className="action-row"><button className="primary-button" onClick={() => simulateReversalResponse("confirmed")}>Confirm reversal completed</button><button className="quiet-danger-button" onClick={() => simulateReversalResponse("failed")}>Simulate reversal failure</button></div><small>Demo only: this does not contact the bank or move funds.</small></div>}
              {policy.mode === "automatic" && <small className="policy-auto-note">Eligible transfers are auto-approved by this demo policy. Use the evaluation button to see the decision; automatic execution applies only to eligible synthetic records.</small>}
              {decisionFeedback && <p className={decisionFeedback.startsWith("Reversal blocked") || decisionFeedback.startsWith("Enter") ? "decision-feedback feedback-warning" : "decision-feedback"} role="status">{decisionFeedback}</p>}
            </div>
          </div>
        </section>
      )}

      {activeTab === "Audit Trail" && (
        <section className="screen-grid">
          <div className="panel full-panel">
            <div className="panel-header">
              <h2>Audit and resolution history</h2>
              <span className="badge neutral">{data.auditEvents.length} events</span>
            </div>
            <div className="timeline-vertical">
              {data.auditEvents.map((event) => (
                <div key={event.id} className="history-item">
                  <div className="history-dot" />
                  <div className="history-content">
                    <strong>{event.action}</strong>
                    <small>
                      {event.actor} · {new Date(event.timestamp).toLocaleString()} · {event.entity}
                    </small>
                    <p>{event.details}</p>
                    <div className="audit-transition"><span>{event.previousState}</span><b aria-hidden="true">→</b><span>{event.newState}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab === "Bank Policies" && (
        <section className="screen-grid policy-screen">
          <div className="policy-mode-banner">
            <div className="policy-mode-icon"><AppIcon name="policy" /></div>
            <div><span className="eyebrow">BANK-CONTROLLED DECISION RULES</span><h2>Reversal authorization</h2><p>Choose whether eligible transfers require a human approver or may be automatically authorized by the configured policy.</p></div>
            <span className={policy.mode === "automatic" ? "policy-state-pill policy-state-auto" : "policy-state-pill"}><span />{policy.mode === "automatic" ? "AUTOMATION ON" : "MANUAL REVIEW"}</span>
          </div>

          <div className="content-grid policy-layout">
            <div className="panel policy-form-panel">
              <div className="panel-header"><div><h2>Transfer reversal rules</h2><p>Changes apply to policy evaluations in this demo session.</p></div><span className="badge info">POLICY-REVERSAL-01</span></div>

              <fieldset className="policy-mode-fieldset">
                <legend>Approval mode</legend>
                <label className={policyDraft.mode === "manual" ? "policy-choice selected" : "policy-choice"}>
                  <input type="radio" name="policy-mode" value="manual" checked={policyDraft.mode === "manual"} onChange={() => setPolicyDraft((current) => ({ ...current, mode: "manual" }))} />
                  <span><strong>Manual approval</strong><small>Policy checks eligibility; a bank operator must enter a reason and approve.</small></span>
                </label>
                <label className={policyDraft.mode === "automatic" ? "policy-choice selected" : "policy-choice"}>
                  <input type="radio" name="policy-mode" value="automatic" checked={policyDraft.mode === "automatic"} onChange={() => setPolicyDraft((current) => ({ ...current, mode: "automatic" }))} />
                  <span><strong>Automatic approval for eligible transfers</strong><small>Passing records are automatically submitted to the simulated reversal queue under these limits.</small></span>
                </label>
              </fieldset>

              <div className="policy-field-grid">
                <div className="policy-field"><label htmlFor="policy-max-amount">Maximum transfer amount</label><div className="amount-input-wrap"><span>₦</span><input id="policy-max-amount" type="number" min="1" step="1000" value={policyDraft.maxAmount} onChange={(event) => setPolicyDraft((current) => ({ ...current, maxAmount: Number(event.target.value) }))} /><span>NGN</span></div><small>Amounts above this ceiling always require a different/manual workflow.</small></div>
                <fieldset className="channel-fieldset"><legend>Permitted channels</legend>{["Mobile app", "Internet banking", "POS"].map((channel) => <label className="channel-option" key={channel}><input type="checkbox" checked={policyDraft.allowedChannels.includes(channel)} onChange={(event) => setPolicyDraft((current) => ({ ...current, allowedChannels: event.target.checked ? [...current.allowedChannels, channel] : current.allowedChannels.filter((item) => item !== channel) }))} /><span>{channel}</span></label>)}</fieldset>
              </div>

              <fieldset className="guardrail-fieldset"><legend>Mandatory safety guardrails</legend>
                <label><input type="checkbox" checked disabled /><span><strong>Require authoritative confirmed failure</strong><small>Timeouts and missing responses can never qualify by themselves.</small></span></label>
                <label><input type="checkbox" checked disabled /><span><strong>Block any successful completion signal</strong><small>A later success or conflicting outcome blocks an automated reversal.</small></span></label>
                <label><input type="checkbox" checked disabled /><span><strong>Enforce one reversal per transaction</strong><small>Pending or completed reversals are idempotently blocked.</small></span></label>
              </fieldset>

              <div className="policy-form-footer"><p>Policy changes are captured in the audit history. Automatic execution is simulated and never calls real banking rails.</p><button className="primary-button" onClick={saveBankPolicy}>Save bank policy</button></div>
              {policyFeedback && <p className={policyFeedback.startsWith("Enter") || policyFeedback.startsWith("Select") || policyFeedback.startsWith("The trend") ? "decision-feedback feedback-warning" : "decision-feedback"} role="status">{policyFeedback}</p>}
            </div>

            <div className="policy-side-column">
              <div className="panel policy-preview-panel"><div className="panel-header"><div><span className="eyebrow">INCIDENT DETECTION</span><h2>Trend alert threshold</h2></div><span className="badge warning">RULE ENGINE</span></div><p>Flag a shared service/error signature when enough exception transfers appear in the configured time window.</p><div className="policy-field-grid trend-threshold-fields"><div className="policy-field"><label htmlFor="trend-min-count">Minimum matching transfers</label><input id="trend-min-count" className="search-box" type="number" min="3" max="25" value={policyDraft.trendMinimumCount} onChange={(event) => setPolicyDraft((current) => ({ ...current, trendMinimumCount: Number(event.target.value) }))} /></div><div className="policy-field"><label htmlFor="trend-window">Time window (minutes)</label><input id="trend-window" className="search-box" type="number" min="1" max="60" value={policyDraft.trendWindowMinutes} onChange={(event) => setPolicyDraft((current) => ({ ...current, trendWindowMinutes: Number(event.target.value) }))} /></div></div><div className="policy-explanation"><strong>When matched</strong><span>Open or update a suspected incident, explain the common signal, then let an operator notify the payment operations, on-call, and platform responders.</span></div><button className="secondary-button full-width-button" onClick={() => setActiveTab("Overview")}>View detected trend</button></div>

              <div className="panel policy-guard-panel"><div className="policy-guard-head"><span className="policy-guard-shield"><AppIcon name="policy" /></span><div><strong>Safe-by-default controls</strong><small>Hard stops — not configurable away</small></div></div><ul><li>Confirmed failure only</li><li>No positive success evidence</li><li>No duplicate reversal</li><li>Amount and channel must match policy</li></ul><small>For production, these decisions must be enforced server-side and connected only through bank-approved, authenticated reversal interfaces.</small></div>

              <div className="panel adapter-panel"><div className="panel-header"><div><span className="eyebrow">EXECUTION ADAPTER</span><h2>Connect a reversal implementation</h2></div><span className="badge neutral">NOT CONNECTED</span></div><p>Use an existing bank-approved reversal interface, or prepare a small adapter contract if the bank does not have one. This demo calls neither.</p><div className="adapter-options"><button className={adapterMode === "existing" ? "adapter-option adapter-option-selected" : "adapter-option"} onClick={() => selectAdapterMode("existing")}><strong>Use an existing bank interface</strong><small>Map policy-approved requests to the bank&apos;s authenticated reversal API or operations queue.</small></button><button className={adapterMode === "blueprint" ? "adapter-option adapter-option-selected" : "adapter-option"} onClick={() => selectAdapterMode("blueprint")}><strong>Create an adapter blueprint</strong><small>Define request, response, idempotency, timeout, reconciliation, and audit contracts for bank implementation.</small></button></div><div className="adapter-contract"><span>DEMO CONTRACT</span><code>POST /reversals · idempotency-key · transaction-reference · reason</code><small>Response states: accepted → pending → reversed / failed. Production credentials, bank-specific mapping, security review, and tests are not configured here.</small></div>{adapterFeedback && <p className="decision-feedback" role="status">{adapterFeedback}</p>}</div>
            </div>
          </div>

          <div className="panel policy-test-panel"><div className="panel-header"><div><span className="eyebrow">TRY THE POLICY</span><h2>Test on a seeded transfer</h2><p>Use scenario shortcuts on Transactions, then evaluate the saved rule to see a manual decision, auto-approval, or a safety block.</p></div><button className="secondary-button" onClick={() => setActiveTab("Transaction Investigation")}>Open transactions</button></div><div className="policy-test-summary"><span><strong>Default mode</strong> Manual review</span><span><strong>Default cap</strong> {formatCurrency(defaultPolicy.maxAmount)}</span><span><strong>Never auto-reverse</strong> Success, timeout-only, pending reversal</span></div></div>
        </section>
      )}

      {activeTab === "Integration Layer" && (
        <section className="screen-grid integration-screen">
          <div className="integration-positioning-banner">
            <div className="integration-positioning-icon"><AppIcon name="integration" /></div>
            <div><span className="eyebrow">COMPLEMENT, DO NOT REPLACE</span><h2>One operations layer across the systems the bank already runs</h2><p>ReconcileIQ is designed to coordinate exception evidence, incident response, policy decisions, and audit context across approved bank integrations.</p></div>
            <span className="badge warning">CONCEPTUAL · NOT CONNECTED</span>
          </div>

          <div className="integration-map-panel panel">
            <div className="integration-map-title"><div><span className="eyebrow">PROPOSED RESPONSIBILITY BOUNDARY</span><h2>Existing infrastructure stays in control</h2></div><span className="integration-map-note">Institution-specific interfaces require validation</span></div>
            <div className="integration-map">
              <div className="integration-sources">
                <div className="integration-system-card"><span className="integration-system-kicker">PAYMENT NETWORK</span><strong>NIBSS</strong><p>Existing network services and payment infrastructure used by participating institutions.</p><small>Bank-approved signals / responses</small></div>
                <div className="integration-system-card"><span className="integration-system-kicker">DISPUTE / RECONCILIATION</span><strong>IDRS</strong><p>Keep the institution’s current dispute and reconciliation workflow where deployed.</p><small>Case references / status context</small></div>
                <div className="integration-system-card"><span className="integration-system-kicker">BANK SYSTEMS</span><strong>Core · Ledger · Channels</strong><p>The bank’s systems remain authoritative for customer, transaction, ledger, and final-status records.</p><small>Read-only evidence / approved commands</small></div>
              </div>

              <div className="integration-connectors" aria-label="Approved data exchange"><span>Evidence &amp; status events</span><div className="connector-line"><i /><i /><i /></div><span>Policy-approved requests &amp; outcomes</span><div className="connector-line connector-return"><i /><i /><i /></div></div>

              <div className="reconcileiq-layer-card"><div className="reconcileiq-layer-heading"><span className="brand-mark integration-brand-mark">R</span><div><span className="integration-system-kicker">CROSS-SYSTEM OPERATIONS LAYER</span><strong>ReconcileIQ</strong></div><span className="badge info">ORCHESTRATES</span></div><div className="integration-capabilities"><span>Correlates exception trends</span><span>Explains evidence &amp; uncertainty</span><span>Evaluates bank-defined policy</span><span>Routes cases &amp; responder alerts</span><span>Tracks approved request lifecycle</span><span>Maintains operator/audit context</span></div><p>ReconcileIQ does not own the payment ledger, network settlement, or an institution’s existing dispute platform. It provides a shared work surface and adapter boundary across them.</p></div>
            </div>
            <div className="integration-map-footnote"><span className="integration-footnote-mark">i</span><span>This is a proposed product boundary, not a verified NIBSS or IDRS integration specification. System ownership, feature overlap, APIs, permissions, and responsibilities differ by institution and must be confirmed with the bank, NIBSS, and IDRS owners.</span></div>
          </div>

          <div className="content-grid two-up integration-detail-grid">
            <div className="panel integration-responsibility-panel"><div className="panel-header"><div><span className="eyebrow">WHAT THE BANK KEEPS</span><h2>System of record and execution stay external</h2></div></div><ul className="integration-list"><li><strong>Money movement &amp; settlement</strong><span>Remain with the bank and network systems already authorized to perform them.</span></li><li><strong>Final transaction outcome</strong><span>Read from an authoritative ledger, processor, or bank-defined status source—not inferred from a timeout.</span></li><li><strong>Reversal endpoint &amp; permissioning</strong><span>Owned and approved by the bank; each request follows its existing controls and authorization model.</span></li><li><strong>IDRS / dispute workflow</strong><span>ReconcileIQ links or coordinates with existing case records if the institution approves that integration; it does not silently replace them.</span></li></ul></div>
            <div className="panel integration-added-panel"><div className="panel-header"><div><span className="eyebrow">WHAT RECONCILEIQ ADDS</span><h2>The cross-system gap it is designed to address</h2></div></div><ul className="integration-list"><li><strong>One correlated incident view</strong><span>Group shared signals across transfer attempts and show why they were linked.</span></li><li><strong>Evidence-to-policy handoff</strong><span>Make unresolved versus confirmed outcomes visible before a configured action is considered.</span></li><li><strong>Responder coordination</strong><span>Surface an emerging technical trend, such as a suspected deprecated SDK API, to the right bank team.</span></li><li><strong>End-to-end action context</strong><span>Connect the incident, policy decision, adapter request, response, and operator history in one review trail.</span></li></ul></div>
          </div>

          <div className="panel integration-sequence-panel"><div className="integration-map-title"><div><span className="eyebrow">EXAMPLE REQUEST LIFECYCLE</span><h2>Observe → decide → hand off → reconcile</h2></div><span className="badge neutral">SIMULATION ONLY</span></div><ol className="integration-sequence"><li><span>01</span><div><strong>Observe</strong><small>Ingest approved transaction events and stable external references.</small></div></li><li><span>02</span><div><strong>Correlate</strong><small>Group a service/error trend; keep root cause as a hypothesis for responders to verify.</small></div></li><li><span>03</span><div><strong>Apply policy</strong><small>Require confirmed failure, no success, idempotency, and bank limits.</small></div></li><li><span>04</span><div><strong>Adapter handoff</strong><small>Send a bank-authorized, idempotent request only through an approved interface.</small></div></li><li><span>05</span><div><strong>Reconcile response</strong><small>Map accepted, pending, completed, or failed status back to case and audit context.</small></div></li></ol><div className="integration-footer-note">Current prototype: all inputs, decisions, notifications, and responses are synthetic local demo state. No NIBSS, IDRS, bank core, external paging service, or reversal endpoint is connected.</div></div>
        </section>
      )}
        </div>
      </main>
    </div>
  );
}
