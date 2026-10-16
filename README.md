# ReconcileIQ

ReconcileIQ is a synthetic payment-operations demo for investigating payment exceptions, correlating incidents, checking reversal eligibility, and reviewing case history.

> **Demo only:** all ledger data and reversal actions are simulated. This app does not connect to a bank or move real money.

## Requirements

- Node.js 20.9 or later
- npm

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available scripts

```bash
npm run dev        # Start the local development server
npm run lint       # Run ESLint
npm run typecheck  # Run the TypeScript compiler without emitting files
npm run build      # Create the optimized production build
npm start          # Serve the production build locally
```

## Deploy to Vercel

This is a standard Next.js App Router application. Vercel detects the framework automatically; no `vercel.json`, custom build command, output directory, or environment variables are required for the synthetic demo.

1. Import the GitHub repository into [Vercel](https://vercel.com/new).
2. Select the repository root containing this `package.json` as the project root.
3. Keep the detected Next.js framework and default build settings.
4. Deploy. Vercel runs the production build and creates preview deployments for branches and deployments for the configured production branch.

You can also connect the repository to an existing Vercel project. Pushes to its configured production branch trigger a deployment; other branches generate previews.

## Demo workflow

The workspace includes five operational screens (F1–F5): Overview, Incidents, Incident Detail, Transactions, and Audit Trail; Bank Policies (F6); and an Integration Layer view (F7). Seeded cases demonstrate a correlated service outage, an eligible confirmed failure, a timeout later confirmed successful, an isolated failure, a completed reversal, and a mobile SDK deprecation error trend with simulated responder notifications.

Bank Policies lets a presenter configure manual or automatic approval mode, an amount cap, allowed channels, and trend thresholds. Saving Automatic mode applies the rules to the existing confirmed-failure backlog without requiring an operator approval click for each transfer. The synthetic demo adapter immediately returns a completed result for passing records so Reversed is visible; real bank adapters may respond asynchronously. Transfers must pass mandatory confirmed-failure, no-success, no-duplicate, amount, and channel checks. Manual approvals require a reason and confirmation. The transaction view explains why Success, Pending, Review required, Reversal pending, or Reversed records cannot be submitted again. No real funds are moved.

The policy page previews two future integration paths: connect to a bank-approved reversal adapter or define a new adapter blueprint. The Integration Layer screen positions ReconcileIQ as a coordination/orchestration layer alongside NIBSS, IDRS, and bank systems—not a replacement. This map is conceptual: exact system roles, capabilities, APIs, and ownership must be confirmed with each institution and system owner. No bank interface nor email/SMS/paging notifications are connected. All policy edits, decisions, and simulated responder alerts are demo-session state and are recorded in the local audit history.
