"use client";

import { useMemo, useState } from "react";

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
      createdAt.getTime() + index * 70 * 1000 + (index % 9) * 15000,
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
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedIncidentId, setSelectedIncidentId] = useState(seed.incidents[0].id);
  const [selectedTransactionId, setSelectedTransactionId] = useState(
    seed.transactions.find((item) => item.id === 451)?.id ?? seed.transactions[0].id,
  );
  const [resolutionReason, setResolutionReason] = useState("");

  const filteredTransactions = useMemo(() => {
    return data.transactions.filter((tx) => {
      const matchesQuery =
        query.trim() === "" ||
        tx.reference.toLowerCase().includes(query.toLowerCase()) ||
        tx.service.toLowerCase().includes(query.toLowerCase()) ||
        tx.recipient.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === "All" || tx.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [data.transactions, query, statusFilter]);

  const selectedIncident =
    data.incidents.find((incident) => incident.id === selectedIncidentId) ?? data.incidents[0];
  const selectedTransaction =
    data.transactions.find((tx) => tx.id === selectedTransactionId) ?? data.transactions[0];

  const overviewStats = useMemo(() => {
    const total = data.transactions.length;
    const unresolved = data.transactions.filter((tx) =>
      ["PENDING", "REVIEW_REQUIRED", "REVERSAL_PENDING"].includes(tx.status),
    ).length;
    const eligible = data.transactions.filter((tx) => tx.isEligible && tx.status === "FAILED_CONFIRMED").length;
    const nearDeadline = data.incidents.filter((incident) => {
      const deadline = new Date(incident.deadline).getTime();
      const now = new Date("2026-10-15T15:00:00Z").getTime();
      const hoursLeft = (deadline - now) / (1000 * 60 * 60);
      return hoursLeft < 8 && hoursLeft > 0;
    }).length;

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

    if (decision === "approve") {
      const isEligible =
        selectedTransaction.status === "FAILED_CONFIRMED" &&
        !selectedTransaction.evidence.some((signal) => signal.toLowerCase().includes("succeeded")) &&
        !selectedTransaction.history.some((step) => step.toLowerCase().includes("success"));

      if (!isEligible) {
        setData((previous) => ({
          ...previous,
          transactions: previous.transactions.map((tx) =>
            tx.id === selectedTransaction.id
              ? {
                  ...tx,
                  status: "REVIEW_REQUIRED",
                  evidence: [...tx.evidence, "Manual review required: conflicting evidence or successful completion signal exists."],
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

      setData((previous) => ({
        ...previous,
        transactions: previous.transactions.map((tx) =>
          tx.id === selectedTransaction.id
            ? {
                ...tx,
                status: "REVERSAL_PENDING",
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
      setResolutionReason("");
      return;
    }

    setData((previous) => ({
      ...previous,
      transactions: previous.transactions.map((tx) =>
        tx.id === selectedTransaction.id
          ? {
              ...tx,
              status: "REVIEW_REQUIRED",
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
      newState: "REVIEW_REQUIRED",
      details: resolutionReason || "No reason provided for rejection.",
    });
    setResolutionReason("");
  };

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

  return (
    <main className="page-shell">
      <div className="topbar">
        <div>
          <span className="eyebrow">Synthetic demo data</span>
          <h1>ReconcileIQ</h1>
        </div>
        <div className="topbar-actions">
          <button className="secondary-button" onClick={handleReset}>Reset demo data</button>
          <button className="primary-button">Operator: Amina Okafor</button>
        </div>
      </div>

      <nav className="tabs" aria-label="Screens">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? "tab tab-active" : "tab"}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "Overview" && (
        <section className="screen-grid">
          <div className="metrics-grid">
            <div className="metric-card">
              <span>Total transactions</span>
              <strong>{overviewStats.total.toLocaleString()}</strong>
              <small>Across the seeded demo ledger</small>
            </div>
            <div className="metric-card">
              <span>Suspected incidents</span>
              <strong>{overviewStats.incidents}</strong>
              <small>Service clusters under review</small>
            </div>
            <div className="metric-card">
              <span>Unresolved exceptions</span>
              <strong>{overviewStats.unresolved}</strong>
              <small>Pending investigation</small>
            </div>
            <div className="metric-card">
              <span>Eligible cases</span>
              <strong>{overviewStats.eligible}</strong>
              <small>Awaiting review and approval</small>
            </div>
          </div>

          <div className="content-grid two-up">
            <div className="panel">
              <div className="panel-header">
                <h2>Incident queue</h2>
                <span className="badge danger">{data.incidents.length} open</span>
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
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search incidents or service"
              className="search-box"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="filter-box">
              <option value="All">All statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_REVIEW">In review</option>
              <option value="DISMISSED">Dismissed</option>
            </select>
          </div>

          <div className="panel full-panel">
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
                {data.incidents.map((incident) => (
                  <tr key={incident.id} onClick={() => setSelectedIncidentId(incident.id)}>
                    <td>
                      <button className="link-button" onClick={() => setActiveTab("Incident Detail")}>
                        {incident.title}
                      </button>
                    </td>
                    <td>
                      <span className={`priority ${incident.priority.toLowerCase()}`}>{incident.priority}</span>
                    </td>
                    <td>{incident.transactionIds.length}</td>
                    <td>{incident.suspectedCause}</td>
                    <td>{incident.status}</td>
                    <td>{Math.max(1, Math.round((Date.now() - new Date(incident.detectedAt).getTime()) / (1000 * 60 * 60))) + "h"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                  <p>
                    Confidence: <strong>{selectedIncident.confidence * 100}%</strong>
                  </p>
                </div>

                <div className="info-block">
                  <h3>Linked transactions</h3>
                  <ul className="bullet-list">
                    {selectedIncident.transactionIds.map((id) => {
                      const tx = data.transactions.find((item) => item.id === id);
                      return (
                        <li key={id}>
                          <button className="link-button" onClick={() => { setSelectedTransactionId(id); setActiveTab("Transaction Investigation"); }}>
                            {tx?.reference} · {tx?.service} · {statusMeta[tx?.status ?? "PENDING"].label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              <div className="detail-column">
                <div className="info-block">
                  <h3>Timeline</h3>
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
                        <strong>Deadline</strong>
                        <small>{new Date(selectedIncident.deadline).toLocaleString()}</small>
                      </div>
                    </div>
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
                className="search-box"
              />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="filter-box">
                <option value="All">All states</option>
                {Object.entries(statusMeta).map(([status, meta]) => (
                  <option key={status} value={status}>{meta.label}</option>
                ))}
              </select>
            </div>

            <div className="transaction-list">
              {filteredTransactions.slice(0, 15).map((tx) => (
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
                <label>Evidence</label>
                <strong>{selectedTransaction.errorCode}</strong>
              </div>
            </div>

            <div className="info-block">
              <h3>Eligibility checks</h3>
              <ul className="bullet-list">
                <li>Confirmed failed according to evidence: {selectedTransaction.status === "FAILED_CONFIRMED" ? "Yes" : "No"}</li>
                <li>No later success signal: {selectedTransaction.status !== "SUCCESS" ? "Yes" : "No"}</li>
                <li>No existing reversal record: {selectedTransaction.status !== "REVERSAL_PENDING" && selectedTransaction.status !== "REVERSED" ? "Yes" : "No"}</li>
                <li>Policy compliant: {selectedTransaction.isEligible ? "Yes" : "No"}</li>
              </ul>
            </div>

            <div className="info-block">
              <h3>Resolution action</h3>
              <textarea
                value={resolutionReason}
                onChange={(event) => setResolutionReason(event.target.value)}
                placeholder="Capture a reason for approval or rejection"
              />
              <div className="action-row">
                <button className="primary-button" onClick={() => handleResolution("approve")}>Approve reversal</button>
                <button className="secondary-button" onClick={() => handleResolution("reject")}>Reject</button>
              </div>
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
                      {event.actor} · {new Date(event.timestamp).toLocaleString()}
                    </small>
                    <p>{event.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
