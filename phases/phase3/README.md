# HoneyProbe-Module3

An isolated implementation of **Module 3: Self-Testing & Adaptive Hardening** for
the HoneyProbe final-year project.

## Scope

This project owns only:

- running registered self-tests;
- converting failed tests into structured findings;
- carrying severity and confidence through every finding and action;
- selecting explicitly mapped hardening controls;
- previewing or applying bounded, auditable changes;
- re-running affected self-tests and recording before/after verification;
- exposing narrow Python interfaces for other HoneyProbe modules.

It does **not** implement detection, monitoring, data collection, dashboards,
reporting, alerting, or orchestration owned by other modules. External systems may
consume the structured run result returned by this package.

## Safety model

- Hardening is dry-run by default.
- A control must be both mapped to a failed test and explicitly approved.
- File changes must remain below configured allowed roots.
- Controls return structured outcomes rather than hiding failures.
- The engine has no network, monitoring, or data-collection behavior.

## Layout

```text
src/honeyprobe_module3/
  contracts.py       Narrow extension interfaces
  models.py          Immutable domain records
  config.py          TOML configuration loading
  engine.py          Self-test and hardening coordinator
  builtins.py        Minimal file-permission test and control
  cli.py             Local command-line entry point
tests/               Unit tests for boundaries and behavior
docs/architecture.md Module boundaries and extension guidance
```

## Quick start

No runtime dependencies are required.

```bash
python3 -m unittest discover -s tests -v
PYTHONPATH=src python3 -m honeyprobe_module3.cli --config config.example.toml
```

For local development, install the project and optional tools using your preferred
Python environment:

```bash
python3 -m pip install -e .
honeyprobe-module3 --config config.example.toml
```

The example configuration runs against `sample-target/` and only previews changes.
Set `apply_changes = true` only after reviewing the approved controls and allowed
roots.

Each run returns a `RunSummary`. A failed test produces a `HardeningResult` when it
has a recommended control. That record includes the selected control outcome and a
`TestComparison` with the original finding, the post-action result, and a
`resolved` property. Previewed, blocked, and failed actions are re-tested as well;
they remain unresolved unless the target actually satisfies the self-test.

Configuration files can be registered separately from other file targets:

```toml
[[configuration_file_targets]]
path = "sample-target/honeyprobe.toml"
forbid_group_write = true
forbid_world_write = true
```

They use the `restrict-configuration-file-permissions` approval key and share the
same allowed-root and dry-run protections as the original file-permission control.

## Extension rule

Add a self-test by implementing `SelfTest`; add a hardening action by implementing
`HardeningControl`. Keep integrations outside this package and pass only the
minimum required context through `ExecutionContext`.
