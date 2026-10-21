"""Configuration parsing for Module 3."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping


@dataclass(frozen=True, slots=True)
class FilePermissionTarget:
    path: Path
    forbid_group_write: bool = True
    forbid_world_write: bool = True


@dataclass(frozen=True, slots=True)
class Module3Config:
    apply_changes: bool = False
    stop_on_error: bool = False
    approved_controls: frozenset[str] = frozenset()
    allowed_roots: tuple[Path, ...] = ()
    file_permission_targets: tuple[FilePermissionTarget, ...] = ()
    configuration_file_targets: tuple[FilePermissionTarget, ...] = ()

    @classmethod
    def from_toml(cls, path: Path) -> Module3Config:
        config_path = path.expanduser().resolve()
        with config_path.open("rb") as handle:
            raw = tomllib.load(handle)
        return cls.from_mapping(raw, base_dir=config_path.parent)

    @classmethod
    def from_mapping(
        cls, raw: Mapping[str, Any], *, base_dir: Path | None = None
    ) -> Module3Config:
        base = (base_dir or Path.cwd()).resolve()
        engine = raw.get("engine", {})
        if not isinstance(engine, Mapping):
            raise ValueError("[engine] must be a TOML table")

        def resolve(value: object) -> Path:
            if not isinstance(value, str) or not value.strip():
                raise ValueError("configured paths must be non-empty strings")
            candidate = Path(value).expanduser()
            return (base / candidate).resolve() if not candidate.is_absolute() else candidate.resolve()

        approved = engine.get("approved_controls", [])
        roots = engine.get("allowed_roots", [])
        targets_raw = raw.get("file_permission_targets", [])
        configuration_targets_raw = raw.get("configuration_file_targets", [])
        if not isinstance(approved, list) or not all(isinstance(item, str) for item in approved):
            raise ValueError("approved_controls must be a list of strings")
        if not isinstance(roots, list):
            raise ValueError("allowed_roots must be a list")
        if not isinstance(targets_raw, list):
            raise ValueError("file_permission_targets must be an array of tables")
        if not isinstance(configuration_targets_raw, list):
            raise ValueError("configuration_file_targets must be an array of tables")

        def parse_targets(
            raw_targets: list[object], description: str
        ) -> tuple[FilePermissionTarget, ...]:
            targets: list[FilePermissionTarget] = []
            for item in raw_targets:
                if not isinstance(item, Mapping):
                    raise ValueError(f"each {description} target must be a table")
                targets.append(
                    FilePermissionTarget(
                        path=resolve(item.get("path")),
                        forbid_group_write=bool(item.get("forbid_group_write", True)),
                        forbid_world_write=bool(item.get("forbid_world_write", True)),
                    )
                )
            return tuple(targets)

        return cls(
            apply_changes=bool(engine.get("apply_changes", False)),
            stop_on_error=bool(engine.get("stop_on_error", False)),
            approved_controls=frozenset(approved),
            allowed_roots=tuple(resolve(item) for item in roots),
            file_permission_targets=parse_targets(targets_raw, "file permission"),
            configuration_file_targets=parse_targets(
                configuration_targets_raw, "configuration file"
            ),
        )
