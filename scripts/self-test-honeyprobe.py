#!/usr/bin/env python3
"""Run HoneyProbe checks against isolated test data and report PASS/FAIL/BLOCKED."""

from __future__ import annotations

import json
import os
import re
import shlex
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "phases/phase1/artifacts/api-server"
PHASE2_DIR = ROOT / "phases/phase2"
PHASE3_DIR = ROOT / "phases/phase3"
CONSOLE_DIR = ROOT / "phases/phase4/artifacts/security-console"
TEST_ENV = os.environ.copy()
TEST_ENV.update(
    {
        "UV_PYTHON": "3.13",
        "PYTHONPATH": os.pathsep.join(
            [str(API_DIR / "python"), str(API_DIR / "tests")]
        ),
        "HONEYPROBE_ENV": "test",
        "HONEYPROBE_TRUSTED_PROXY_IPS": "",
    }
)
for _key in (
    "HONEYPROBE_DB_PATH",
    "HONEYPROBE_ALLOWED_EMAILS",
    "CLERK_SECRET_KEY",
    "CLERK_PUBLISHABLE_KEY",
    "VITE_CLERK_PUBLISHABLE_KEY",
    "VITE_CLERK_PROXY_URL",
):
    TEST_ENV.pop(_key, None)

RESULTS: list[dict[str, Any]] = []
SUMMARY_PATTERNS = (
    re.compile(r"^Ran \d+ tests? in [0-9.]+s$"),
    re.compile(r"^(OK(?: \(skipped=\d+\))?|FAILED \(.+\))$"),
    re.compile(r"^ℹ (tests|pass|fail|skipped|duration_ms) .+$"),
    re.compile(r"^# (tests|pass|fail|skipped|duration_ms) .+$"),
)
SKIPPED_PATTERNS = (
    re.compile(r"^OK \(skipped=(\d+)\)$"),
    re.compile(r"^ℹ skipped (\d+)$"),
    re.compile(r"^# skipped (\d+)$"),
    re.compile(r"\b(\d+) skipped\b"),
)
TEST_COUNT_PATTERNS = (
    re.compile(r"^Ran (\d+) tests? in [0-9.]+s$"),
    re.compile(r"^ℹ tests (\d+)$"),
    re.compile(r"^# tests (\d+)$"),
)
ANSI_ESCAPE = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")


def add_result(
    name: str,
    status: str,
    started: float,
    *,
    command: list[str] | None = None,
    reason: str | None = None,
    summary: list[str] | None = None,
) -> None:
    result: dict[str, Any] = {
        "name": name,
        "status": status,
        "duration_ms": round((time.perf_counter() - started) * 1000),
    }
    if command:
        result["command"] = shlex.join(command)
    if reason:
        result["reason"] = reason
    if summary:
        result["summary"] = summary
    RESULTS.append(result)


def classify_command_result(
    return_code: int,
    output: str,
    *,
    required: bool = True,
) -> tuple[str, str | None]:
    if return_code != 0:
        return "FAIL", f"Command exited with status {return_code}."

    output = ANSI_ESCAPE.sub("", output)
    skipped = sum(
        int(match.group(1))
        for line in output.splitlines()
        for pattern in SKIPPED_PATTERNS
        if (match := pattern.search(line.strip()))
    )
    if skipped:
        status = "BLOCKED" if required else "SKIPPED"
        reason = (
            "Required tests were skipped; the suite is not counted as passing."
            if required
            else "Optional tests were skipped."
        )
        return status, f"{skipped} {reason}"

    for line in output.splitlines():
        for pattern in TEST_COUNT_PATTERNS:
            match = pattern.match(line.strip())
            if match and int(match.group(1)) == 0:
                return "BLOCKED", "The test command executed zero tests."
    if "no tests found" in output.lower():
        return "BLOCKED", "The test command did not find any tests."
    return "PASS", None


def run_command(
    name: str,
    command: list[str],
    *,
    cwd: Path = ROOT,
    env: dict[str, str] | None = None,
    required: bool = True,
    timeout: int = 600,
) -> None:
    started = time.perf_counter()
    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            env=env or TEST_ENV,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as error:
        add_result(
            name,
            "BLOCKED",
            started,
            command=command,
            reason=f"Required executable is unavailable: {error.filename}.",
        )
        return
    except subprocess.TimeoutExpired:
        add_result(
            name,
            "FAIL",
            started,
            command=command,
            reason=f"Command exceeded the {timeout}-second test limit.",
        )
        return

    clean_output = ANSI_ESCAPE.sub("", completed.stdout)
    summaries = [
        line.strip()
        for line in clean_output.splitlines()
        if any(pattern.match(line.strip()) for pattern in SUMMARY_PATTERNS)
    ][-8:]
    status, reason = classify_command_result(
        completed.returncode,
        clean_output,
        required=required,
    )
    add_result(
        name,
        status,
        started,
        command=command,
        reason=reason,
        summary=summaries,
    )


