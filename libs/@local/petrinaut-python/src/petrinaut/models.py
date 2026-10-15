"""Pydantic models generated from the Petrinaut optimization protocol schema."""

from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class Scale(StrEnum):
    linear = "linear"
    log = "log"


class OptimizationFloatParameter(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    identifier: str
    type: Literal["float"]
    default: float
    minimum: float
    maximum: float
    scale: Scale


class OptimizationIntParameter(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    identifier: str
    type: Literal["int"]
    default: float
    minimum: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]
    maximum: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]
    step: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]
    scale: Scale


class OptimizationBooleanParameter(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    identifier: str
    type: Literal["boolean"]
    default: bool


class OptimizationReplicate(BaseModel):
    """One seeded run's objective within a trial."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    seed: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]
    objective: float


class Direction(StrEnum):
    maximize = "maximize"
    minimize = "minimize"


class Sampler(StrEnum):
    tpe = "tpe"
    random = "random"


class Study(BaseModel):
    """Study settings with the execution seed. `seedsPerTrial` is reported once the CLI runs seeded replicates; absent means 1."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    trials: Annotated[int, Field(ge=1, le=1000)]
    sampler: Sampler
    seed: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]
    seeds_per_trial: Annotated[int | None, Field(alias="seedsPerTrial", ge=1, le=100)] = None


class OptimizationEvaluateResult(BaseModel):
    """The `optimization.evaluate` result. `objective` is the mean of the per-seed objectives (identical to the sole run's objective when the trial runs one seed); `replicates` reports the per-seed values whenever a trial runs more than one."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    objective: float
    replicates: list[OptimizationReplicate] | None = None


class HirSpan(BaseModel):
    """Half-open span into the user-visible source text, in UTF-16 code units."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    start: Annotated[int, Field(ge=0, le=9007199254740991)]
    length: Annotated[int, Field(ge=0, le=9007199254740991)]


