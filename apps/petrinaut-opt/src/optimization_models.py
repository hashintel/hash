"""Validated public contract for Petrinaut optimization."""

from __future__ import annotations

import math
from typing import Annotated, Any, Literal, TypeAlias

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    FiniteFloat,
    StrictBool,
    StrictInt,
    StringConstraints,
    model_validator,
)


def _to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ContractModel(BaseModel):
    """Base model matching the strict, camel-cased TypeScript contract."""

    model_config = ConfigDict(
        alias_generator=_to_camel,
        allow_inf_nan=False,
        extra="forbid",
        populate_by_name=True,
        strict=True,
    )


Number: TypeAlias = FiniteFloat
Scalar: TypeAlias = StrictInt | FiniteFloat | StrictBool


class ContinuousDomain(ContractModel):
    kind: Literal["continuous"]
    minimum: Number
    maximum: Number
    scale: Literal["linear", "log"]

    @model_validator(mode="after")
    def validate_range(self) -> ContinuousDomain:
        if self.minimum >= self.maximum:
            raise ValueError("maximum must be greater than minimum")
        if self.scale == "log" and self.minimum <= 0:
            raise ValueError("a logarithmic range must have a positive minimum")
        return self


class IntegerDomain(ContractModel):
    kind: Literal["integer"]
    minimum: StrictInt
    maximum: StrictInt
    step: Annotated[StrictInt, Field(gt=0)]

    @model_validator(mode="after")
    def validate_range(self) -> IntegerDomain:
        if self.minimum >= self.maximum:
            raise ValueError("maximum must be greater than minimum")
        if (self.maximum - self.minimum) % self.step != 0:
            raise ValueError(
                "step must divide the range exactly so the maximum is reachable"
            )
        return self


class CategoricalDomain(ContractModel):
    kind: Literal["categorical"]
    values: Annotated[list[Scalar], Field(min_length=2)]

    @model_validator(mode="after")
    def validate_unique_values(self) -> CategoricalDomain:
        # JavaScript has one numeric type but considers `true` and `1` distinct
        # Set entries. Normalize Python ints/floats while retaining booleans.
        keys = {
            ("boolean", value)
            if isinstance(value, bool)
            else ("number", float(value))
            for value in self.values
        }
        if len(keys) != len(self.values):
            raise ValueError("categorical values must be unique")
        return self


OptimizationDomain: TypeAlias = Annotated[
    ContinuousDomain | IntegerDomain | CategoricalDomain,
    Field(discriminator="kind"),
]


class OptimizationVariable(ContractModel):
    identifier: Annotated[str, Field(min_length=1)]
    domain: OptimizationDomain


class OptimizationSearchSpace(ContractModel):
    version: Literal[1]
    variables: Annotated[list[OptimizationVariable], Field(min_length=1)]

    @model_validator(mode="after")
    def validate_unique_identifiers(self) -> OptimizationSearchSpace:
        identifiers = [variable.identifier for variable in self.variables]
        if len(set(identifiers)) != len(identifiers):
            raise ValueError("search-space parameter identifiers must be unique")
        return self


class OptimizationModel(ContractModel):
    title: str
    definition: dict[str, Any]

    def as_legacy_file(self) -> dict[str, Any]:
        """Return the legacy file shape consumed by the Petrinaut CLI."""
        return {**self.definition, "title": self.title}


class OptimizationScenario(ContractModel):
    id: Annotated[str, Field(min_length=1)]
    parameter_values: dict[str, Scalar]


class OptimizationObjective(ContractModel):
    metric_id: Annotated[str, Field(min_length=1)]
    direction: Literal["maximize", "minimize"]


class OptimizationExecution(ContractModel):
    seed: Annotated[StrictInt, Field(ge=0, le=2_147_483_647)]
    dt: Annotated[Number, Field(gt=0)]
    max_time: Annotated[Number, Field(gt=0)]


class OptimizationOptions(ContractModel):
    trials: Annotated[StrictInt, Field(ge=1, le=1_000)]
    sampler: Literal["tpe", "random"]


