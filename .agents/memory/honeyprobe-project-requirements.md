---
name: HoneyProbe project requirements
description: Durable scope and safety constraints for completing the existing HoneyProbe product.
---

Treat the user's HoneyProbe project guidance and attached final implementation prompt as the governing acceptance checklist for work in this repository. The goal is a real integrated cybersecurity system, not a dashboard mockup: Phase 1 protected API/authentication/persistent database; Phase 2 event ingestion/detection/findings/linked evidence; Phase 3 safe response recommendations and audit logs, preview-only by default; Phase 4 functional frontend showing actual backend data. The user reports the local decoy-to-event-to-finding-to-evidence pipeline and backend restart persistence have passed; treat these as prior results and reproduce before claiming current verification. Remaining priorities include Clerk setup, authenticated Live integration, frontend tests and production build, dependency advisories, and security checks. Final deliverables include verified end-to-end functionality, genuine screenshots, accurate test results, and the Phase II presentation. The full prompt remains in the user's attached project file; consult it before substantial implementation or verification.

**Why:** the user explicitly asked that the attached prompt be remembered as the project's system-level requirements.

**How to apply:** preserve working behavior and the existing structure; use isolated test data; do not invent credentials or bypass authorization; distinguish blocked checks from passes; and do not commit, push, publish, deploy, expose services publicly, or perform destructive operations without explicit approval. These are project instructions and remain subordinate to platform, system, and safety requirements.

Standalone Phase 4 artifact workflow can start before the combined HoneyProbe launcher has installed workspace dependencies, producing `vite: not found`. Once the combined workflow's locked install completes, restart the artifact workflow; it can run independently after that.

**Why:** the artifact workflow failed before installation and started successfully after the Phase 4 dependencies were present.

**How to apply:** when only the standalone console artifact fails with a missing Vite executable, check install timing and workflow status before changing application code or lockfiles.

## Combined workflow runtime alignment

The root Replit Python module must meet the backend's minimum Python version, and `uv` must use that same interpreter version. A `uv` environment created with a newer Python than the Replit wrapper can mix standard-library and site-package versions; Uvicorn's reload subprocess may then fail even when imports appear to work. The standalone API artifact also shares ports with the combined Project workflow.

**Why:** the root workflow originally combined a Python 3.14 virtual environment with a Python 3.12 wrapper, which broke Uvicorn's reload child. Aligning the Replit module and `UV_PYTHON` to Python 3.13 fixed reload and combined startup.

**How to apply:** before changing backend dependencies, compare the root Replit runtime, `pyproject.toml`'s Python requirement, and `.pythonlibs/pyvenv.cfg`; pin `UV_PYTHON` to the installed compatible minor and resync with the locked `uv` project. This workspace exposes Python 3.13 as the Replit module ID `python-base-3.13` (not `python-3.13`). Keep the standalone API workflow stopped while the combined Project workflow runs.