class HirNumberLit(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["numberLit"]
    value: float
    raw: str


class HirBoolLit(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["boolLit"]
    value: bool


class HirStringLit(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["stringLit"]
    value: str


class HirStringFn(StrEnum):
    starts_with = "startsWith"
    ends_with = "endsWith"
    includes = "includes"


class HirUuidGenerate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["uuidGenerate"]


class HirConstantName(StrEnum):
    pi = "PI"
    e = "E"
    infinity = "Infinity"
    na_n = "NaN"


class HirLocalRef(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["localRef"]
    name: str


class HirParamRef(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["paramRef"]
    name: str


class HirScenarioRef(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["scenarioRef"]
    name: str


class HirUnaryOp(StrEnum):
    field_ = "-"
    field__1 = "+"
    field__2 = "!"


class HirBinaryOp(StrEnum):
    field_ = "+"
    field__1 = "-"
    field__2 = "*"
    field__3 = "/"
    field__4 = "%"
    field__ = "**"
    field__5 = "<"
    field___1 = "<="
    field__6 = ">"
    field___2 = ">="
    field___3 = "=="
    field___4 = "!="
    field___5 = "&&"
    field___6 = "||"


class HirMathFn(StrEnum):
    abs = "abs"
    acos = "acos"
    asin = "asin"
    atan = "atan"
    atan2 = "atan2"
    cbrt = "cbrt"
    ceil = "ceil"
    cos = "cos"
    cosh = "cosh"
    exp = "exp"
    floor = "floor"
    hypot = "hypot"
    log = "log"
    log10 = "log10"
    log2 = "log2"
    max = "max"
    min = "min"
    pow = "pow"
    random = "random"
    round = "round"
    sign = "sign"
    sin = "sin"
    sinh = "sinh"
    sqrt = "sqrt"
    tan = "tan"
    tanh = "tanh"
    trunc = "trunc"


class HirDistributionKind(StrEnum):
    gaussian = "gaussian"
    uniform = "uniform"
    lognormal = "lognormal"


class HirSurfaceKind(StrEnum):
    dynamics = "dynamics"
    lambda_ = "lambda"
    kernel = "kernel"
    metric = "metric"
    scenario_expression = "scenario-expression"
    scenario_code = "scenario-code"


class HirNamedSpan(BaseModel):
    """A declared name (a parameter or a binding) and where it is spelled."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    name: str
    span: HirSpan


class HirConstant(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["constant"]
    name: HirConstantName


class OptimizationDescribeResult(BaseModel):
    """The `optimization.describe` result: direction, study settings, the parameters that are not fixed, and the study's constraints."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    direction: Direction
    study: Study
    """Study settings with the execution seed. `seedsPerTrial` is reported once the CLI runs seeded replicates; absent means 1."""
    parameters: list[
        OptimizationFloatParameter | OptimizationIntParameter | OptimizationBooleanParameter
    ]
    constraints: (
        list[Annotated[ParameterConstraint | StateConstraint, Field(discriminator="space")]] | None
    ) = None
    """The manifest's constraints, passed through verbatim so protocol clients (the Python binding) can evaluate their HIR. Absent means unconstrained."""


class ParameterConstraint(BaseModel):
    """One boolean condition over the parameter space: an expression over `scenario.*` and `parameters.*`, e.g. `scenario.min_load < scenario.max_load`. Checkable before a run starts."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    space: Literal["parameters"]
    id: Annotated[str, Field(min_length=1)]
    name: Annotated[str | None, Field(min_length=1)] = None
    """Optional display name shown wherever the constraint is reported."""
    code: Annotated[str, Field(min_length=1)]
    """The authored TypeScript source, the editable text of record. `hir` is its lowered form; regenerating `hir` from `code` must be a no-op."""
    hir: ParameterConstraintHir


class ParameterConstraintHir(BaseModel):
    """The lowered condition: a `scenario-expression` surface function with no declared parameters; `scenario.*` and `parameters.*` are ambient reads."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    hir_version: Annotated[Literal[1], Field(alias="hirVersion")]
    surface: Literal["scenario-expression"]
    params: list[HirNamedSpan]
    body: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""
    span: HirSpan


class HirStringCall(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["stringCall"]
    fn: HirStringFn
    target: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""
    argument: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""


class HirUuidFrom(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["uuidFrom"]
    operand: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""


class HirRangeCall(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["rangeCall"]
    args: list[
        Annotated[
            HirNumberLit
            | HirBoolLit
            | HirStringLit
            | HirStringCall
            | HirUuidGenerate
            | HirUuidFrom
            | HirConstant
            | HirLocalRef
            | HirParamRef
            | HirScenarioRef
            | HirRangeCall
            | HirFieldAccess
            | HirIndexAccess
            | HirLength
            | HirUnary
            | HirBinary
            | HirCond
            | HirLet
            | HirMathCall
            | HirRecordLit
            | HirArrayLit
            | HirArrayMap
            | HirArrayReduce
            | HirArrayConcat
            | HirDistribution
            | HirDistributionMap,
            Field(discriminator="kind"),
        ]
    ]


class HirFieldAccess(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["fieldAccess"]
    target: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""
    field: str
    field_span: Annotated[HirSpan, Field(alias="fieldSpan")]


class HirIndexAccess(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["indexAccess"]
    target: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""
    index: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""


class HirLength(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["length"]
    target: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""


class HirUnary(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["unary"]
    op: HirUnaryOp
    operand: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""


class HirBinary(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["binary"]
    op: HirBinaryOp
    left: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""
    right: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""


class HirCond(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["cond"]
    condition: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""
    then_branch: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(alias="thenBranch", discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""
    else_branch: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(alias="elseBranch", discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""


class HirLet(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["let"]
    bindings: list[HirLetBinding]
    body: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""


class HirLetBinding(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    name: str
    name_span: Annotated[HirSpan, Field(alias="nameSpan")]
    value: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""


class HirMathCall(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["mathCall"]
    fn: HirMathFn
    args: list[
        Annotated[
            HirNumberLit
            | HirBoolLit
            | HirStringLit
            | HirStringCall
            | HirUuidGenerate
            | HirUuidFrom
            | HirConstant
            | HirLocalRef
            | HirParamRef
            | HirScenarioRef
            | HirRangeCall
            | HirFieldAccess
            | HirIndexAccess
            | HirLength
            | HirUnary
            | HirBinary
            | HirCond
            | HirLet
            | HirMathCall
            | HirRecordLit
            | HirArrayLit
            | HirArrayMap
            | HirArrayReduce
            | HirArrayConcat
            | HirDistribution
            | HirDistributionMap,
            Field(discriminator="kind"),
        ]
    ]


class HirRecordLit(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["recordLit"]
    entries: list[HirRecordEntry]


class HirRecordEntry(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    key: str
    key_span: Annotated[HirSpan, Field(alias="keySpan")]
    value: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""


class HirArrayLit(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["arrayLit"]
    elements: list[
        Annotated[
            HirNumberLit
            | HirBoolLit
            | HirStringLit
            | HirStringCall
            | HirUuidGenerate
            | HirUuidFrom
            | HirConstant
            | HirLocalRef
            | HirParamRef
            | HirScenarioRef
            | HirRangeCall
            | HirFieldAccess
            | HirIndexAccess
            | HirLength
            | HirUnary
            | HirBinary
            | HirCond
            | HirLet
            | HirMathCall
            | HirRecordLit
            | HirArrayLit
            | HirArrayMap
            | HirArrayReduce
            | HirArrayConcat
            | HirDistribution
            | HirDistributionMap,
            Field(discriminator="kind"),
        ]
    ]


class HirArrayMap(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["arrayMap"]
    target: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""
    param: HirNamedSpan
    index_param: Annotated[HirNamedSpan | None, Field(alias="indexParam")] = None
    body: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""


class HirArrayReduce(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["arrayReduce"]
    target: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""
    acc_param: Annotated[HirNamedSpan, Field(alias="accParam")]
    param: HirNamedSpan
    index_param: Annotated[HirNamedSpan | None, Field(alias="indexParam")] = None
    body: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""
    initial: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""


class HirArrayConcat(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["arrayConcat"]
    left: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""
    right: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""


class HirDistribution(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["distribution"]
    dist: HirDistributionKind
    args: list[
        Annotated[
            HirNumberLit
            | HirBoolLit
            | HirStringLit
            | HirStringCall
            | HirUuidGenerate
            | HirUuidFrom
            | HirConstant
            | HirLocalRef
            | HirParamRef
            | HirScenarioRef
            | HirRangeCall
            | HirFieldAccess
            | HirIndexAccess
            | HirLength
            | HirUnary
            | HirBinary
            | HirCond
            | HirLet
            | HirMathCall
            | HirRecordLit
            | HirArrayLit
            | HirArrayMap
            | HirArrayReduce
            | HirArrayConcat
            | HirDistribution
            | HirDistributionMap,
            Field(discriminator="kind"),
        ]
    ]


class HirDistributionMap(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    id: Annotated[int, Field(ge=0, le=9007199254740991)]
    span: HirSpan
    kind: Literal["distributionMap"]
    base: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""
    param: HirNamedSpan
    body: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""


class StateConstraint(BaseModel):
    """One boolean condition over the simulation state, e.g. `state.places.Queue.count <= 10`. A function body with an explicit return is also accepted. Observed while a run goes."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    space: Literal["state"]
    id: Annotated[str, Field(min_length=1)]
    name: Annotated[str | None, Field(min_length=1)] = None
    """Optional display name shown wherever the constraint is reported."""
    code: Annotated[str, Field(min_length=1)]
    """The authored TypeScript source, the editable text of record. `hir` is its lowered form; regenerating `hir` from `code` must be a no-op."""
    hir: StateConstraintHir


class StateConstraintHir(BaseModel):
    """The lowered condition: a `metric` surface function whose first declared parameter is the simulation `state`; `parameters.*` is ambient."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    hir_version: Annotated[Literal[1], Field(alias="hirVersion")]
    surface: Literal["metric"]
    params: list[HirNamedSpan]
    body: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""
    span: HirSpan


class HirFunction(BaseModel):
    """A lowered user function (see hir/hir.ts for the grammar). `params[0]` is the input parameter when the surface declares one; `parameters.*` and `scenario.*` reads are dedicated node kinds, never locals."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    hir_version: Annotated[Literal[1], Field(alias="hirVersion")]
    surface: HirSurfaceKind
    params: list[HirNamedSpan]
    body: Annotated[
        HirNumberLit
        | HirBoolLit
        | HirStringLit
        | HirStringCall
        | HirUuidGenerate
        | HirUuidFrom
        | HirConstant
        | HirLocalRef
        | HirParamRef
        | HirScenarioRef
        | HirRangeCall
        | HirFieldAccess
        | HirIndexAccess
        | HirLength
        | HirUnary
        | HirBinary
        | HirCond
        | HirLet
        | HirMathCall
        | HirRecordLit
        | HirArrayLit
        | HirArrayMap
        | HirArrayReduce
        | HirArrayConcat
        | HirDistribution
        | HirDistributionMap,
        Field(discriminator="kind"),
    ]
    """One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know."""
    span: HirSpan


OptimizationDescribeResult.model_rebuild()
ParameterConstraint.model_rebuild()
ParameterConstraintHir.model_rebuild()
HirStringCall.model_rebuild()
HirUuidFrom.model_rebuild()
HirRangeCall.model_rebuild()
HirFieldAccess.model_rebuild()
HirIndexAccess.model_rebuild()
HirLength.model_rebuild()
HirUnary.model_rebuild()
HirBinary.model_rebuild()
HirCond.model_rebuild()
HirLet.model_rebuild()
HirLetBinding.model_rebuild()
HirMathCall.model_rebuild()
HirRecordLit.model_rebuild()
HirRecordEntry.model_rebuild()
HirArrayLit.model_rebuild()
HirArrayMap.model_rebuild()
HirArrayReduce.model_rebuild()
HirArrayConcat.model_rebuild()
HirDistribution.model_rebuild()
HirDistributionMap.model_rebuild()
StateConstraint.model_rebuild()