def runtime_readiness() -> None:
    started = time.perf_counter()
    python_runtime: dict[str, str] | None = None
    commands = {
        "node": ["node", "--version"],
        "pnpm": ["pnpm", "--version"],
        "uv": ["uv", "--version"],
        "Phase 1 JavaScript dependencies": [
            "node",
            "--input-type=module",
            "-e",
            "await import('esbuild'); await import('express')",
        ],
        "Phase 4 JavaScript dependencies": [
            "pnpm",
            "--filter",
            "@workspace/security-console",
            "exec",
            "node",
            "--input-type=module",
            "-e",
            "await import('vite'); await import('react'); await import('@clerk/react')",
        ],
        "python": [
            "uv",
            "run",
            "--no-sync",
            "--locked",
            "--project",
            str(ROOT / "phases/phase1"),
            "python",
            "-c",
            "import json, sys, fastapi, httpx, uvicorn; "
            "assert sys.version_info[:2] == (3, 13); "
            "print(json.dumps({'executable': sys.executable, "
            "'version': sys.version.split()[0], 'fastapi': fastapi.__version__}))",
        ],
    }
    missing = [name for name, command in commands.items() if shutil.which(command[0]) is None]
    if missing:
        add_result(
            "Runtime and dependency readiness",
            "BLOCKED",
            started,
            reason=f"Missing required tools: {', '.join(missing)}.",
        )
        return

    failures: list[str] = []
    for name, command in commands.items():
        command_cwd = (
            API_DIR
            if name == "Phase 1 JavaScript dependencies"
            else ROOT / "phases/phase4"
            if name == "Phase 4 JavaScript dependencies"
            else ROOT
        )
        try:
            probe = subprocess.run(
                command,
                cwd=command_cwd,
                env=TEST_ENV,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=60,
                check=False,
            )
        except subprocess.TimeoutExpired:
            failures.append(name)
            continue
        if probe.returncode != 0:
            failures.append(name)
        elif name == "python":
            try:
                parsed_runtime = json.loads(probe.stdout)
                if isinstance(parsed_runtime, dict):
                    python_runtime = {
                        key: str(parsed_runtime[key])
                        for key in ("executable", "version", "fastapi")
                    }
            except (json.JSONDecodeError, KeyError, TypeError):
                failures.append("Python runtime identity")
    add_result(
        "Runtime and dependency readiness",
        "PASS" if not failures else "FAIL",
        started,
        reason=None if not failures else f"Failed readiness probes: {', '.join(failures)}.",
        summary=(
            None
            if failures
            else [
                "Node.js, pnpm, uv, backend and console JavaScript dependencies, "
                "and Python 3.13 dependencies are available.",
                f"Self-test and Phase 2/3 interpreter: {sys.executable} "
                f"(Python {sys.version.split()[0]}).",
                "Phase 1 API interpreter: "
                f"{python_runtime['executable']} "
                f"(Python {python_runtime['version']}, "
                f"FastAPI {python_runtime['fastapi']})."
                if python_runtime
                else "Phase 1 API interpreter identity could not be captured.",
            ]
        ),
    )


def request_status(url: str) -> tuple[int, dict[str, Any] | None]:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        response = urllib.request.urlopen(request, timeout=3)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read(64 * 1024).decode("utf-8", errors="replace")
        try:
            payload = json.loads(body) if body else None
        except json.JSONDecodeError:
            payload = None
        return response.status, payload if isinstance(payload, dict) else None


def self_test_exit_code(counts: dict[str, int]) -> int:
    """Required failures and blocked checks must never exit successfully."""
    if counts.get("FAIL", 0):
        return 1
    if counts.get("BLOCKED", 0):
        return 2
    return 0


