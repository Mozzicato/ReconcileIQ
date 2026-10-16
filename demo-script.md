# ReconcileIQ — Live Demo Script

**Target length:** 7–8 minutes
**App:** `http://localhost:3000` or the deployed Vercel URL
**Starting state:** fresh demo data, Overview selected
**Navigation:** F1 Overview · F2 Incidents · F3 Incident Detail · F4 Transactions · F5 Audit Trail · F6 Bank Policies · F7 Integration Layer

> All transactions, bank policy evaluations, responder notifications, and reversal actions in this walkthrough are synthetic. The simulated reversal does not move real funds, and no external notifications or bank interfaces are connected.

## Before presenting

1. Open the app and select **Reset demo** so the seeded data and audit history are back to their initial state.
2. Make sure the app is on **Overview (F1)** and the browser is at a readable desktop width.
3. Keep the pitch's scope disclaimer: this is a workflow prototype, not a live banking integration.

## 1. Start at the operations overview — F1 (about 40 seconds)

**Do:** Show the KPI cards, incident queue, status distribution, deadline alerts, and recent activity.

**Say:**

> “This is the operations overview. The figures are based on one thousand synthetic ledger records. The cards link into the corresponding incident or transaction worklists, and the queue and deadline panels help an analyst see where to focus.”

**Point out:** the demo-data label/environment, incident count, eligible cases, and the due-soon KPI. Avoid implying these are live bank metrics.

**Say:**

> “The seeded bank policy is in automatic mode. Confirmed failures within its rules have already passed through the simulated adapter and are marked Reversed. That means this is not waiting for an operator to click approve on every row. The synthetic adapter is instant for the demo; the remaining high-value failure is held by the configured amount cap.”

## 2. Review the suspected correlation — F2 → F3 (about 60 seconds)

**Do:** Press **F2** or select **Incidents**. Open **Shared service disruption on WEMA-CORE-17**. On its detail screen, show the confidence, shared service/error signature, six linked references, owner, deadline, and case notes.

**Say:**

> “The incident list is searchable and filterable. This seeded case groups six records around the same simulated service and timeout signature in a short time window. The confidence score describes the strength of those shared signals; it is not proof of a common root cause.”

> “The case view gives the operator the affected transactions, review deadline, owner, and notes together. I can confirm, reassign, update notes, resolve, or dismiss the case; those case changes appear in the audit trail.”

**Optional interaction:** Click **Confirm incident** to demonstrate the status change, then mention that the action is recorded. If you do this, the audit history will include that event for the rest of the demo.

## 3. Explain the reversal decision — F4, timeout followed by success (about 60 seconds)

**Do:** Press **F4** or select **Transactions**. Under **Demo scenarios**, choose **Timeout → success**. The selected record is `REF-000320`. Show its **Success** state, later settlement evidence, and the eligibility explanation. Click **Evaluate bank policy**.

**Say:**

> “This payment is marked Success because the later ledger event confirmed completion. That is why the page says not to reverse it. A timeout only means the first response was missing; it does not tell us whether funds moved. For a Pending payment, we wait for an authoritative outcome. For Review required, an operator investigates the conflicting evidence. Only a confirmed failure can pass the reversal policy.”

**Expected result:** the policy explains that a success signal blocks reversal; the payment remains **Success**. No confirmation dialog appears.

## 4. Show bank-configured approval and adapter setup — F6 (about 75 seconds)

**Do:** Press **F6** or select **Bank Policies**. Point out that **Automatic approval** is the seeded mode, with a maximum amount of ₦100,000, permitted channels, and mandatory safety controls. Mention that Manual approval is available when the bank requires human sign-off.

**Say:**

> “The policy belongs to the bank. It sets the approval mode, amount ceiling, and permitted channels. Automatic approval does not mean reversing every timeout: the guardrails still require an authoritative confirmed failure, no successful outcome, no duplicate, and an amount within the limit. These safety requirements cannot be switched off.”

**Do:** Change the maximum amount to **₦200,000** and select **Save & apply automatic policy**. Accept the confirmation if prompted. The app returns to F4 with the Reversed list; `REF-000451`, previously held above the ₦100,000 cap, is now included.

**Say:**

> “I changed the bank policy cap, not the transaction status. The policy now accepts this confirmed failure, so it is automatically authorized and the demo adapter reports completion. No operator approval was requested. If the transfer were still Pending, had a success signal, or had a duplicate reversal, raising the amount cap would not make it eligible.”

**Do:** On the same page, show **Connect a reversal implementation**. Select either the existing-interface option or the blueprint option.

**Say:**

> “If the bank already has an approved reversal interface, the intended production path is to connect through a bank-owned adapter and map its statuses. If it does not, this contract preview shows what must be designed and tested: the request, idempotency key, response lifecycle, and reconciliation behavior. Neither option is connected in this prototype.”

