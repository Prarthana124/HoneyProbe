---
name: Managed artifact manifest updates
description: Platform restrictions and validation behavior for changing registered artifact TOML.
---

Direct edits to `.replit-artifact/artifact.toml` are blocked. Stage the revised TOML in a sibling temporary file, then use the verified artifact TOML replacement callback with absolute paths. The replacement validator can reject manifests whose `previewPath` duplicates another artifact.

**Why:** a direct edit was rejected, and the supported replacement flow enforced path validation.

**How to apply:** do not bypass the guard with shell writes or change a preview route merely to satisfy validation. If duplicate paths block a needed update, inspect the artifact routing conflict and preserve the existing preview behavior unless the user approves a route change.
