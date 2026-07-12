"""Configuration shared by every relation-card datasource."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, PositiveInt

type TokenizerName = Literal["cl100k", "heuristic"]
type SentenceSplitterName = Literal["punkt", "naive"]


class CardsConfig(BaseModel):
    """Card-format knobs; datasource extraction config must stay separate."""

    model_config = ConfigDict(extra="forbid")

    token_budget: PositiveInt = 6000
    hard_token_budget: PositiveInt = 7500
    tokenizer: TokenizerName = "cl100k"  # tests must use "heuristic"
    # punkt requires the nltk punkt_tab data (see README); tests use "naive".
    sentence_splitter: SentenceSplitterName = "punkt"
