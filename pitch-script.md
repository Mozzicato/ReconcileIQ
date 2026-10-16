# ReconcileIQ — Pitch Script

## 90-second pitch

**[Opening | 0:00–0:15]**

When a payment times out, the customer may see a debit, the operator may see a failure, and the final settlement status may still be unknown. The hard part is not displaying another transaction list. It is safely finding out what happened—and showing why the next action is justified.

**[Problem and solution | 0:15–0:40]**

ReconcileIQ is a payment recovery and incident-intelligence workspace for payment operations teams. It brings the workflow together: detect a suspected cluster of exceptions, inspect the linked payment evidence, and record a safe, accountable resolution. Instead of treating each alert as isolated, the operator can see which records share a simulated service and error pattern, then investigate those records together.

**[Differentiator | 0:40–1:05]**

Safety is central. A bank can choose manual approval or automatic approval within an amount limit and permitted channels. Even automation cannot bypass confirmed-failure evidence, a success-signal block, or duplicate prevention; a timeout alone never qualifies. Approval queues a request—it is not a completed reversal. The app waits for an adapter response before marking a transfer Reversed or Reversal failed. Repeated service/error signatures—such as a possible deprecated mobile SDK API—surface as suspected trends and demo alerts for operations, on-call, and platform responders. These are leads to investigate, not claims of proven root cause.

ReconcileIQ is designed as a coordination layer alongside NIBSS, the bank’s IDRS/dispute workflow, and bank core systems—not a replacement for them. Those systems remain authoritative for their own records and processing. The proposed integration would use bank-approved adapters to correlate evidence, apply bank policy, route a case, and follow the response. Exact capability overlap and interfaces must be validated with each institution and system owner.

**[Scope and close | 1:05–1:30]**

This prototype uses synthetic data: it connects to no bank systems, sends no real notifications, and moves no money. We would validate the workflow with operations teams using measures such as investigation time, correct routing, and safe-resolution rate. ReconcileIQ turns a confusing exception into a traceable decision.

## Short version (30 seconds)

ReconcileIQ helps payment operations teams investigate payment exceptions from detection through resolution. Banks can configure manual or policy-based automatic reversal approval with strict limits and safety checks; a timeout alone is never enough. It also flags repeated failure signatures and routes simulated alerts to the right responders, such as a mobile platform team investigating a possible SDK regression. This prototype uses synthetic data and connects to no bank systems or real-money payment rails.

## Presenter reminders

- Say **“suspected incident”** or **“correlated signals,”** not “proven root cause.”
- Describe benefits as a **hypothesis to validate**, not a proven reduction in complaints, losses, fines, or handling time.
- State clearly that all ledger data and reversal actions are synthetic.
- Describe auto-approval as a configurable policy demonstration, not autonomous production financial processing.
- Describe a potential SDK regression as a lead for responders to validate, not an established cause.
- Do not imply a live Wema Bank, NIBSS, processor, or core-banking integration.
- Transition into the demo: **“I’ll show the same case from the operations overview, through evidence review, to a recorded resolution.”**
