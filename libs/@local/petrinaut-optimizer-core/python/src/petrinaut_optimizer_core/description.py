"""The parsed form of an `optimization.describe` result.

The result arrives as JSON, from the CLI through the Python bindings or from
the TypeScript describe helper. Parsing turns it into plain dataclasses and
checks the cross-field rules no schema expresses: bound ordering, log-scale
domains, duplicate identifiers, and the study limits.
"""

import math
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal, cast

MAX_STUDY_TRIALS = 1000

type Direction = Literal["maximize", "minimize"]
type SamplerName = Literal["tpe", "random"]

DIRECTIONS: tuple[Direction, ...] = ("maximize", "minimize")
SAMPLER_NAMES: tuple[SamplerName, ...] = ("tpe", "random")


@dataclass(frozen=True)
class FloatParameter:
    identifier: str
    minimum: float
    maximum: float
    log: bool


@dataclass(frozen=True)
class IntParameter:
    identifier: str
    minimum: int
    maximum: int
    step: int
    log: bool


@dataclass(frozen=True)
class BooleanParameter:
    identifier: str


type Parameter = FloatParameter | IntParameter | BooleanParameter


@dataclass(frozen=True)
class StudyDescription:
    direction: Direction
    sampler: SamplerName
    trials: int
    seed: int
    parameters: tuple[Parameter, ...]


def _choice(value: object, choices: tuple[str, ...], message: str) -> str:
    if not isinstance(value, str):
        raise TypeError(message)

    if value not in choices:
        raise ValueError(message)

    return value


def _mapping(value: object, name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise TypeError(f"optimization.describe {name} must be an object")

    return cast("Mapping[str, object]", value)


def _string(value: object, name: str) -> str:
    if not isinstance(value, str):
        raise TypeError(f"optimization.describe {name} must be a string")

    return value


def _integer(value: object, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"optimization.describe {name} must be an integer")

    return value


def _number(value: object, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise TypeError(f"optimization.describe {name} must be a number")

    return float(value)


def _is_log_scale(parameter: Mapping[str, object], identifier: str) -> bool:
    scale = _choice(
        parameter.get("scale"),
        ("linear", "log"),
        f"unsupported optimization parameter scale for {identifier}: {parameter.get('scale')!r}",
    )

    return scale == "log"


def _parse_parameter(raw: object, index: int) -> Parameter:
    parameter = _mapping(raw, f"parameters[{index}]")
    identifier = _string(parameter.get("identifier"), f"parameters[{index}].identifier")
    kind = parameter.get("type")
    if kind == "boolean":
        return BooleanParameter(identifier)
    if kind == "float":
        return FloatParameter(
            identifier,
            minimum=_number(parameter.get("minimum"), f"{identifier}.minimum"),
            maximum=_number(parameter.get("maximum"), f"{identifier}.maximum"),
            log=_is_log_scale(parameter, identifier),
        )
    if kind == "int":
        return IntParameter(
            identifier,
            minimum=_integer(parameter.get("minimum"), f"{identifier}.minimum"),
            maximum=_integer(parameter.get("maximum"), f"{identifier}.maximum"),
            step=_integer(parameter.get("step"), f"{identifier}.step"),
            log=_is_log_scale(parameter, identifier),
        )
    if not isinstance(kind, str):
        raise TypeError(f"unsupported optimization parameter type: {kind!r}")
    raise ValueError(f"unsupported optimization parameter type: {kind!r}")


def _check_domain(parameter: FloatParameter | IntParameter) -> None:
    identifier = parameter.identifier
    if not math.isfinite(parameter.minimum) or not math.isfinite(parameter.maximum):
        raise ValueError(f"{identifier} bounds must be finite numbers")
    if parameter.minimum >= parameter.maximum:
        raise ValueError(f"{identifier}.maximum must exceed minimum")
    if parameter.log and parameter.minimum <= 0:
        raise ValueError(f"{identifier}.minimum must be positive for log scale")
    if isinstance(parameter, IntParameter) and parameter.log and parameter.step != 1:
        raise ValueError(f"{identifier}.step must be 1 for log scale")


def parse_description(raw: Mapping[str, object]) -> StudyDescription:
    """Validate a describe result and return it as a `StudyDescription`.

    Raises `TypeError` for a wrong field type or `ValueError` for a value
    outside its domain, naming the first invalid field.
    """
    direction = cast(
        "Direction",
        _choice(
            raw.get("direction"),
            DIRECTIONS,
            f"unsupported optimization direction: {raw.get('direction')!r}",
        ),
    )
    study = _mapping(raw.get("study"), "study")
    sampler = cast(
        "SamplerName",
        _choice(
            study.get("sampler"),
            SAMPLER_NAMES,
            f"unsupported Optuna sampler: {study.get('sampler')!r}",
        ),
    )
    trials = _integer(study.get("trials"), "study.trials")
    if trials < 1:
        raise ValueError("optimization.describe study.trials must be at least 1")
    if trials > MAX_STUDY_TRIALS:
        raise ValueError(f"optimization.describe study.trials must not exceed {MAX_STUDY_TRIALS}")
    seed = _integer(study.get("seed"), "study.seed")
    if seed < 0:
        raise ValueError("optimization.describe study.seed must be a non-negative integer")

    raw_parameters = raw.get("parameters")
    if not isinstance(raw_parameters, list):
        raise TypeError("optimization.describe parameters must be an array")
    parameters: list[Parameter] = []
    identifiers: set[str] = set()
    for index, item in enumerate(cast("list[object]", raw_parameters)):
        parameter = _parse_parameter(item, index)
        if parameter.identifier in identifiers:
            raise ValueError(f'duplicate optimization parameter "{parameter.identifier}"')
        identifiers.add(parameter.identifier)
        if not isinstance(parameter, BooleanParameter):
            _check_domain(parameter)
        parameters.append(parameter)

    return StudyDescription(
        direction=direction,
        sampler=sampler,
        trials=trials,
        seed=seed,
        parameters=tuple(parameters),
    )
