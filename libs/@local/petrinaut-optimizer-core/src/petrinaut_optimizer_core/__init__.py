"""Optuna study logic shared by the optimizer service and the in-browser optimizer.

Pure Python over Optuna: parse an `optimization.describe` result, build the
seeded study, map parameters onto Optuna suggestions, and drive an ask/tell
loop whose trials the caller evaluates. No threads, no event-loop ownership,
no file or network access, so the same modules run under CPython in the
FastAPI service and under Pyodide in a browser worker.

@layerRoot optimizer-core
@role Optuna study construction, suggestion and ask/tell loop shared by the service and the browser worker
"""

from .ask_tell import Evaluate, IsCancelled, OnTrial, objective_of, run_study
from .description import (
    MAX_SEEDS_PER_TRIAL,
    MAX_STUDY_TRIALS,
    BooleanParameter,
    Direction,
    FloatParameter,
    IntParameter,
    Parameter,
    SamplerName,
    StudyDescription,
    parse_description,
)
from .pyodide_entry import run_browser_study, to_python
from .study import (
    SAMPLERS,
    Scalar,
    best_summary,
    create_study,
    study_summary,
    suggest,
    trial_event,
)

__all__ = [
    "MAX_SEEDS_PER_TRIAL",
    "MAX_STUDY_TRIALS",
    "SAMPLERS",
    "BooleanParameter",
    "Direction",
    "Evaluate",
    "FloatParameter",
    "IntParameter",
    "IsCancelled",
    "OnTrial",
    "Parameter",
    "SamplerName",
    "Scalar",
    "StudyDescription",
    "best_summary",
    "create_study",
    "objective_of",
    "parse_description",
    "run_browser_study",
    "run_study",
    "study_summary",
    "suggest",
    "to_python",
    "trial_event",
]
