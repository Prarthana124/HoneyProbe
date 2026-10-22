"""Read-only adapter for the Phase 3 self-test and hardening engine."""

from __future__ import annotations

import sys
from dataclasses import replace
from functools import lru_cache
from importlib import import_module
from pathlib import Path
from types import ModuleType
from typing import Any


@lru_cache(maxsize=1)
def _phase3_modules() -> tuple[ModuleType, ModuleType, ModuleType]:
    workspace_root = Path(__file__).resolve().parents[6]
    source_root = workspace_root / "phases" / "phase3" / "src"
    if not (source_root / "honeyprobe_module3").is_dir():
        raise RuntimeError("Phase 3 source is missing; its self-test adapter is unavailable.")
    source_path = str(source_root)
    if source_path not in sys.path:
        sys.path.insert(0, source_path)

    return (
        import_module("honeyprobe_module3.config"),
        import_module("honeyprobe_module3.engine"),
        import_module("honeyprobe_module3.builtins"),
    )


def run_phase3_dry_run() -> dict[str, Any]:
    """Run configured Phase 3 checks while forcing all hardening to preview-only."""
    config_module, engine_module, builtins = _phase3_modules()
    workspace_root = Path(__file__).resolve().parents[6]
    config_path = workspace_root / "phases" / "phase3" / "config.example.toml"
    if not config_path.is_file():
        raise RuntimeError("The Phase 3 example policy is missing.")

    config = config_module.Module3Config.from_toml(config_path)
    config = replace(config, apply_changes=False, stop_on_error=False)
    tests = [
        builtins.FilePermissionTest(
            target.path,
            target.forbid_group_write,
            target.forbid_world_write,
        )
        for target in config.file_permission_targets
    ]
    tests.extend(
        builtins.ConfigurationFilePermissionTest(
            target.path,
            target.forbid_group_write,
            target.forbid_world_write,
        )
        for target in config.configuration_file_targets
    )
    summary = engine_module.HardeningEngine(
        config,
        tests,
        [
            builtins.RestrictFilePermissions(),
            builtins.RestrictConfigurationFilePermissions(),
        ],
    ).run()

    applied = any(
        item.status.value == "applied" or item.changed for item in summary.hardening
    )
    if applied:
        raise RuntimeError("Phase 3 reported an applied change during a dry run.")

    final_tests = summary.final_tests
    return {
        "total_tests": len(final_tests),
        "passed": sum(item.status.value == "pass" for item in final_tests),
        "failed": sum(item.status.value != "pass" for item in final_tests),
        "previewed_actions": sum(
            item.status.value == "previewed" for item in summary.hardening
        ),
        "blocked_actions": sum(
            item.status.value == "blocked" for item in summary.hardening
        ),
        "applied_actions": 0,
        "healthy": summary.healthy,
    }
