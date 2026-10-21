"""Small local CLI for Module 3."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Sequence

from .builtins import (
    ConfigurationFilePermissionTest,
    FilePermissionTest,
    RestrictConfigurationFilePermissions,
    RestrictFilePermissions,
)
from .config import Module3Config
from .engine import HardeningEngine


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="honeyprobe-module3",
        description="Run HoneyProbe Module 3 self-tests and policy-gated hardening.",
    )
    parser.add_argument("--config", type=Path, required=True, help="path to a TOML config")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config = Module3Config.from_toml(args.config)
    tests = [
        FilePermissionTest(
            target.path,
            target.forbid_group_write,
            target.forbid_world_write,
        )
        for target in config.file_permission_targets
    ]
    tests.extend(
        ConfigurationFilePermissionTest(
            target.path,
            target.forbid_group_write,
            target.forbid_world_write,
        )
        for target in config.configuration_file_targets
    )
    summary = HardeningEngine(
        config,
        tests,
        [RestrictFilePermissions(), RestrictConfigurationFilePermissions()],
    ).run()
    print(json.dumps(asdict(summary), indent=2, default=str))
    return 0 if summary.healthy else 1


if __name__ == "__main__":
    raise SystemExit(main())