def gateway_health_and_auth() -> None:
    started = time.perf_counter()
    port = os.environ.get("HONEYPROBE_GATEWAY_PORT", "8080")
    try:
        health_status, health = request_status(
            f"http://127.0.0.1:{port}/api/healthz"
        )
        protected_status, protected = request_status(
            f"http://127.0.0.1:{port}/api/findings"
        )
        protected_routes = [
            ("/api/evidence", "GET", None),
            ("/api/evidence/by-id/evidence_self_test_missing", "GET", None),
            ("/api/adaptive-actions/audit", "GET", None),
            (
                "/api/adaptive-actions/dry-run",
                "POST",
                {
                    "action": "restrict_file_permissions",
                    "finding_id": "self_test_missing",
                    "reason": "Unauthenticated route protection check.",
                },
            ),
        ]
        route_results = []
        for path, method, payload in protected_routes:
            body = json.dumps(payload).encode("utf-8") if payload is not None else None
            request = urllib.request.Request(
                f"http://127.0.0.1:{port}{path}",
                data=body,
                method=method,
                headers={"Accept": "application/json", **(
                    {"Content-Type": "application/json"} if body is not None else {}
                )},
            )
            try:
                response = urllib.request.urlopen(request, timeout=3)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                body_text = response.read(64 * 1024).decode("utf-8", errors="replace")
                try:
                    payload_result = json.loads(body_text) if body_text else None
                except json.JSONDecodeError:
                    payload_result = None
                route_results.append(
                    (
                        path,
                        method,
                        response.status,
                        payload_result if isinstance(payload_result, dict) else None,
                    )
                )
    except (OSError, ValueError, TimeoutError) as error:
        add_result(
            "Running API health and unauthenticated access enforcement",
            "BLOCKED",
            started,
            reason=f"Could not contact the local API gateway: {type(error).__name__}.",
        )
        return

    failures = []
    if health_status != 200 or not health or health.get("status") != "healthy":
        failures.append(f"health endpoint returned HTTP {health_status}")
    if protected_status not in {401, 403, 503}:
        failures.append(f"protected endpoint returned unexpected HTTP {protected_status}")
    if protected_status == 503 and protected and protected.get("error") not in {
        "authentication_unavailable",
        "access_policy_unavailable",
        "access_check_unavailable",
    }:
        failures.append("protected endpoint returned an unexpected 503 response")
    for path, _method, status, payload in route_results:
        if status not in {401, 403, 503}:
            failures.append(f"protected route {path} returned unexpected HTTP {status}")
        if status == 503 and payload and payload.get("error") not in {
            "authentication_unavailable",
            "access_policy_unavailable",
            "access_check_unavailable",
        }:
            failures.append(f"protected route {path} returned an unexpected 503 response")
    add_result(
        "Running API health and unauthenticated findings/evidence/audit enforcement",
        "PASS" if not failures else "FAIL",
        started,
        reason="; ".join(failures) if failures else None,
        summary=(
            None
            if failures
            else [
                f"Health HTTP {health_status}; findings HTTP {protected_status}; "
                f"{len(route_results)} evidence/audit/preview routes rejected unauthenticated requests."
            ]
        ),
    )


