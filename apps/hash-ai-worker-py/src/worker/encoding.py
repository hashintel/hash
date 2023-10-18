"""Conversion utilities for Pydantic."""

# Inspired by https://github.com/temporalio/samples-python/blob/main/pydantic_converter/converter.py

import json
from typing import Any

from pydantic import BaseModel
from pydantic.json import pydantic_encoder
from temporalio.api.common.v1 import Payload
from temporalio.converter import (
    CompositePayloadConverter,
    DataConverter,
    DefaultPayloadConverter,
    JSONPlainPayloadConverter,
)

__all__ = ["pydantic_data_converter"]


class PydanticJSONPayloadConverter(JSONPlainPayloadConverter):
    """Pydantic JSON payload converter.

    This extends the :py:class:`JSONPlainPayloadConverter` to override
    :py:meth:`to_payload` using the Pydantic encoder.
    """

    def to_payload(self, value: Any) -> Payload | None:  # noqa: ANN401
        """Convert all values with Pydantic encoder or fail.

        Like the base class, we fail if we cannot convert. This payload
        converter is expected to be the last in the chain, so it can fail if
        unable to convert.
        """

        def encoder(obj: Any) -> Any:  # noqa: ANN401
            if isinstance(obj, BaseModel):
                return obj.model_dump(by_alias=True)

            return pydantic_encoder(obj)

        # We let JSON conversion errors be thrown to caller
        return Payload(
            metadata={"encoding": self.encoding.encode()},
            data=json.dumps(
                value,
                separators=(",", ":"),
                sort_keys=True,
                default=encoder,
            ).encode(),
        )


class PydanticPayloadConverter(CompositePayloadConverter):
    """Payload converter to replace Temporal JSON conversion with Pydantic."""

    def __init__(self) -> None:
        super().__init__(
            *(
                (
                    c
                    if not isinstance(c, JSONPlainPayloadConverter)
                    else PydanticJSONPayloadConverter()
                )
                for c in DefaultPayloadConverter.default_encoding_payload_converters
            ),
        )


pydantic_data_converter = DataConverter(
    payload_converter_class=PydanticPayloadConverter,
)
"""Data converter using Pydantic JSON conversion."""
