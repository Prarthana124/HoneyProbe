# Module 3 architecture

## Boundary

Module 3 accepts locally supplied configuration and registered implementations,
runs self-tests, and optionally invokes approved hardening controls. Its output is
a `RunSummary`. Another team module may serialize, display, monitor, or report that
summary, but those responsibilities are deliberately absent here.

## Flow

1. `SelfTest.run(context)` returns a `TestResult`.
2. A passing result needs no action.
3. A failed result may name a recommended control.
4. The engine resolves that name from its control registry.
5. Policy checks require the control to be explicitly approved.
6. The control previews a change or applies it when `apply_changes` is enabled.
7. The affected self-test runs again after the control attempt.
8. The engine compares the original finding with the re-test result.
9. The engine returns immutable test, hardening, re-test, and comparison records in
   a `RunSummary`.

## Safety invariants

- Missing, unknown, or unapproved controls are never executed.
- `apply_changes` defaults to false.
- Built-in file controls resolve paths before checking allowed roots.
- Exceptions become explicit error records unless configured to stop the run.
- A run is healthy only when each test's latest result is `PASS`.
- Registration is explicit; importing this package causes no tests or changes.

## Extension points

Implement the protocols in `contracts.py`. A custom test should inspect only the
resource it owns and return a deterministic result. A control should make one
small, reversible change where possible and explain both previewed and applied
outcomes.

The built-in `ConfigurationFilePermissionTest` and
`RestrictConfigurationFilePermissions` pair uses the dedicated
`restrict-configuration-file-permissions` approval key while reusing the bounded
permission-bit behavior. Configuration targets are declared under
`configuration_file_targets`; they must still resolve inside `allowed_roots`.

Do not import another module's internal implementation. Integrate at the
`RunSummary`, `SelfTest`, `HardeningControl`, and `ExecutionContext` boundaries.
