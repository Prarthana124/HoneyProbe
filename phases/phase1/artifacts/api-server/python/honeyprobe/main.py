from __future__ import annotations

import os
import hashlib
import ipaddress
import json
import re
import sqlite3
import threading
import time
import uuid
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.cors import CORSMiddleware

from honeyprobe.analytics import (
    filter_sessions,
    make_analytics,
    make_overview,
    make_report,
    make_source_profiles,
)
from honeyprobe.decoys import decoy_catalog
from honeyprobe.ingestion import (
    generate_demo_events,
    import_cowrie_events,
    record_database_interaction,
    record_operator_event,
    record_web_interaction,
)
from honeyprobe.models import (
    Analytics,
    AdaptiveActionAudit,
    AdaptiveActionInput,
    CowrieImportInput,
    DetectionFinding,
    DatabaseInteractionInput,
    Decoy,
    DemoGenerationInput,
    DemoGenerationResult,
    DemoResetResult,
    Event,
    EventInput,
    EventPage,
    EvidenceRecord,
    ImportResult,
    Overview,
    ReportSummary,
    ReportDocument,
    ReportVerification,
    SelfTestResult,
    SelfTestRun,
    Session,
    SessionDetail,
    SessionPage,
    SessionStatusInput,
    SystemHealth,
    SourceProfile,
    WebInteractionInput,
)
from honeyprobe.reports import events_to_csv, report_to_html
from honeyprobe.self_tests import previous_self_tests, run_self_tests
from honeyprobe.storage import (
    all_events,
    create_adaptive_action_audit,
    database_health,
    get_generated_report,
    get_detection_finding,
    get_event,
    initialize_database,
    query_evidence,
    query_events,
    query_findings,
    read_adaptive_action_audit,
    remove_test_events,
    save_generated_report,
    set_investigation_status,
    utc_now,
    verify_generated_report,
)
from honeyprobe.web_decoy import PAGES as WEB_DECOY_PAGES


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(
    title="HoneyProbe API",
    version="1.0.0",
    description=(
        "Controlled-lab cyber-deception telemetry API. The operator UI is intended "
        "for local or isolated demonstrations and is not production-secured."
    ),
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

_LOCAL_DECOY_WINDOW_SECONDS = 60.0
_LOCAL_DECOY_MAX_REQUESTS = 60
_LOCAL_DECOY_REQUESTS: deque[float] = deque()
_LOCAL_DECOY_REQUESTS_LOCK = threading.Lock()
_SENSITIVE_USER_AGENT_VALUE = re.compile(
    r"(?i)\b(password|passwd|token|secret|credential|api[_-]?key)\b"
    r"(\s*[:=]\s*)([^\s,;]+)"
)
_AUTHORIZATION_USER_AGENT_VALUE = re.compile(
    r"(?i)\bauthorization\s*[:=]\s*(?:bearer\s+)?[^\s,;]+"
)


def _safe_user_agent(value: str | None) -> str | None:
    if not value:
        return None
    safe = "".join(character for character in value if character >= " " and character != "\x7f")
    safe = _AUTHORIZATION_USER_AGENT_VALUE.sub("authorization=[redacted]", safe)
    safe = _SENSITIVE_USER_AGENT_VALUE.sub(r"\1\2[redacted]", safe)
    return safe[:256] or None


def _local_request_network_metadata(
    request: Request,
    safe_path: str,
) -> tuple[str | None, dict[str, object]]:
    client = request.client
    source_address: str | None = None
    source_port: int | None = None
    if client is not None:
        try:
            source_ip = ipaddress.ip_address(client.host)
            if source_ip.is_loopback:
                source_address = str(source_ip)
        except ValueError:
            # Test clients and non-IP ASGI peers do not supply a source IP.
            pass
        if isinstance(client.port, int) and 0 < client.port <= 65535:
            source_port = client.port

    server = request.scope.get("server")
    destination_port = (
        server[1]
        if isinstance(server, tuple)
        and len(server) > 1
        and isinstance(server[1], int)
        and 0 < server[1] <= 65535
        else None
    )
    scheme = request.scope.get("scheme")
    protocol = scheme if scheme in {"http", "https"} else None
    return source_address, {
        "protocol": protocol,
        "source_port": source_port,
        "destination_port": destination_port,
        "method": request.method.upper()[:10],
        "path": safe_path[:200],
        "user_agent": _safe_user_agent(request.headers.get("user-agent")),
    }


def _check_local_decoy_rate_limit() -> None:
    now = time.monotonic()
    with _LOCAL_DECOY_REQUESTS_LOCK:
        while (
            _LOCAL_DECOY_REQUESTS
            and now - _LOCAL_DECOY_REQUESTS[0] >= _LOCAL_DECOY_WINDOW_SECONDS
        ):
            _LOCAL_DECOY_REQUESTS.popleft()
        if len(_LOCAL_DECOY_REQUESTS) >= _LOCAL_DECOY_MAX_REQUESTS:
            raise HTTPException(
                status_code=429,
                detail="The local web decoy rate limit was reached.",
            )
        _LOCAL_DECOY_REQUESTS.append(now)


def _local_decoy_response(
    request: Request,
    route: str,
    *,
    enforce_rate_limit: bool = True,
) -> HTMLResponse:
    client_host = request.client.host if request.client else ""
    if client_host not in {"127.0.0.1", "::1", "testclient"}:
        raise HTTPException(status_code=403, detail="The web decoy is loopback-only.")
    if enforce_rate_limit:
        _check_local_decoy_rate_limit()
    if len(route) > 200:
        raise HTTPException(status_code=414, detail="Decoy route is too long.")

    normalized_route = f"/{route.strip('/')}" if route.strip("/") else "/"
    if request.method == "POST" and normalized_route == "/login":
        interaction = "login_attempt"
    elif normalized_route == "/admin":
        interaction = "protected_route_attempt"
    else:
        interaction = "route_visit"
    known_route = normalized_route in WEB_DECOY_PAGES
    safe_route = normalized_route if known_route else "/unmatched"
    source_address, network_metadata = _local_request_network_metadata(
        request,
        safe_route,
    )
    event = record_web_interaction(
        WebInteractionInput(
            route=normalized_route,
            interaction=interaction,
            method=request.method,
        ),
        simulated=False,
        detection_input=normalized_route,
        source_address=source_address,
        network_metadata=network_metadata,
    )
    content = (
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\">"
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        "<title>Northstar Cloud</title>"
        '<body style="font:16px system-ui;max-width:48rem;margin:4rem auto;padding:0 1rem">'
        f"{WEB_DECOY_PAGES.get(normalized_route, '<h1>Page not found</h1>')}"
        "</body></html>"
    )
    return HTMLResponse(
        content=content,
        status_code=200 if known_route else 404,
        headers={"X-HoneyProbe-Event-ID": event.id},
    )


@app.get("/decoy", response_class=HTMLResponse, include_in_schema=False)
def local_web_decoy_home(request: Request) -> HTMLResponse:
    return _local_decoy_response(request, "")


@app.get("/decoy/{route:path}", response_class=HTMLResponse, include_in_schema=False)
def local_web_decoy_route(route: str, request: Request) -> HTMLResponse:
    return _local_decoy_response(request, route)


@app.post("/decoy/login", response_class=HTMLResponse, include_in_schema=False)
async def local_web_decoy_login(request: Request) -> HTMLResponse:
    client_host = request.client.host if request.client else ""
    if client_host not in {"127.0.0.1", "::1", "testclient"}:
        raise HTTPException(status_code=403, detail="The web decoy is loopback-only.")
    _check_local_decoy_rate_limit()
    if await request.body():
        raise HTTPException(
            status_code=400,
            detail="The local decoy does not accept login fields or credentials.",
        )
    return _local_decoy_response(request, "login", enforce_rate_limit=False)

cors_origins = [
    origin.strip()
    for origin in os.getenv("HONEYPROBE_CORS_ORIGINS", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)


class RequestBodyLimitMiddleware:
    def __init__(self, app, max_body_bytes: int = 256 * 1024) -> None:
        self.application = app
        self.max_body_bytes = max_body_bytes

    async def _reject(self, send, *, status: int, error: str, detail: str) -> None:
        body = json.dumps({"error": error, "detail": detail}).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.application(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        content_length = headers.get(b"content-length")
        if content_length is not None:
            try:
                declared_length = int(content_length)
            except ValueError:
                await self._reject(
                    send,
                    status=400,
                    error="invalid_content_length",
                    detail="Invalid Content-Length header.",
                )
                return
            if declared_length < 0:
                await self._reject(
                    send,
                    status=400,
                    error="invalid_content_length",
                    detail="Invalid Content-Length header.",
                )
                return
            if declared_length > self.max_body_bytes:
                await self._reject(
                    send,
                    status=413,
                    error="request_too_large",
                    detail="Request body exceeds 256 KB.",
                )
                return

        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            if message["type"] != "http.request":
                continue
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > self.max_body_bytes:
                await self._reject(
                    send,
                    status=413,
                    error="request_too_large",
                    detail="Request body exceeds 256 KB.",
                )
                return
            body.extend(chunk)
            if not message.get("more_body", False):
                break

        replayed = False

        async def replay_body():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {
                    "type": "http.request",
                    "body": bytes(body),
                    "more_body": False,
                }
            return await receive()

        await self.application(scope, replay_body, send)


app.add_middleware(RequestBodyLimitMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, __: RequestValidationError):
    # Do not echo request bodies: login attempts and malformed payloads may contain credentials.
    return JSONResponse(
        status_code=422,
        content={"error": "invalid_input", "detail": "Request payload failed validation."},
    )


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_: Request, error: StarletteHTTPException):
    message = error.detail if isinstance(error.detail, str) else "Request could not be completed."
    labels = {
        403: "forbidden",
        404: "not_found",
        413: "request_too_large",
        422: "invalid_input",
    }
    return JSONResponse(
        status_code=error.status_code,
        headers=error.headers,
        content={"error": labels.get(error.status_code, "request_error"), "detail": message},
    )


api = APIRouter(prefix="/api")


def _event_dict(event: Event) -> dict:
    return event.model_dump(mode="json")


def _report_events(
    *,
    since: datetime | None,
    until: datetime | None,
    source_type: str | None,
    severity: str | None,
    include_demo: bool = True,
) -> list[Event]:
    return all_events(
        since=since,
        until=until,
        source_type=source_type,
        severity=severity,
        include_demo=include_demo,
    )


def _session_rows(
    *,
    q: str | None,
    severity: str | None,
    source_type: str | None,
    since: datetime | None,
    until: datetime | None,
    limit: int,
    offset: int,
    include_demo: bool = True,
) -> tuple[list[Session], int]:
    events = all_events(
        since=since,
        until=until,
        source_type=source_type,
        severity=severity,
        include_demo=include_demo,
    )
    return filter_sessions(
        events,
        query=q,
        severity=severity,
        source_type=source_type,
        limit=limit,
        offset=offset,
    )


@api.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@api.get("/health", response_model=SystemHealth)
def system_health() -> SystemHealth:
    healthy, label = database_health()
    environment = os.getenv("HONEYPROBE_ENV", "development").lower()
    return SystemHealth(
        status="healthy" if healthy else "degraded",
        environment=environment,
        database={
            "status": "healthy" if healthy else "unavailable",
            "engine": "SQLite",
            "path_label": label,
        },
        checked_at=utc_now(),
    )


@api.get("/overview", response_model=Overview)
def overview(
    since: datetime | None = None,
    until: datetime | None = None,
    include_demo: bool = True,
) -> Overview:
    end = until or utc_now()
    start = since or (end - timedelta(hours=24))
    events = all_events(since=start, until=end, include_demo=include_demo)
    return make_overview(events, since=start, until=end)


@api.get("/events", response_model=EventPage)
def list_events(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=200),
    severity: Literal["info", "low", "medium", "high", "critical"] | None = None,
    source_type: Literal["web", "ssh", "database", "mobile"] | None = None,
    event_type: str | None = Query(default=None, max_length=100),
    since: datetime | None = None,
    until: datetime | None = None,
    include_demo: bool = True,
    sort_by: Literal["timestamp", "severity", "event_type"] = "timestamp",
    sort_direction: Literal["asc", "desc"] = "desc",
) -> EventPage:
    if since and until and since > until:
        raise HTTPException(status_code=422, detail="since must be earlier than or equal to until.")
    events, total = query_events(
        limit=limit,
        offset=offset,
        query=q,
        severity=severity,
        source_type=source_type,
        event_type=event_type,
        since=since,
        until=until,
        include_demo=include_demo,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return EventPage(items=events, total=total, limit=limit, offset=offset)


@api.get("/events/export")
def export_filtered_events(
    q: str | None = Query(default=None, max_length=200),
    severity: Literal["info", "low", "medium", "high", "critical"] | None = None,
    source_type: Literal["web", "ssh", "database", "mobile"] | None = None,
    event_type: str | None = Query(default=None, max_length=100),
    since: datetime | None = None,
    until: datetime | None = None,
    include_demo: bool = True,
    sort_by: Literal["timestamp", "severity", "event_type"] = "timestamp",
    sort_direction: Literal["asc", "desc"] = "desc",
) -> Response:
    if since and until and since > until:
        raise HTTPException(status_code=422, detail="since must be earlier than or equal to until.")
    events, _ = query_events(
        limit=10000,
        query=q,
        severity=severity,
        source_type=source_type,
        event_type=event_type,
        since=since,
        until=until,
        include_demo=include_demo,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return Response(
        content=events_to_csv(events),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="honeyprobe-filtered-events.csv"'},
    )


@api.post("/events", response_model=Event, status_code=201)
def ingest_event(payload: EventInput) -> Event:
    return record_operator_event(payload)


@api.get("/events/{event_id}", response_model=Event)
def event_detail(event_id: str) -> Event:
    event = get_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found.")
    return event


@api.get("/sessions", response_model=SessionPage)
def list_sessions(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=200),
    severity: Literal["info", "low", "medium", "high", "critical"] | None = None,
    source_type: Literal["web", "ssh", "database", "mobile"] | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    include_demo: bool = True,
) -> SessionPage:
    sessions, total = _session_rows(
        q=q,
        severity=severity,
        source_type=source_type,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
        include_demo=include_demo,
    )
    return SessionPage(items=sessions, total=total, limit=limit, offset=offset)


@api.get("/sessions/{session_id}", response_model=SessionDetail)
def session_detail(session_id: str) -> SessionDetail:
    events, _ = query_events(limit=10000, query=session_id, sort_direction="asc")
    events = [event for event in events if event.session_id == session_id]
    if not events:
        raise HTTPException(status_code=404, detail="Session not found.")
    from honeyprobe.analytics import make_sessions

    session = make_sessions(events)[0]
    return SessionDetail(session=session, events=events)


@api.patch("/sessions/{session_id}", response_model=Session)
def update_session(session_id: str, payload: SessionStatusInput) -> Session:
    events, _ = query_events(limit=10000, query=session_id)
    events = [event for event in events if event.session_id == session_id]
    if not events:
        raise HTTPException(status_code=404, detail="Session not found.")
    set_investigation_status(session_id, payload.investigation_status)
    from honeyprobe.analytics import make_sessions

    return make_sessions(events)[0]


@api.get("/decoys", response_model=list[Decoy])
def get_decoys() -> list[Decoy]:
    return decoy_catalog(all_events())


@api.post("/decoys/web/interaction", response_model=Event, status_code=201)
def web_decoy_interaction(payload: WebInteractionInput) -> Event:
    return record_web_interaction(payload)


@api.post("/decoys/database/interaction", response_model=Event, status_code=201)
def database_decoy_interaction(payload: DatabaseInteractionInput) -> Event:
    return record_database_interaction(payload)


@api.post("/imports/cowrie", response_model=ImportResult, status_code=201)
def cowrie_import(payload: CowrieImportInput) -> ImportResult:
    events = import_cowrie_events(payload)
    return ImportResult(imported=len(events), events=events)


@api.get("/analytics", response_model=Analytics)
def analytics(
    since: datetime | None = None,
    until: datetime | None = None,
    source_type: Literal["web", "ssh", "database", "mobile"] | None = None,
    severity: Literal["info", "low", "medium", "high", "critical"] | None = None,
    include_demo: bool = True,
) -> Analytics:
    if since and until and since > until:
        raise HTTPException(status_code=422, detail="since must be earlier than or equal to until.")
    events = all_events(
        since=since,
        until=until,
        source_type=source_type,
        severity=severity,
        include_demo=include_demo,
    )
    return make_analytics(events, since=since, until=until)


@api.get("/sources/profiles", response_model=list[SourceProfile])
def source_profiles(
    include_demo: bool = False,
    limit: int = Query(default=100, ge=1, le=500),
) -> list[SourceProfile]:
    events = all_events(limit=10000, include_demo=include_demo)
    return make_source_profiles(events, limit=limit)


@api.get("/evidence", response_model=list[EvidenceRecord])
def list_evidence(
    event_id: str | None = Query(default=None, max_length=128),
    include_demo: bool = False,
    limit: int = Query(default=100, ge=1, le=500),
) -> list[EvidenceRecord]:
    return query_evidence(event_id=event_id, limit=limit, include_demo=include_demo)


@api.get("/evidence/{event_id}", response_model=EvidenceRecord)
def event_evidence(event_id: str) -> EvidenceRecord:
    records = query_evidence(event_id=event_id, limit=1)
    if not records:
        raise HTTPException(status_code=404, detail="Evidence record not found.")
    return records[0]


@api.get("/findings", response_model=list[DetectionFinding])
def list_findings(
    event_id: str | None = Query(default=None, max_length=128),
    severity: Literal["info", "low", "medium", "high", "critical"] | None = None,
    include_demo: bool = False,
    limit: int = Query(default=100, ge=1, le=500),
) -> list[DetectionFinding]:
    return query_findings(
        event_id=event_id,
        severity=severity,
        include_demo=include_demo,
        limit=limit,
    )


@api.get("/self-tests", response_model=list[SelfTestResult])
def get_self_tests() -> list[SelfTestResult]:
    return previous_self_tests()


@api.post("/self-tests/run", response_model=SelfTestRun)
def execute_self_tests() -> SelfTestRun:
    return run_self_tests()


@api.get("/reports/summary", response_model=ReportSummary)
def report_summary(
    since: datetime | None = None,
    until: datetime | None = None,
    source_type: Literal["web", "ssh", "database", "mobile"] | None = None,
    severity: Literal["info", "low", "medium", "high", "critical"] | None = None,
    include_demo: bool = True,
) -> ReportSummary:
    if since and until and since > until:
        raise HTTPException(status_code=422, detail="since must be earlier than or equal to until.")
    return make_report(
        _report_events(
            since=since,
            until=until,
            source_type=source_type,
            severity=severity,
            include_demo=include_demo,
        ),
        since=since,
        until=until,
    )


@api.get("/reports/export")
def report_export(
    since: datetime | None = None,
    until: datetime | None = None,
    source_type: Literal["web", "ssh", "database", "mobile"] | None = None,
    severity: Literal["info", "low", "medium", "high", "critical"] | None = None,
    include_demo: bool = True,
) -> Response:
    if since and until and since > until:
        raise HTTPException(status_code=422, detail="since must be earlier than or equal to until.")
    report = make_report(
        _report_events(
            since=since,
            until=until,
            source_type=source_type,
            severity=severity,
            include_demo=include_demo,
        ),
        since=since,
        until=until,
    )
    return Response(
        content=events_to_csv(report.events),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="honeyprobe-events.csv"'},
    )


@api.get("/reports/html")
def report_html(
    since: datetime | None = None,
    until: datetime | None = None,
    source_type: Literal["web", "ssh", "database", "mobile"] | None = None,
    severity: Literal["info", "low", "medium", "high", "critical"] | None = None,
    include_demo: bool = True,
) -> HTMLResponse:
    if since and until and since > until:
        raise HTTPException(status_code=422, detail="since must be earlier than or equal to until.")
    report = make_report(
        _report_events(
            since=since,
            until=until,
            source_type=source_type,
            severity=severity,
            include_demo=include_demo,
        ),
        since=since,
        until=until,
    )
    return HTMLResponse(content=report_to_html(report))


@api.post("/reports/generate", response_model=ReportDocument, status_code=201)
def generate_persisted_report() -> ReportDocument:
    generated_at = utc_now()
    events = all_events(limit=10000, include_demo=False)
    summary = make_report(events, since=None, until=generated_at)
    event_ids = {event.id for event in events}
    evidence = [
        record
        for record in query_evidence(limit=10000, include_demo=False)
        if record.event_id in event_ids
    ]
    report_id = f"report_{uuid.uuid4().hex}"
    unsigned_document = {
        "id": report_id,
        "generated_at": generated_at.isoformat(),
        "summary": summary.model_dump(mode="json"),
        "events": [event.model_dump(mode="json") for event in events],
        "evidence": [record.model_dump(mode="json") for record in evidence],
    }
    document = ReportDocument(**unsigned_document, sha256="")
    canonical_document = json.dumps(
        document.model_dump(mode="json", exclude={"sha256"}),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    digest = hashlib.sha256(canonical_document.encode("utf-8")).hexdigest()
    document = document.model_copy(update={"sha256": digest})
    save_generated_report(document)
    return document


@api.get("/reports/latest", response_model=ReportDocument)
def latest_report() -> ReportDocument:
    report = get_generated_report()
    if report is None:
        raise HTTPException(status_code=404, detail="No report has been generated yet.")
    return report


@api.get("/reports/verify", response_model=ReportVerification)
def verify_report(
    sha256: str = Query(min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$"),
) -> ReportVerification:
    report = verify_generated_report(sha256)
    return ReportVerification(
        valid=report is not None,
        report_id=report.id if report else None,
        checked_at=utc_now(),
        detail=(
            "Stored report hash and content match."
            if report
            else "No stored report matched this SHA-256 digest."
        ),
    )


@api.get("/reports/{report_id}", response_model=ReportDocument)
def get_report(report_id: str) -> ReportDocument:
    report = get_generated_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    return report


@api.get("/adaptive-actions/audit", response_model=list[AdaptiveActionAudit])
def adaptive_action_audit(
    limit: int = Query(default=100, ge=1, le=500),
) -> list[AdaptiveActionAudit]:
    return read_adaptive_action_audit(limit)


@api.post(
    "/adaptive-actions/dry-run",
    response_model=AdaptiveActionAudit,
    status_code=201,
)
def adaptive_action_dry_run(
    payload: AdaptiveActionInput,
    request: Request,
) -> AdaptiveActionAudit:
    actor_id = request.headers.get("x-honeyprobe-operator", "").strip()
    if not actor_id:
        raise HTTPException(status_code=403, detail="A verified operator identity is required.")

    finding = get_detection_finding(payload.finding_id)
    if finding is None:
        raise HTTPException(
            status_code=404,
            detail="The referenced non-test detection finding was not found.",
        )
    evidence_records = query_evidence(
        event_id=finding.event_id,
        limit=1,
        include_demo=False,
    )
    evidence = next(
        (record for record in evidence_records if record.id == finding.evidence_id),
        None,
    )
    if evidence is None:
        raise HTTPException(
            status_code=409,
            detail="The finding's linked evidence record is unavailable.",
        )

    evidence_context = {
        "finding_id": finding.id,
        "event_id": finding.event_id,
        "evidence_id": evidence.id,
        "evidence_sha256": evidence.sha256,
        "rule_name": finding.rule_name,
        "severity": finding.severity,
        "detection_reason": finding.reason,
    }
    recommendation = {
        "action": payload.action,
        "basis": evidence_context,
        "statement": (
            f"Review the {finding.rule_name} finding and its linked evidence before "
            "considering this configuration control. This request only previews "
            "the configured Phase 3 checks; it does not mitigate the event."
        ),
        "mode": "preview_only",
    }

    from honeyprobe.phase3_adapter import run_phase3_dry_run

    try:
        preview = run_phase3_dry_run()
        preview["evidence_context"] = evidence_context
        preview["recommendation"] = recommendation
        result = (
            "blocked"
            if preview["blocked_actions"] or not preview["healthy"]
            else "previewed"
        )
    except Exception as error:
        create_adaptive_action_audit(
            action=payload.action,
            actor_id=actor_id,
            reason=payload.reason,
            result="failed",
            preview={"error": type(error).__name__, "applied_actions": 0},
            finding_id=finding.id,
            evidence_id=evidence.id,
        )
        raise HTTPException(
            status_code=503,
            detail="The dry-run preview failed and was recorded in the audit log.",
        ) from error

    return create_adaptive_action_audit(
        action=payload.action,
        actor_id=actor_id,
        reason=payload.reason,
        result=result,
        preview=preview,
        finding_id=finding.id,
        evidence_id=evidence.id,
    )


def _demo_generation_enabled() -> bool:
    environment = os.getenv("HONEYPROBE_ENV", "development").lower()
    return environment in {"development", "demo", "test"}


@api.post("/demo/generate", response_model=DemoGenerationResult, status_code=201)
def demo_generate(payload: DemoGenerationInput) -> DemoGenerationResult:
    if not _demo_generation_enabled():
        raise HTTPException(
            status_code=403,
            detail="Synthetic event generation is disabled outside development, demo, and test environments.",
        )
    events = generate_demo_events(payload)
    return DemoGenerationResult(created=len(events), events=events)


@api.post("/demo/reset", response_model=DemoResetResult)
def demo_reset() -> DemoResetResult:
    if not _demo_generation_enabled():
        raise HTTPException(
            status_code=403,
            detail="Demo-data reset is disabled outside development, demo, and test environments.",
        )
    return DemoResetResult(deleted=remove_test_events(), preserved_observed_events=True)


app.include_router(api)