## 5. Verify the policy-applied reversal — F4 (about 35 seconds)

**Do:** On F4, show the new `REF-000451` row as **Reversed**. Open it and point to the generated reversal reference and status history. Use the **Already reversed** scenario shortcut to show seeded `REF-000452` / `SIM-REV-000452`, if useful.

**Say:**

> “The transfer is visibly complete, not waiting for a human approval. The reference and simulated adapter response are in the evidence and history. If evaluated again, the policy blocks a duplicate because it is already reversed.”

## 6. Show an emerging technical trend and responder ping — F1 (about 60 seconds)

**Do:** Return to **F1 Overview** and show **Emerging transfer trends**. The seeded **MOBILE-TRANSFER-SDK / SDK_DEPRECATED_API** pattern is prioritized. Point out the six matched transfers and the simulated in-app responder inbox. Click **Open investigation** to visit the linked incident, then return to the overview if you want to use **Re-notify response team**.

**Say:**

> “The trend detector groups repeated service and error signatures inside the configured time window. Here, six mobile transfers share an SDK deprecation signature. The detector does not assert that the SDK is definitely the root cause, and because final payment outcomes are unconfirmed, this cluster is not reversal-eligible. It automatically creates demo inbox notifications for payments operations, on-call, and mobile platform workers so they can investigate the release and confirm processor outcomes.”

> “This inbox is simulated; it does not send email, SMS, or pages to real employees.”

## 7. Explain why ReconcileIQ works alongside existing systems — F7 (about 60 seconds)

**Do:** Press **F7** or select **Integration Layer**. Walk left to right: NIBSS, the bank’s IDRS/dispute workflow, and core/ledger/channels feed approved event/status context into the ReconcileIQ coordination layer. Follow the adapter path back to the bank-owned execution systems.

**Say:**

> “ReconcileIQ is not pitching a replacement for NIBSS, IDRS, the bank’s ledger, or existing dispute processes. Those systems keep their own responsibilities and remain authoritative. The proposed layer is the shared operations workflow across them: correlate exceptions, explain evidence, apply the bank’s policy, route the right team, and track an approved request through its response.”

> “This map is conceptual. NIBSS and IDRS capabilities and interfaces vary by institution; we would validate overlap and integration contracts with their owners before implementation.”

## 8. Close on accountability — F5 (about 30 seconds)

**Do:** Press **F5** or select **Audit Trail**. Point out the policy update, automatic policy decision, worker notification, actor, reference, reason, and status transitions.

**Say:**

> “The audit trail records policy changes, blocks, simulated approvals and responses, adapter choices, and responder notifications alongside the original payment events. Next we would validate the architecture and boundaries with bank, NIBSS, and IDRS owners—not connect a prototype directly to payment rails.”

## Close (about 15 seconds)

> “That is the ReconcileIQ workflow: detect a trend across existing systems, explain what is and is not known, let bank policy control resolution, reconcile the response, and preserve the decision history—all without replacing the systems that already process or record the payment.”

## Optional fourth scenario: isolated failure

If time permits, return to **F4 → Isolated failure** (`REF-000780`). Explain that an individual confirmed failure remains available for transaction review without being presented as evidence of a shared service incident. This illustrates why a single exception should not automatically be promoted into a suspected cluster.

## Recovery notes

- **Wrong screen:** press its F-key (F1–F7) or use the left navigation.
- **Changed demo data:** use **Reset demo**. It restores the synthetic seed, reapplies the default automatic bank policy to matching confirmed failures, and clears user-created audit events.
- **Reversal dialog:** it appears only when a manual reversal passes the checks; confirm only while presenting the intended synthetic scenario.
- **Automatic backlog:** saving Automatic mode applies policy to existing confirmed failures and returns to F4 filtered to completed synthetic reversals. Cases over the cap or outside allowed channels are not reversed.
- **Manual vs. automatic:** the seeded default is Automatic with a ₦100,000 cap; enabling automatic mode requires confirmation. The demo adapter responds immediately only to make the completed lifecycle visible; production responses may be asynchronous.
- **Policy demonstration:** policy settings and outcomes are synthetic session state and reset with demo data.
- **SDK alert:** the seeded mobile SDK signature is a suspected technical cause for the responder team to validate; payment completion remains unconfirmed and must not be reversed.
- **Skip the irreversible-looking demo interaction:** you can explain the eligibility result without clicking Approve. All actions are local demo state, but do not describe them as real payment operations.
- **Time is short:** prioritize F1 SDK trend → F4 explain blocked Success → F6 save automatic policy → F4 show the reversed backlog → F7 coexistence map → F5 audit.
