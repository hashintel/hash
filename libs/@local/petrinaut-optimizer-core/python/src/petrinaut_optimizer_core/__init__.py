"""Optuna study logic for Petrinaut optimization.

Pure Python over Optuna: parse the study description `describeOptimization`
in `@hashintel/petrinaut-core` produces, build the seeded study, map
parameters onto Optuna suggestions, and drive an ask/tell loop whose trials
the caller evaluates. No threads, no event-loop ownership, no file or network
access, so the modules load under Pyodide in the browser optimizer's worker
and run under CPython in the package's tests.

@layerRoot optimizer-core
@role Optuna study construction, suggestion and ask/tell loop for the in-browser optimizer, loaded under Pyodide
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
from .importance import importance_cadence, importance_floor, parameter_importances
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
    "importance_cadence",
    "importance_floor",
    "parameter_importances",
    "parse_description",
    "run_study",
    "suggest",
]
