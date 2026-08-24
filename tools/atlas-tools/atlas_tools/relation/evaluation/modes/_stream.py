"""Merge finite task streams without materializing their remaining work."""

from collections.abc import Iterable, Iterator


def round_robin[Item](streams: Iterable[Iterator[Item]]) -> Iterator[Item]:
    """Yield one item per live stream while preserving each stream's order."""
    active = list(streams)
    while active:
        remaining: list[Iterator[Item]] = []
        for stream in active:
            try:
                yield next(stream)
            except StopIteration:
                continue
            remaining.append(stream)
        active = remaining
