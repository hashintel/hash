"""Adapt resolved SemType entity types into canonical relation-card inputs."""

import hashlib
import math
from collections import defaultdict
from collections.abc import Iterable, Sequence
from pathlib import PurePosixPath
from urllib.parse import urlsplit, urlunsplit

from pydantic import HttpUrl, PositiveInt
from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.relation.lineage.api import LineageNode
from atlas_tools.relation_cards.common.cards import qualify_relation_id
from atlas_tools.relation_cards.common.examples import (
    ExampleCandidate,
    ExampleStratum,
    select_diverse_examples,
)
from atlas_tools.relation_cards.common.model import (
    PhraseInput,
    RelationCardInput,
    RelationConstraints,
    RelationExample,
)
from atlas_tools.relation_cards.hash.model import (
    EntityTypeRow,
    HashExampleSelection,
    HashRelationRecord,
    LinkConstraint,
    LinkExampleRow,
)

LINK_ENTITY_TYPE_BASE_URL = "https://blockprotocol.org/@blockprotocol/types/entity-type/link/"
_ENGLISH = LanguageAlpha2("en")
_MINIMUM_VERSIONED_PATH_PARTS = 3


class UnresolvedTypeReferenceError(ValueError):
    """A resolved schema refers to an entity type absent from the live selection."""


def versioned_url_base_url(url: HttpUrl | str) -> str:
    """Return the base URL from HASH's canonical ``.../v/<version>`` shape."""
    parsed = urlsplit(str(url))
    parts = parsed.path.rstrip("/").split("/")
    if len(parts) < _MINIMUM_VERSIONED_PATH_PARTS or parts[-2] != "v" or not parts[-1].isdigit():
        raise ValueError(f"expected a versioned SemType URL, got {url}")

    path = "/".join(parts[:-2]) + "/"
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def _phrase(row: EntityTypeRow) -> PhraseInput:
    return PhraseInput(
        label=row.source_schema.title,
        description=row.source_schema.description or None,
    )


def _latest_by_base_url(rows: Sequence[EntityTypeRow]) -> dict[str, EntityTypeRow]:
    latest: dict[str, EntityTypeRow] = {}

    for row in rows:
        key = str(row.base_url)
        current = latest.get(key)
        if current is None or row.version > current.version:
            latest[key] = row

    return latest


def _is_link_type(row: EntityTypeRow) -> bool:
    return any(
        versioned_url_base_url(entry.id) == LINK_ENTITY_TYPE_BASE_URL
        for entry in row.closed_schema.all_of
    )


def _resolve(
    url: HttpUrl,
    rows_by_versioned_url: dict[str, EntityTypeRow],
) -> EntityTypeRow:
    try:
        return rows_by_versioned_url[str(url)]
    except KeyError as error:
        raise UnresolvedTypeReferenceError(
            f"resolved SemType closure refers to unavailable type {url}"
        ) from error


def _rows_by_versioned_url(rows: Sequence[EntityTypeRow]) -> dict[str, EntityTypeRow]:
    indexed: dict[str, EntityTypeRow] = {}
    for row in rows:
        versioned_url = str(row.source_schema.id)
        if versioned_url in indexed:
            raise ValueError(f"entity type selection repeats versioned URL {versioned_url}")
        indexed[versioned_url] = row
    return indexed


def _direct_parent_base_urls(
    row: EntityTypeRow,
    rows_by_versioned_url: dict[str, EntityTypeRow],
) -> tuple[str, ...]:
    parents: set[str] = set()
    for entry in row.closed_schema.all_of:
        if entry.depth != 1:
            continue
        parent = _resolve(entry.id, rows_by_versioned_url)
        parent_base_url = versioned_url_base_url(entry.id)
        if parent_base_url != str(parent.base_url):
            raise ValueError(
                f"resolved SemType reference {entry.id} disagrees with base URL {parent.base_url}"
            )
        parents.add(parent_base_url)
    return tuple(sorted(parents))


def build_hash_lineage_nodes(entity_types: Sequence[EntityTypeRow]) -> tuple[LineageNode, ...]:
    """Build the closed direct-parent graph before relation-card prose projection."""
    latest = _latest_by_base_url(entity_types)
    rows_by_versioned_url = _rows_by_versioned_url(entity_types)
    selected = {str(row.base_url): row for row in latest.values() if _is_link_type(row)}

    pending = list(selected.values())
    expanded: set[str] = set()
    while pending:
        row = pending.pop()
        row_base_url = str(row.base_url)
        if row_base_url in expanded:
            continue
        expanded.add(row_base_url)
        for parent_base_url in _direct_parent_base_urls(row, rows_by_versioned_url):
            if parent_base_url not in selected:
                dependency = latest[parent_base_url]
                selected[parent_base_url] = dependency
                pending.append(dependency)

    nodes = (
        LineageNode(
            relation_id=qualify_relation_id("hash", row.base_url),
            extends=tuple(
                qualify_relation_id("hash", parent_base_url)
                for parent_base_url in _direct_parent_base_urls(row, rows_by_versioned_url)
            ),
            inverse_edges=(),
        )
        for row in selected.values()
    )
    return tuple(sorted(nodes, key=lambda node: node.relation_id))


