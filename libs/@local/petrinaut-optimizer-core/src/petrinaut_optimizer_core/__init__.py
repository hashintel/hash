"""Optuna study logic for Petrinaut optimization.

Pure Python over Optuna: parse an `optimization.describe` result, build the
seeded study, map parameters onto Optuna suggestions, and drive an ask/tell
loop whose trials the caller evaluates. No threads, no event-loop ownership,
no file or network access, so the modules run under CPython in the FastAPI
service and are written to load under Pyodide.

@layerRoot optimizer-core
@role Optuna study construction, suggestion and ask/tell loop for the optimizer service, written to load under Pyodide
"""

from .ask_tell import run_study
from .description import (
    MAX_STUDY_TRIALS,
    BooleanParameter,
    FloatParameter,
    IntParameter,
    Parameter,
    StudyDescription,
    parse_description,
)
from .study import Scalar, create_study, suggest

__all__ = [
    "MAX_STUDY_TRIALS",
    "BooleanParameter",
    "FloatParameter",
    "IntParameter",
    "Parameter",
    "Scalar",
    "StudyDescription",
    "create_study",
    "parse_description",
    "run_study",
    "suggest",
]
