"""PED-ANOVA parameter importances, the one evaluator that runs without sklearn.

Optuna's default evaluator (fANOVA) and its mean-decrease-impurity evaluator
both build random forests with scikit-learn, which is neither in the service
venv nor shipped into Pyodide. PED-ANOVA needs numpy alone.
"""

from __future__ import annotations

import math
import warnings

import optuna
from optuna.exceptions import ExperimentalWarning
from optuna.importance import PedAnovaImportanceEvaluator, get_param_importances
from optuna.trial import TrialState

# Below this many completed trials the estimate is a hint at best; the host
# fades it. The floor rises with the study so a long study earns its confidence.
LONG_STUDY_TRIALS = 100


def importance_cadence(requested_trials: int) -> int:
    """How many completed trials pass between one importance estimate and the next."""
    return max(10, requested_trials // 20)


def importance_floor(requested_trials: int) -> int:
    """The completed-trial count from which the estimate is worth streaming."""
    return LONG_STUDY_TRIALS if requested_trials >= LONG_STUDY_TRIALS else 50


def completed_trials(study: optuna.Study) -> int:
    return len(study.get_trials(deepcopy=False, states=(TrialState.COMPLETE,)))


def _estimate(study: optuna.Study) -> dict[str, float] | None:
    completed = study.get_trials(deepcopy=False, states=(TrialState.COMPLETE,))
    if len(completed) < 2:
        return None
    parameters = {name for trial in completed for name in trial.distributions}
    if len(parameters) < 2:
        return None
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", ExperimentalWarning)
        importances = get_param_importances(
            study, evaluator=PedAnovaImportanceEvaluator(evaluate_on_local=False)
        )
    values = {name: float(value) for name, value in importances.items()}
    if any(not math.isfinite(value) or value < 0 for value in values.values()):
        return None
    return values


def parameter_importances(study: optuna.Study) -> dict[str, float] | None:
    """Normalised importances over the completed trials, or None when they cannot be estimated.

    Uses `PedAnovaImportanceEvaluator(evaluate_on_local=False)` and no
    `target`: a target callable forces lower-is-better and returns a confident
    wrong ranking for a maximised objective. None on fewer than two completed
    trials, on a single optimized parameter, and on any exception the
    evaluator raises, so a study never fails for its summary.
    """
    try:
        return _estimate(study)
    except Exception:
        return None