def _deduplicate_rows(rows: Iterable[EntityTypeRow]) -> tuple[EntityTypeRow, ...]:
    by_base_url: dict[str, EntityTypeRow] = {}

    for row in rows:
        key = str(row.base_url)
        current = by_base_url.get(key)

        if current is None or row.version > current.version:
            by_base_url[key] = row

    return tuple(
        sorted(
            by_base_url.values(),
            key=lambda entry: (entry.source_schema.title.casefold(), str(entry.base_url)),
        )
    )


def _deduplicate_phrases(rows: Iterable[EntityTypeRow]) -> tuple[PhraseInput, ...]:
    return tuple(_phrase(row) for row in _deduplicate_rows(rows))


def _example_order_key(relation_base_url: str, example: LinkExampleRow) -> bytes:
    stable_identity = (
        f"{relation_base_url}\0{example.link_entity_id}\0{example.subject_id}\0{example.object_id}"
    )

    return hashlib.sha256(stable_identity.encode("utf-8")).digest()


def _example_recognizability(example: LinkExampleRow) -> float:
    """Rank endpoints by their frequency within this relation's own snapshot."""
    return math.log1p(example.subject_frequency) + math.log1p(example.object_frequency)


def _normalized_distinct_examples(
    relation_base_url: str,
    candidates: Sequence[LinkExampleRow],
) -> tuple[LinkExampleRow, ...]:
    """Normalize labels and collapse duplicate database endpoint pairs."""
    endpoint_pairs: dict[tuple[str, str], LinkExampleRow] = {}
    for candidate in sorted(
        candidates,
        key=lambda example: _example_order_key(relation_base_url, example),
    ):
        subject_label = " ".join(candidate.subject_label.split())
        object_label = " ".join(candidate.object_label.split())
        if not subject_label or not object_label:
            continue
        endpoint_pairs.setdefault(
            (candidate.subject_id, candidate.object_id),
            candidate.model_copy(
                update={
                    "subject_label": subject_label,
                    "object_label": object_label,
                    "source_type_base_url": None,
                    "source_type_title": None,
                }
            ),
        )

    return tuple(endpoint_pairs.values())


def _select_examples(
    relation_base_url: str,
    source_types: Sequence[EntityTypeRow],
    candidates: Sequence[LinkExampleRow],
    example_count: int,
) -> tuple[tuple[LinkExampleRow, ...], HashExampleSelection]:
    """Assign SemType strata, then apply the shared diverse selector."""
    distinct_candidates = _normalized_distinct_examples(relation_base_url, candidates)

    ordered_sources = _deduplicate_rows(source_types)
    source_by_base_url = {str(source.base_url): source for source in ordered_sources}
    source_order = {str(source.base_url): index for index, source in enumerate(ordered_sources)}
    pools: dict[str, list[LinkExampleRow]] = {
        str(source.base_url): [] for source in ordered_sources
    }
    unmatched: list[LinkExampleRow] = []
    if ordered_sources:
        for candidate in distinct_candidates:
            closure_order = {
                str(base_url): index
                for index, base_url in enumerate(candidate.subject_type_base_urls)
            }
            matching_sources = [
                base_url for base_url in source_by_base_url if base_url in closure_order
            ]
            if not matching_sources:
                unmatched.append(candidate)
                continue
            stratum = min(
                matching_sources,
                key=lambda base_url: (closure_order[base_url], source_order[base_url]),
            )
            pools[stratum].append(candidate)

    unmatched_used = False
    if not ordered_sources:
        candidate_pools: list[tuple[str | None, Sequence[LinkExampleRow]]] = [
            (None, distinct_candidates)
        ]
    elif all(not pool for pool in pools.values()):
        candidate_pools = [(None, unmatched)]
        unmatched_used = bool(unmatched)
    else:
        candidate_pools = [
            (str(source.base_url), pools[str(source.base_url)])
            for source in ordered_sources
            if pools[str(source.base_url)]
        ]

    strata = [
        ExampleStratum(
            key=key,
            candidates=tuple(
                ExampleCandidate(
                    payload=candidate,
                    subject_token=candidate.subject_id,
                    object_token=candidate.object_id,
                    subgroup=(
                        str(candidate.subject_direct_type_base_urls[0])
                        if candidate.subject_direct_type_base_urls
                        else ""
                    ),
                    recognizability=_example_recognizability(candidate),
                    additional_conflict_tokens=frozenset(
                        {
                            "rendered:"
                            + "\0".join(
                                (
                                    (
                                        source_by_base_url[key].source_schema.title.casefold()
                                        if key is not None
                                        else ""
                                    ),
                                    candidate.subject_label.casefold(),
                                    candidate.object_label.casefold(),
                                )
                            )
                        }
                    ),
                )
                for candidate in pool
            ),
        )
        for key, pool in candidate_pools
    ]
    selected = select_diverse_examples(strata, count=example_count)
    examples = tuple(
        example.payload.model_copy(
            update={
                "source_type_base_url": (
                    HttpUrl(example.stratum) if example.stratum is not None else None
                ),
                "source_type_title": (
                    source_by_base_url[example.stratum].source_schema.title
                    if example.stratum is not None
                    else None
                ),
            }
        )
        for example in selected
    )
    return examples, HashExampleSelection(
        candidate_pairs=len(distinct_candidates),
        unmatched_candidates=len(unmatched),
        unmatched_used=unmatched_used,
        stratum_candidates={base_url: len(pool) for base_url, pool in pools.items() if pool},
    )


