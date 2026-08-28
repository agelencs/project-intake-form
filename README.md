# Automation Intake Form

Local tool for capturing automation opportunities from business users, scoring them on impact vs feasibility, and managing a prioritised backlog.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo data

The dashboard ships with 3 example submissions. To reset them:

```bash
npm run seed
```

## What you get

- **/** — 7-step intake form (48 questions, conditional branches)
- **/dashboard** — backlog of all submissions, filterable by priority bucket
- **/dashboard/[id]** — full detail view with scores, feedback, flags, and all answers
- Submissions stored in `data/submissions.json` (no database)

## Priority buckets

| Bucket | Meaning |
|--------|---------|
| Do first | High impact + high feasibility |
| Investigate | High impact but needs discovery/examples |
| Easy win | Lower impact but straightforward |
| Park | Low priority or process still changing |

## Scoring

Each submission gets:

- **Impact** (0–100) — volume, audience, consequences, urgency
- **Feasibility** (0–100) — repeatability, data shape, tools, discovery readiness
- **Risk** (0–100) — key-person dependency, sensitive data
- **Confidence** — high / medium / low based on submitter proximity and data quality

Estimated hours/year is calculated from frequency × count × duration × people.