class OptimizationInput(ContractModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    model: OptimizationModel
    scenario: OptimizationScenario
    search_space: OptimizationSearchSpace
    objective: OptimizationObjective
    execution: OptimizationExecution
    optimization: OptimizationOptions

    @model_validator(mode="after")
    def validate_model_references(self) -> OptimizationInput:
        step_count = self.execution.max_time / self.execution.dt
        if not math.isfinite(step_count) or step_count > 100_000:
            raise ValueError(
                "simulation settings exceed the 100,000-step per-trial limit"
            )
        steps_per_trial = math.ceil(step_count)
        if steps_per_trial * self.optimization.trials > 5_000_000:
            raise ValueError(
                "optimization settings exceed the 5,000,000-step aggregate limit"
            )

        definition = self.model.definition
        scenarios = definition.get("scenarios")
        selected_scenario = next(
            (
                candidate
                for candidate in scenarios
                if isinstance(candidate, dict)
                and candidate.get("id") == self.scenario.id
            ),
            None,
        ) if isinstance(scenarios, list) else None
        if selected_scenario is None:
            raise ValueError("the selected scenario does not exist in the model")

        metrics = definition.get("metrics")
        metric_exists = isinstance(metrics, list) and any(
            isinstance(metric, dict)
            and metric.get("id") == self.objective.metric_id
            for metric in metrics
        )
        if not metric_exists:
            raise ValueError("the objective metric does not exist in the model")

        raw_parameters = selected_scenario.get("scenarioParameters")
        if not isinstance(raw_parameters, list):
            raise ValueError("the selected scenario has no parameter definition")
        parameters = {
            parameter.get("identifier"): parameter
            for parameter in raw_parameters
            if isinstance(parameter, dict)
            and isinstance(parameter.get("identifier"), str)
        }

        provided = self.scenario.parameter_values
        missing = parameters.keys() - provided.keys()
        unknown = provided.keys() - parameters.keys()
        if missing:
            raise ValueError(
                "values are required for every scenario parameter: "
                + ", ".join(sorted(missing))
            )
        if unknown:
            raise ValueError(
                "unknown scenario parameters: " + ", ".join(sorted(unknown))
            )

        for identifier, parameter in parameters.items():
            parameter_type = parameter.get("type")
            value = provided[identifier]
            if parameter_type in {"real", "ratio"}:
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    raise ValueError(f'{parameter_type} parameter "{identifier}" must be numeric')
                if parameter_type == "ratio" and not 0 <= value <= 1:
                    raise ValueError(
                        f'ratio parameter "{identifier}" must be between 0 and 1'
                    )
            elif parameter_type == "integer":
                if isinstance(value, bool) or not isinstance(value, int):
                    raise ValueError(f'integer parameter "{identifier}" must be an integer')
            elif parameter_type == "boolean" and not isinstance(value, bool):
                raise ValueError(f'boolean parameter "{identifier}" must be boolean')

        for variable in self.search_space.variables:
            parameter = parameters.get(variable.identifier)
            if parameter is None:
                raise ValueError(
                    f'unknown search-space parameter "{variable.identifier}"'
                )
            parameter_type = parameter.get("type")
            domain = variable.domain
            if parameter_type in {"real", "ratio"} and not isinstance(
                domain, ContinuousDomain
            ):
                raise ValueError(
                    f'{parameter_type} parameter "{variable.identifier}" '
                    "requires a continuous domain"
                )
            if parameter_type == "integer" and not isinstance(domain, IntegerDomain):
                raise ValueError(
                    f'integer parameter "{variable.identifier}" requires an integer domain'
                )
            if parameter_type == "boolean":
                valid_boolean_domain = (
                    isinstance(domain, CategoricalDomain)
                    and len(domain.values) == 2
                    and set(domain.values) == {False, True}
                    and all(isinstance(value, bool) for value in domain.values)
                )
                if not valid_boolean_domain:
                    raise ValueError(
                        f'boolean parameter "{variable.identifier}" must search false and true'
                    )
            if (
                parameter_type == "ratio"
                and isinstance(domain, ContinuousDomain)
                and (domain.minimum < 0 or domain.maximum > 1)
            ):
                raise ValueError(
                    f'ratio parameter "{variable.identifier}" must stay between 0 and 1'
                )
        return self


class OptimizationBest(ContractModel):
    trial: Annotated[StrictInt, Field(ge=0)]
    parameters: dict[str, Scalar]
    objective: Number


class OptimizationStartedEvent(ContractModel):
    type: Literal["started"]
    requested_trials: Annotated[StrictInt, Field(gt=0)]


class OptimizationTrialEvent(ContractModel):
    type: Literal["trial"]
    trial: Annotated[StrictInt, Field(ge=0)]
    parameters: dict[str, Scalar]
    objective: Number | None
    state: Literal["complete", "pruned", "failed"]
    best: OptimizationBest | None


class OptimizationCompleteEvent(ContractModel):
    type: Literal["complete"]
    requested_trials: Annotated[StrictInt, Field(gt=0)]
    completed_trials: Annotated[StrictInt, Field(ge=0)]
    pruned_trials: Annotated[StrictInt, Field(ge=0)]
    failed_trials: Annotated[StrictInt, Field(ge=0)]
    best: OptimizationBest | None


class OptimizationErrorEvent(ContractModel):
    type: Literal["error"]
    code: str
    message: str
    retryable: bool


OptimizationEvent: TypeAlias = Annotated[
    OptimizationStartedEvent
    | OptimizationTrialEvent
    | OptimizationCompleteEvent
    | OptimizationErrorEvent,
    Field(discriminator="type"),
]