def docker_runtime_test() -> None:
    started = time.perf_counter()
    if shutil.which("docker") is None:
        add_result(
            "Disposable Docker Compose build, health, and volume-restart test",
            "BLOCKED",
            started,
            reason="Docker CLI is unavailable.",
        )
        return
    daemon = subprocess.run(
        ["docker", "info"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=20,
        check=False,
    )
    if daemon.returncode != 0:
        add_result(
            "Disposable Docker Compose build, health, and volume-restart test",
            "BLOCKED",
            started,
            command=["docker", "info"],
            reason="Docker CLI is installed, but no Docker daemon is reachable.",
        )
        return

    try:
        compose_config = subprocess.run(
            ["docker", "compose", "config", "--quiet"],
            cwd=ROOT,
            env=TEST_ENV,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=60,
            check=False,
        )
    except subprocess.TimeoutExpired:
        add_result(
            "Disposable Docker Compose build, health, and volume-restart test",
            "FAIL",
            started,
            reason="Compose configuration validation timed out.",
        )
        return
    if compose_config.returncode != 0:
        add_result(
            "Disposable Docker Compose build, health, and volume-restart test",
            "FAIL",
            started,
            command=["docker", "compose", "config", "--quiet"],
            reason=f"Compose configuration validation exited with status {compose_config.returncode}.",
        )
        return

    project = f"honeyprobe-selftest-{uuid.uuid4().hex[:10]}"
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        web_port = listener.getsockname()[1]
    docker_env = TEST_ENV.copy()
    docker_env.update(
        {
            "HONEYPROBE_WEB_PORT": f"127.0.0.1:{web_port}",
            "HONEYPROBE_ENV": "test",
            "HONEYPROBE_CORS_ORIGINS": "",
            "HONEYPROBE_TRUSTED_PROXY_IPS": "",
            "HONEYPROBE_ALLOWED_EMAILS": "",
            "CLERK_SECRET_KEY": "",
            "CLERK_PUBLISHABLE_KEY": "",
            "VITE_CLERK_PUBLISHABLE_KEY": "",
            "VITE_CLERK_PROXY_URL": "",
        }
    )
    compose = ["docker", "compose", "--project-name", project]
    failure: str | None = None
    try:
        started_stack = subprocess.run(
            [*compose, "up", "--build", "--detach"],
            cwd=ROOT,
            env=docker_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=1200,
            check=False,
        )
        if started_stack.returncode != 0:
            lowered = started_stack.stdout.lower()
            status = (
                "BLOCKED"
                if any(
                    marker in lowered
                    for marker in (
                        "network is unreachable",
                        "temporary failure in name resolution",
                        "cannot connect to the docker daemon",
                        "permission denied while trying to connect",
                        "no space left on device",
                    )
                )
                else "FAIL"
            )
            failure = (
                f"Compose build/start exited with status {started_stack.returncode}; "
                f"classified as {status.lower()}."
            )
        else:
            health_url = f"http://127.0.0.1:{web_port}/api/healthz"
            health_ok = False
            deadline = time.monotonic() + 120
            while time.monotonic() < deadline:
                try:
                    code, payload = request_status(health_url)
                    if code == 200 and payload and payload.get("status") == "healthy":
                        health_ok = True
                        break
                except (OSError, ValueError, TimeoutError):
                    pass
                time.sleep(2)
            if not health_ok:
                failure = "The disposable Compose stack did not become healthy in 120 seconds."
            else:
                marker = f"evt_selftest_{uuid.uuid4().hex}"
                python_source = (
                    "from honeyprobe.models import EventInput; "
                    "from honeyprobe.ingestion import record_operator_event; "
                    f"event=record_operator_event(EventInput(source_type='web', "
                    f"event_type='compose_persistence_check', severity='info', "
                    f"target='/self-test/compose', summary='Disposable Compose "
                    f"persistence check', metadata={{'test': True}}, "
                    f"environment='test', ingestion_source='self_test')); "
                    "print(event.id)"
                )
                command = (
                    "cd /app/phases/phase1/artifacts/api-server && "
                    "PYTHONPATH=python uv run --no-sync --locked "
                    "--project ../.. python -c "
                    + shlex.quote(python_source)
                )
                seeded = subprocess.run(
                    [*compose, "exec", "--no-TTY", "honeyprobe", "bash", "-lc", command],
                    cwd=ROOT,
                    env=docker_env,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    timeout=60,
                    check=False,
                )
                if seeded.returncode != 0:
                    failure = "The isolated Compose API could not create a test-only persistence marker."
                else:
                    marker = seeded.stdout.strip().splitlines()[-1]
                    restarted = subprocess.run(
                        [*compose, "restart", "--timeout", "10", "honeyprobe"],
                        cwd=ROOT,
                        env=docker_env,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        timeout=90,
                        check=False,
                    )
                    if restarted.returncode != 0:
                        failure = "The isolated Compose service could not be restarted."
                    else:
                        deadline = time.monotonic() + 120
                        healthy_after_restart = False
                        while time.monotonic() < deadline:
                            try:
                                code, payload = request_status(health_url)
                                if code == 200 and payload and payload.get("status") == "healthy":
                                    healthy_after_restart = True
                                    break
                            except (OSError, ValueError, TimeoutError):
                                pass
                            time.sleep(2)
                        if not healthy_after_restart:
                            failure = "The Compose stack did not become healthy after restart."
                        else:
                            verify_source = (
                                "from honeyprobe.storage import get_event; "
                                f"event=get_event({marker!r}); "
                                "raise SystemExit(0 if event is not None else 1)"
                            )
                            verify_command = (
                                "cd /app/phases/phase1/artifacts/api-server && "
                                "PYTHONPATH=python uv run --no-sync --locked "
                                "--project ../.. python -c "
                                + shlex.quote(verify_source)
                            )
                            verified = subprocess.run(
                                [
                                    *compose,
                                    "exec",
                                    "--no-TTY",
                                    "honeyprobe",
                                    "bash",
                                    "-lc",
                                    verify_command,
                                ],
                                cwd=ROOT,
                                env=docker_env,
                                stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT,
                                text=True,
                                timeout=60,
                                check=False,
                            )
                            if verified.returncode != 0:
                                failure = "The isolated Compose volume did not preserve the test event across restart."
    except subprocess.TimeoutExpired:
        failure = "A Docker Compose build or runtime command exceeded its time limit."
    finally:
        try:
            subprocess.run(
                [*compose, "down", "--volumes", "--remove-orphans"],
                cwd=ROOT,
                env=docker_env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=120,
                check=False,
            )
        except subprocess.TimeoutExpired:
            if failure is None:
                failure = "Cleanup of the isolated Compose project timed out."

    add_result(
        "Disposable Docker Compose build, health, and volume-restart test",
        "PASS" if failure is None else "FAIL",
        started,
        reason=failure,
        summary=(
            None
            if failure
            else ["Health passed; a test-only event survived container restart; isolated test volume removed."]
        ),
    )


def main() -> int:
    runtime_readiness()
    gateway_health_and_auth()

    python_command = [
        "uv",
        "run",
        "--no-sync",
        "--locked",
        "--project",
        "../..",
        "python",
        "-m",
        "unittest",
    ]
    run_command(
        "Complete Phase 1 backend, SQLite persistence, decoy/evidence, and process-restart suite",
        [
            *python_command,
            "discover",
            "-s",
            "tests",
            "-v",
        ],
        cwd=API_DIR,
        timeout=600,
    )
    run_command(
        "Trusted proxy IP/CIDR allowlist and header validation",
        ["node", "--test", "tests/trusted_proxy.test.mjs"],
        cwd=API_DIR,
    )
    run_command(
        "Phase 2 standalone test suite",
        [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"],
        cwd=PHASE2_DIR,
    )
    phase3_env = TEST_ENV.copy()
    phase3_env["PYTHONPATH"] = str(PHASE3_DIR / "src")
    run_command(
        "Phase 3 standalone test suite",
        [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"],
        cwd=PHASE3_DIR,
        env=phase3_env,
    )
    run_command(
        "Phase 4 API client test suite",
        ["pnpm", "--filter", "@workspace/security-console", "run", "test"],
        cwd=ROOT / "phases/phase4",
    )
    run_command(
        "Phase 1 configured workspace library and backend TypeScript typecheck",
        ["pnpm", "run", "typecheck"],
        cwd=ROOT / "phases/phase1",
    )
    run_command(
        "Phase 1 workspace production build",
        [
            "env",
            "PORT=5000",
            "BASE_PATH=/",
            "HONEYPROBE_GATEWAY_PORT=8080",
            "pnpm",
            "run",
            "build",
        ],
        cwd=ROOT / "phases/phase1",
        timeout=900,
    )
    run_command(
        "Phase 4 console TypeScript typecheck",
        ["pnpm", "--filter", "@workspace/security-console", "run", "typecheck"],
        cwd=ROOT / "phases/phase4",
    )
    run_command(
        "Phase 4 console lint",
        ["pnpm", "--filter", "@workspace/security-console", "run", "lint"],
        cwd=ROOT / "phases/phase4",
    )
    run_command(
        "Phase 4 workspace production build",
        [
            "env",
            "PORT=5000",
            "BASE_PATH=/",
            "HONEYPROBE_GATEWAY_PORT=8080",
            "NODE_ENV=production",
            "pnpm",
            "run",
            "build",
        ],
        cwd=ROOT / "phases/phase4",
        timeout=900,
    )
    run_command(
        "Self-test runner PASS/FAIL/BLOCKED exit contract",
        [sys.executable, "scripts/test_self_test_runner.py"],
        cwd=ROOT,
    )
    run_command(
        "Docker Compose configuration validation",
        ["docker", "compose", "config", "--quiet"],
        cwd=ROOT,
    )
    docker_runtime_test()
    add_result(
        "Clerk-authenticated Live dashboard session",
        "BLOCKED",
        time.perf_counter(),
        reason=(
            "This headless runner cannot create a verified operator session. "
            "Configure matching Clerk keys and the verified-email allowlist, then verify the signed-in browser flow."
        ),
    )

    counts = {
        status: sum(result["status"] == status for result in RESULTS)
        for status in ("PASS", "FAIL", "BLOCKED", "SKIPPED")
    }
    overall = "FAIL" if counts["FAIL"] else "INCOMPLETE" if counts["BLOCKED"] else "PASS"
    print(json.dumps({"overall": overall, "counts": counts, "checks": RESULTS}, indent=2))
    return self_test_exit_code(counts)


if __name__ == "__main__":
    raise SystemExit(main())
