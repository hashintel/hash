from typing import Annotated, NewType

from openrouter.components import ReasoningEffort
from openrouter.operations import Provider
from pydantic import FiniteFloat, StringConstraints

from atlas_tools.relation.eval2.common import FrozenModel

ModelId = NewType("ModelId", str)


class ModelConfiguration(FrozenModel):
    provider: Provider
    model: Annotated[ModelId, StringConstraints(pattern=r"\w+/\w+")]

    reasoning_effort: ReasoningEffort
    temperature: FiniteFloat | None


class ModelCost(FrozenModel):
    estimated: FiniteFloat | None
    actual: FiniteFloat | None
