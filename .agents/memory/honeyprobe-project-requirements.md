---
name: HoneyProbe project requirements
description: Durable scope and safety constraints for completing the existing HoneyProbe product.
---

Treat the user's HoneyProbe project guidance and attached final implementation prompt as the governing acceptance checklist for work in this repository. The goal is a real integrated cybersecurity system, not a dashboard mockup: Phase 1 protected API/authentication/persistent database; Phase 2 event ingestion/detection/findings/linked evidence; Phase 3 safe response recommendations and audit logs, preview-only by default; Phase 4 functional frontend showing actual backend data. The user reports the local decoy-to-event-to-finding-to-evidence pipeline and backend restart persistence have passed; treat these as prior results and reproduce before claiming current verification. Remaining priorities include Clerk setup, authenticated Live integration, frontend tests and production build, dependency advisories, and security checks. Final deliverables include verified end-to-end functionality, genuine screenshots, accurate test results, and the Phase II presentation. The full prompt remains in the user's attached project file; consult it before substantial implementation or verification.

**Why:** the user explicitly asked that the attached prompt be remembered as the project's system-level requirements.

**How to apply:** preserve working behavior and the existing structure; use isolated test data; do not invent credentials or bypass authorization; distinguish blocked checks from passes; and do not commit, push, publish, deploy, expose services publicly, or perform destructive operations without explicit approval. These are project instructions and remain subordinate to platform, system, and safety requirements.
