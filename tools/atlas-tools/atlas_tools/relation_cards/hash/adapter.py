"""Adapt resolved SemType entity types into canonical relation-card inputs."""

import hashlib
from collections import defaultdict
from collections.abc import Iterable, Sequence
from pathlib import PurePosixPath
from urllib.parse import urlsplit, urlunsplit

from pydantic import HttpUrl, PositiveInt
from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.relation_cards.common.model import (
    PhraseInput,
    RelationCardInput,
    RelationConstraints,
    RelationExample,
)
from atlas_tools.relation_cards.hash.model import (
    EntityTypeRow,
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


def _deduplicate_phrases(rows: Iterable[EntityTypeRow]) -> tuple[PhraseInput, ...]:
    by_base_url: dict[str, EntityTypeRow] = {}
    for row in rows:
        key = str(row.base_url)
        current = by_base_url.get(key)
        if current is None or row.version > current.version:
            by_base_url[key] = row
    return tuple(
        _phrase(row)
        for row in sorted(
            by_base_url.values(),
            key=lambda entry: (entry.source_schema.title.casefold(), str(entry.base_url)),
        )
    )


def _example_order_key(relation_base_url: str, example: LinkExampleRow) -> bytes:
    stable_identity = (
        f"{relation_base_url}\0{example.link_entity_id}\0{example.subject_id}\0{example.object_id}"
    )
    return hashlib.sha256(stable_identity.encode("utf-8")).digest()


def _select_examples(
    relation_base_url: str,
    candidates: Sequence[LinkExampleRow],
    example_count: int,
) -> tuple[LinkExampleRow, ...]:
    """Round-robin source-type strata with stable per-relation ordering."""
    strata: dict[str, list[LinkExampleRow]] = defaultdict(list)
    for candidate in candidates:
        if not candidate.subject_label.strip() or not candidate.object_label.strip():
            continue
        strata[candidate.source_type_title].append(candidate)

    for values in strata.values():
        values.sort(key=lambda row: _example_order_key(relation_base_url, row))

    selected: list[LinkExampleRow] = []
    used_endpoints: set[str] = set()
    ordered_strata = sorted(strata, key=str.casefold)
    while len(selected) < example_count:
        progress = False
        for stratum in ordered_strata:
            pool = strata[stratum]
            while pool:
                candidate = pool.pop(0)
                if candidate.subject_id in used_endpoints or candidate.object_id in used_endpoints:
                    continue
                selected.append(candidate)
                used_endpoints.update((candidate.subject_id, candidate.object_id))
                progress = True
                break
            if len(selected) == example_count:
                break
        if not progress:
            break
    return tuple(selected)


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
    rows_by_versioned_url = {str(row.source_schema.id): row for row in entity_types}
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
        selected_examples = _select_examples(
            relation_base_url,
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
            )
        )
    return records
