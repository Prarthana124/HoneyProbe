from __future__ import annotations

import os
import sqlite3
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
    CowrieImportInput,
    DatabaseInteractionInput,
    Decoy,
    DemoGenerationInput,
    DemoGenerationResult,
    DemoResetResult,
    Event,
    EventInput,
    EventPage,
    ImportResult,
    Overview,
    ReportSummary,
    SelfTestResult,
    SelfTestRun,
    Session,
    SessionDetail,
    SessionPage,
    SessionStatusInput,
    SystemHealth,
    WebInteractionInput,
)
from honeyprobe.reports import events_to_csv, report_to_html
from honeyprobe.self_tests import previous_self_tests, run_self_tests
from honeyprobe.storage import (
    all_events,
    database_health,
    get_event,
    initialize_database,
    query_events,
    remove_test_events,
    set_investigation_status,
    utc_now,
)


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


@app.middleware("http")
async def enforce_request_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > 256 * 1024:
                return JSONResponse(
                    status_code=413,
                    content={"error": "request_too_large", "detail": "Request body exceeds 256 KB."},
                )
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_content_length", "detail": "Invalid Content-Length header."},
            )
    return await call_next(request)


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
) -> list[Event]:
    return all_events(
        since=since,
        until=until,
        source_type=source_type,
        severity=severity,
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
) -> tuple[list[Session], int]:
    events = all_events(
        since=since,
        until=until,
        source_type=source_type,
        severity=severity,
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
) -> Overview:
    end = until or utc_now()
    start = since or (end - timedelta(hours=24))
    events = all_events(since=start, until=end)
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
) -> SessionPage:
    sessions, total = _session_rows(
        q=q,
        severity=severity,
        source_type=source_type,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
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
) -> Analytics:
    if since and until and since > until:
        raise HTTPException(status_code=422, detail="since must be earlier than or equal to until.")
    events = all_events(since=since, until=until, source_type=source_type, severity=severity)
    return make_analytics(events, since=since, until=until)


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
) -> ReportSummary:
    if since and until and since > until:
        raise HTTPException(status_code=422, detail="since must be earlier than or equal to until.")
    return make_report(
        _report_events(since=since, until=until, source_type=source_type, severity=severity),
        since=since,
        until=until,
    )


@api.get("/reports/export")
def report_export(
    since: datetime | None = None,
    until: datetime | None = None,
    source_type: Literal["web", "ssh", "database", "mobile"] | None = None,
    severity: Literal["info", "low", "medium", "high", "critical"] | None = None,
) -> Response:
    if since and until and since > until:
        raise HTTPException(status_code=422, detail="since must be earlier than or equal to until.")
    report = make_report(
        _report_events(since=since, until=until, source_type=source_type, severity=severity),
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
) -> HTMLResponse:
    if since and until and since > until:
        raise HTTPException(status_code=422, detail="since must be earlier than or equal to until.")
    report = make_report(
        _report_events(since=since, until=until, source_type=source_type, severity=severity),
        since=since,
        until=until,
    )
    return HTMLResponse(content=report_to_html(report))


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

