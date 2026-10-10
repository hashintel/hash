from dataclasses import dataclass
from pathlib import Path
from typing import Self

type LocationPath = tuple[str | int, ...]


@dataclass(frozen=True, slots=True, kw_only=True)
class Location:
    manifest: Path
    path: LocationPath

    def descend(self, field: str | int) -> Self:
        return type(self)(
            manifest=self.manifest,
            path=(*self.path, field),
        )
