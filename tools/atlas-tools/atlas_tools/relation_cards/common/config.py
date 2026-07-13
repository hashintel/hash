"""Configuration shared by every relation-card datasource."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, PositiveInt

from atlas_tools.common import Fraction

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
    # Overfilter tripwire for Wikidata prose sanitization. Rewriting
    # identifier mentions can, worst case, empty a whole prose field (a
    # description that was entirely an unresolvable identifier reference,
    # or a real-world token that only looks like a QID/PID such as a
    # fiscal "Q1" or a cytochrome "P450"). If more than this fraction of
    # the non-empty prose fields in a corpus are emptied that way,
    # `render_cards` fails so the run can be inspected against the
    # manifest's `prose_sanitization` token histogram. 1.0 disables the
    # guard; tune the default from the first real run.
    max_prose_field_empty_fraction: Fraction = 0.01