def _slug(base_url: HttpUrl) -> str:
    return PurePosixPath(urlsplit(str(base_url)).path.rstrip("/")).name


def _single_value_constraint(
    associations: Sequence[tuple[EntityTypeRow, LinkConstraint]],
) -> bool | None:
    """Project per-source cardinality into the shared relation vocabulary."""
    if not associations:
        return None

    return all(
        constraint.max_items is not None and constraint.max_items <= 1
        for _source, constraint in associations
    )


def build_relation_records(
    entity_types: Sequence[EntityTypeRow],
    examples: Sequence[LinkExampleRow],
    *,
    example_count: PositiveInt,
) -> list[HashRelationRecord]:
    """Build one canonical card record per latest active logical link type."""
    latest = _latest_by_base_url(entity_types)
    rows_by_versioned_url = _rows_by_versioned_url(entity_types)
    link_types = [row for row in latest.values() if _is_link_type(row)]

    associations: dict[str, list[tuple[EntityTypeRow, LinkConstraint]]] = defaultdict(list)
    for source in latest.values():
        for link_url, constraint in source.closed_schema.links.items():
            associations[versioned_url_base_url(link_url)].append((source, constraint))

    examples_by_relation: dict[tuple[str, int], list[LinkExampleRow]] = defaultdict(list)
    for example in examples:
        examples_by_relation[(str(example.relation_base_url), example.relation_version)].append(
            example
        )

    records: list[HashRelationRecord] = []
    for relation in sorted(link_types, key=lambda row: str(row.base_url)):
        relation_base_url = str(relation.base_url)
        ancestors = [
            _resolve(entry.id, rows_by_versioned_url)
            for entry in sorted(
                relation.closed_schema.all_of,
                key=lambda item: (item.depth, str(item.id)),
            )
            if str(entry.id) != str(relation.source_schema.id)
        ]

        relation_associations = associations.get(relation_base_url, [])
        source_types = [source for source, _constraint in relation_associations]
        target_types = [
            _resolve(reference.ref, rows_by_versioned_url)
            for _source, constraint in relation_associations
            for reference in (constraint.items.one_of if constraint.items is not None else ())
        ]

        selected_examples, example_selection = _select_examples(
            relation_base_url,
            source_types,
            examples_by_relation.get((relation_base_url, relation.version), []),
            example_count,
        )

        inverse_title = relation.source_schema.inverse.title
        card_input = RelationCardInput(
            language=_ENGLISH,
            title=relation.source_schema.title,
            description=relation.source_schema.description or None,
            inverse=PhraseInput(label=inverse_title) if inverse_title else None,
            ancestors=_deduplicate_phrases(ancestors),
            source_types=_deduplicate_phrases(source_types),
            target_types=_deduplicate_phrases(target_types),
            constraints=RelationConstraints(
                single_value=_single_value_constraint(relation_associations),
                direction="source -> target",
            ),
            examples=tuple(
                RelationExample(
                    subject_label=example.subject_label,
                    object_label=example.object_label,
                    stratum_label=example.source_type_title,
                )
                for example in selected_examples
            ),
            slug=_slug(relation.base_url),
        )

        records.append(
            HashRelationRecord(
                base_url=relation.base_url,
                version=relation.version,
                versioned_url=relation.source_schema.id,
                card_input=card_input,
                examples=selected_examples,
                example_selection=example_selection,
            )
        )

    return records
