"""Safe adapter to the Phase 2 normalization and detection rules."""

from __future__ import annotations

import sys
from functools import lru_cache
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType


@lru_cache(maxsize=1)
def _phase2_module() -> ModuleType:
    workspace_root = Path(__file__).resolve().parents[6]
    phase2_entry = workspace_root / "phases" / "phase2" / "app.py"
    if not phase2_entry.is_file():
        raise RuntimeError("Phase 2 source is missing; its detection adapter is unavailable.")

    spec = spec_from_file_location("honeyprobe_phase2_source", phase2_entry)
    if spec is None or spec.loader is None:
        raise RuntimeError("Phase 2 source could not be loaded.")
    module = module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def analyze_phase2_message(message: str, *, service: str = "SSH") -> list[dict[str, str]]:
    """Run the Phase 2 rules in memory; never persist the supplied message."""
    phase2 = _phase2_module()
    normalized = phase2.normalize_event(
        {
            "event_type": "observed_event",
            "service": service,
            "payload": message[:500],
        }
    )
    return phase2.detect_event(normalized)
