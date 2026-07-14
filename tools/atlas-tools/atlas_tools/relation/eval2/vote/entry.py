from datetime import timedelta
from typing import NewType, cast

from pydantic import AwareDatetime, NonNegativeInt, computed_field

from atlas_tools.common import Sha256Hex
from atlas_tools.relation.eval.schema import BundleId, FramingId
from atlas_tools.relation.eval2.common import FrozenModel
from atlas_tools.relation.eval2.llm import ModelConfiguration, ModelCost
from atlas_tools.relation.eval2.prompt import ShellId
from atlas_tools.relation.eval2.rubric import RubricVersion
from atlas_tools.relation_cards.common.cards import RelationId

VoteId = NewType("VoteId", str)


class VoteProvenance(FrozenModel):
    rubric_version: RubricVersion
    card_hash: Sha256Hex
    prompt_pack_hash: Sha256Hex


class VoteStatistics(FrozenModel):
    tokens_in: NonNegativeInt
    tokens_out: NonNegativeInt
    tokens_cached: NonNegativeInt
    tokens_cache_write: NonNegativeInt = 0
    tokens_reasoning: NonNegativeInt = 0


class VoteTimings(FrozenModel):
    request_at: AwareDatetime
    response_at: AwareDatetime

    @computed_field
    @property
    def latency(self) -> timedelta:
        return self.response_at - self.request_at


class VoteEntry(FrozenModel):
    id: VoteId
    relation: RelationId

    provenance: VoteProvenance
    statistics: VoteStatistics
    timings: VoteTimings

    model: ModelConfiguration
    cost: ModelCost

    shell: ShellId
    framing: FramingId

    @computed_field
    @property
    def bundle(self) -> BundleId:
        return cast("BundleId", f"{self.shell}-{self.framing}")
