# HoneyProbe security scan results

**Run date:** 2026-10-23  
**Scope:** current Phase 1 and Phase 4 workspace dependencies and source.

## Latest scan summary

| Scan | Result |
|---|---|
| Dependency audit | 0 critical, 2 high, 0 moderate, 0 low, 0 informational |
| SAST | 0 findings |
| Privacy/dataflow (HoundDog) | 0 findings |

The dependency audit reported the same high advisory in both workspace dependency
contexts:

- **GHSA-vfj7-8cjw-p6xm — `braces@3.0.3`**. The transitive chain is
  `http-proxy-middleware@4.2.0 → micromatch@4.0.8 → braces@3.0.3`. The advisory
  concerns denial of service from deeply nested brace patterns. The audit
  returned no fixed version. Do not force an unverified override; update the
  dependency chain when an upstream fix is available and rerun the audit and
  production builds.

The prior moderate `postcss-selector-parser` advisory was addressed by resolving
it to `7.1.7` in both workspace lockfiles. The latest audit reports no remaining
moderate findings. The Phase 1 workspace typecheck and Phase 4 production build
both pass with that version.

## Residual risk

The high `braces` advisory remains unresolved because the scanner reports no
fixed release. This report records the remaining dependency risk; it is not a
claim that all dependencies are vulnerability-free.
