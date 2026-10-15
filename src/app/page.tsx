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
  | "Audit Trail";

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
];

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

type IconName = "overview" | "incidents" | "detail" | "transactions" | "audit" | "activity";

function AppIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, string[]> = {
    overview: ["M3 3h7v7H3z", "M14 3h7v4h-7z", "M14 10h7v11h-7z", "M3 14h7v7H3z"],
    incidents: ["M12 9v4", "M12 17h.01", "M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3l-7.5-13.1a2 2 0 0 0-3.4 0Z"],
    detail: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
    transactions: ["M7 7h14", "m17 3 4 4-4 4", "M17 17H3", "m7 13-4 4 4 4"],
    audit: ["M8 4h12v17H4V4h2", "M8 2h8v4H8z", "M8 11h8", "M8 15h6"],
    activity: ["M22 12h-4l-3 9L9 3l-3 9H2"],
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
      newState: "REVIEW_REQUIRED",
      details: "A later status event confirmed the payment succeeded.",
    },
  ];

  return { transactions, incidents, auditEvents };
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

    if (!resolutionReason.trim()) {
      setDecisionFeedback("Enter a decision rationale before recording this action.");
      return;
    }

    if (decision === "approve") {
      const isEligible =
        selectedTransaction.status === "FAILED_CONFIRMED" &&
        selectedTransaction.isEligible &&
        !hasPositiveSuccessSignal([...selectedTransaction.evidence, ...selectedTransaction.history]);

      if (!isEligible) {
        setDecisionFeedback("Reversal blocked: this payment is not confirmed eligible. Conflicting, successful, or unresolved outcomes require manual review.");
        setData((previous) => ({
          ...previous,
          transactions: previous.transactions.map((tx) =>
            tx.id === selectedTransaction.id
              ? {
                  ...tx,
                  status: ["SUCCESS", "REVERSAL_PENDING", "REVERSED"].includes(tx.status) ? tx.status : "REVIEW_REQUIRED",
                  updatedAt: new Date().toISOString(),
                  evidence: [...tx.evidence, tx.status === "SUCCESS" ? "Reversal blocked: later status evidence confirms successful completion." : "Manual review required: conflicting evidence or successful completion signal exists."],
                  history: [...tx.history, "Operator attempted reversal but eligibility checks failed."],
                  operatorNote: resolutionReason || "Blocking reason not supplied.",
                }
              : tx,
          ),
        }));
        appendAudit({
          actor: "Demo operator",
          action: "Reversal blocked",
          entity: selectedTransaction.reference,
          previousState: selectedTransaction.status,
          newState: "REVIEW_REQUIRED",
          details: resolutionReason || "Conflicting evidence blocked the simulated reversal.",
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
      if (event.key.match(/^F[1-5]$/) && index >= 0) {
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
            const iconName: IconName = tab === "Overview" ? "overview" : tab === "Incidents" ? "incidents" : tab === "Incident Detail" ? "detail" : tab === "Transaction Investigation" ? "transactions" : "audit";
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
              <h3>Reversal eligibility</h3>
              <ul className="bullet-list">
                <li>Confirmed failed according to evidence: {selectedTransaction.status === "FAILED_CONFIRMED" ? "Yes" : "No"}</li>
                <li>No later success signal: {!hasPositiveSuccessSignal([...selectedTransaction.evidence, ...selectedTransaction.history]) && selectedTransaction.status !== "SUCCESS" ? "Yes" : "No"}</li>
                <li>No existing reversal record: {selectedTransaction.status !== "REVERSAL_PENDING" && selectedTransaction.status !== "REVERSED" ? "Yes" : "No"}</li>
                <li>Policy compliant: {selectedTransaction.isEligible ? "Yes" : "No"}</li>
              </ul>
              {!selectedTransaction.isEligible && <p className="blocked-explanation">This payment is not eligible for reversal. A timeout alone is not proof of failure; successful or unresolved payments must not be reversed.</p>}
            </div>

            <div className="info-block">
              <h3>Resolution action</h3>
              <label className="field-label" htmlFor="resolution-reason">Decision rationale</label>
              <textarea
                id="resolution-reason"
                value={resolutionReason}
                onChange={(event) => setResolutionReason(event.target.value)}
                placeholder="Capture a reason for approval or rejection"
              />
              <div className="action-row">
                <button className="primary-button" onClick={() => handleResolution("approve")}>Approve reversal</button>
                <button className="secondary-button" onClick={() => handleResolution("reject")}>Reject</button>
              </div>
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
        </div>
      </main>
    </div>
  );
}
