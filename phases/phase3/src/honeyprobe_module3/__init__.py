"""HoneyProbe Module 3: self-testing and adaptive hardening."""

from .config import Module3Config
from .engine import HardeningEngine
from .models import (
    FindingConfidence,
    FindingSeverity,
    RunSummary,
    TestComparison,
)

__all__ = [
    "FindingConfidence",
    "FindingSeverity",
    "HardeningEngine",
    "Module3Config",
    "RunSummary",
    "TestComparison",
]
__version__ = "0.1.0"
