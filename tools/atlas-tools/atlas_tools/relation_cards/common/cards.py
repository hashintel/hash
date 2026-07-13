from pydantic import BaseModel, NonNegativeInt

from atlas_tools.common import Sha256Hex


class CardRow(BaseModel):
    card_text: str
    card_hash: Sha256Hex

    token_count: NonNegativeInt
    truncations: list[str]

    severely_truncated: bool
