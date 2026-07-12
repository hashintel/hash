"""Shared type vocabulary for values that cross package boundaries.

NewTypes brand values whose meaning a bare ``int`` or ``str`` would erase, so
mixing them up is a type error instead of a silent bug. Annotated aliases
attach validation that pydantic enforces at every model boundary, so malformed
values are rejected where they enter, not where they are eventually used.

Domain-specific vocabulary stays in its own package (for example the Wikidata
entity-id brands in :mod:`atlas_tools.wikidata.model`); this module holds only
definitions that are meaningful across packages.
"""

from typing import Annotated, NewType

from pydantic import Field, JsonValue, StringConstraints

type JsonDict = dict[str, JsonValue]
"""A JSON object with arbitrary but valid-JSON values.

The type for genuinely free-form payloads (foreign engine configs, sidecars
written by other producers). Anything with a known shape gets a model instead.
"""

type Sha256Hex = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
"""A lowercase hexadecimal SHA-256 digest.

Content and config hashes in artifact sidecars use this shape; a model field
of this type rejects truncated, uppercase, or non-hex digests at load time.
"""

type Fraction = Annotated[float, Field(ge=0.0, le=1.0)]
"""A proportion in the closed interval [0, 1]."""

Dim = NewType("Dim", int)
"""An embedding dimensionality (a full vector width or a prefix length)."""

K = NewType("K", int)
"""A k-nearest-neighbor neighborhood size."""
