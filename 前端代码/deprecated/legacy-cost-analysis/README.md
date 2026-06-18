# Legacy Cost Analysis

Status: deprecated.

This folder preserves the old `/cost-analysis` material cost analysis implementation for history only. It is not part of the active frontend route tree, sidebar, permissions, or current non-ABC audit scope.

Decision date: 2026-06-17.

Timestamp evidence:

- `前端代码/src/pages/report/CostAnalysis.tsx` existed in the 2026-05-11 baseline.
- It was split into `hooks/` and `components/` on 2026-05-25.
- ABC v4.3 was implemented on 2026-06-04 and the active cost-management UI now lives under `/abc/*`.

Do not fix or extend this code unless the product decision changes explicitly.
