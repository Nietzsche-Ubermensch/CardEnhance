# CardEnhance Dashboard Plan

## Current State
- `src/routes/index.tsx` (228B) — empty stub
- `src/routes/__root.tsx` (1.3KB) — root layout
- `src/routes/audit.tsx` (4.1KB) — audit page exists
- `src/routes/connectors.tsx` (11.9KB) — connector management exists
- `src/components/studio/studio-app.tsx` (35KB) — main studio UI exists
- `src/lib/jobs.ts` (7KB) — job queue system exists
- `src/lib/prices.ts` (9.6KB) — pricing engine exists
- `src/lib/connectors/status.ts` (3.7KB) — connector health exists
- `src/lib/pipeline.ts` (6.5KB) — pipeline orchestration exists

## Dashboard Layout (`/` route)

### Row 1: Stat Cards (4)
- Cards Processed (from jobs.ts)
- OCR Accuracy (from identify.ts results)
- Active Jobs (from jobs.ts queue)
- Connectors Live (from connectors/status.ts)

### Row 2: Pipeline Overview
- Visual pipeline: Detect → Rectify → OCR → Enhance → Export
- Each stage shows count + last-run time
- Click to navigate to studio with that stage active

### Row 3: Two-column
- Left: Recent Jobs table (filename, player, status, date) from jobs.ts
- Right: Connector Health (6 services) from connectors/status.ts

### Row 4: Quick Actions
- Upload Cards → /studio
- View Audit → /audit
- Manage Connectors → /connectors
- View Library → /library

## Integration Points
- `jobs.ts` → recent jobs + stats
- `connectors/status.ts` → health checks
- `prices.ts` → price summary
- `pipeline.ts` → pipeline stage status
- `studio-app.tsx` → deep link to studio

## Build Order
1. Push DASHBOARD_PLAN.md
2. Build index.tsx with stat cards + quick actions
3. Wire to jobs.ts + connectors/status.ts
4. Add pipeline overview visualization
5. Add recent jobs table
6. Add connector health sidebar
