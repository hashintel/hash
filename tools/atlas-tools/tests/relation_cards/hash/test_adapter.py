"""Resolved SemType schema adaptation tests."""

import pytest
from pydantic import HttpUrl

from atlas_tools.relation_cards.hash.adapter import (
    LINK_ENTITY_TYPE_BASE_URL,
    UnresolvedTypeReferenceError,
    build_relation_records,
    versioned_url_base_url,
)
from atlas_tools.relation_cards.hash.model import EntityTypeRow, LinkExampleRow


def _url(base_url: str, version: int) -> str:
    return f"{base_url}v/{version}"


def _row(
    base_url: str,
    version: int,
    title: str,
    *,
    description: str = "",
    inverse: str | None = None,
    ancestors: tuple[tuple[str, int], ...] = (),
    links: dict[str, dict[str, object]] | None = None,
) -> EntityTypeRow:
    versioned_url = _url(base_url, version)
    return EntityTypeRow.model_validate(
        {
            "base_url": base_url,
            "version": version,
            "schema": {
                "$id": versioned_url,
                "title": title,
                "description": description,
                "inverse": {"title": inverse} if inverse else {},
            },
            "closed_schema": {
                "$id": versioned_url,
                "title": title,
                "description": description,
                "inverse": {"title": inverse} if inverse else {},
                "allOf": [
                    {
                        "$id": versioned_url,
                        "depth": 0,
                        "icon": "link",
                        "labelProperty": "https://example.com/property/name/",
                    },
                    *(
                        {"$id": ancestor_url, "depth": depth, "icon": "ancestor"}
                        for ancestor_url, depth in ancestors
                    ),
                ],
                "links": links or {},
            },
        }
    )


def _fixture_types() -> list[EntityTypeRow]:
    relation_base = "https://example.com/@acme/types/entity-type/owns/"
    person_base = "https://example.com/@acme/types/entity-type/person/"
    asset_base = "https://example.com/@acme/types/entity-type/asset/"
    link_url = _url(LINK_ENTITY_TYPE_BASE_URL, 1)
    relation_v1_url = _url(relation_base, 1)
    mapping: dict[str, dict[str, object]] = {
        relation_v1_url: {
            "type": "array",
            "items": {"oneOf": [{"$ref": _url(asset_base, 1)}]},
            "maxItems": 1,
        }
    }
    return [
        _row(
            LINK_ENTITY_TYPE_BASE_URL,
            1,
            "Link",
            description="A generic connection.",
        ),
        _row(
            relation_base,
            1,
            "Owns (old)",
            ancestors=((link_url, 1),),
        ),
        _row(
            relation_base,
            2,
            "Owns",
            description="Possession from an owner to an asset.",
            inverse="Owned By",
            ancestors=((link_url, 1),),
        ),
        _row(person_base, 1, "Old Person", links=mapping),
        _row(person_base, 2, "Person", description="A human being.", links=mapping),
        _row(asset_base, 1, "Asset", description="Something that can be owned."),
    ]


def test_latest_link_type_uses_resolved_sources_targets_and_ancestors() -> None:
    relation_base = "https://example.com/@acme/types/entity-type/owns/"
    examples = [
        LinkExampleRow(
            relation_base_url=relation_base,
            relation_version=2,
            link_entity_id="web/link-a",
            subject_id="web/alice",
            object_id="web/car",
            subject_label="Alice",
            object_label="Car",
            source_type_title="Person",
        ),
        LinkExampleRow(
            relation_base_url=relation_base,
            relation_version=2,
            link_entity_id="web/link-b",
            subject_id="web/company",
            object_id="web/building",
            subject_label="Acme",
            object_label="Headquarters",
            source_type_title="Organization",
        ),
    ]

    records = build_relation_records(_fixture_types(), examples, example_count=2)
    relation = next(record for record in records if str(record.base_url) == relation_base)

    assert relation.version == 2
    assert str(relation.versioned_url) == _url(relation_base, 2)
    card_input = relation.card_input
    assert card_input.title == "Owns"
    assert card_input.inverse is not None
    assert card_input.inverse.label == "Owned By"
    assert [phrase.label for phrase in card_input.ancestors] == ["Link"]
    assert [phrase.label for phrase in card_input.source_types] == ["Person"]
    assert [phrase.label for phrase in card_input.target_types] == ["Asset"]
    assert card_input.constraints.symmetric is None
    assert card_input.constraints.single_value is True
    assert card_input.constraints.direction == "source -> target"
    assert card_input.slug == "owns"
    assert {example.stratum_label for example in card_input.examples} == {
        "Organization",
        "Person",
    }


def test_examples_are_endpoint_deduplicated_and_bounded() -> None:
    relation_base = "https://example.com/@acme/types/entity-type/owns/"
    examples = [
        LinkExampleRow(
            relation_base_url=relation_base,
            relation_version=2,
            link_entity_id=f"web/link-{index}",
            subject_id="web/shared" if index < 2 else f"web/subject-{index}",
            object_id=f"web/object-{index}",
            subject_label=f"Subject {index}",
            object_label=f"Object {index}",
            source_type_title="Person" if index % 2 else "Organization",
        )
        for index in range(5)
    ]

    relation = next(
        record
        for record in build_relation_records(_fixture_types(), examples, example_count=3)
        if str(record.base_url) == relation_base
    )

    assert len(relation.examples) == 3
    endpoint_ids = [
        identifier
        for example in relation.examples
        for identifier in (example.subject_id, example.object_id)
    ]
    assert len(endpoint_ids) == len(set(endpoint_ids))


def test_historical_link_instances_do_not_populate_latest_card() -> None:
    relation_base = "https://example.com/@acme/types/entity-type/owns/"
    historical = LinkExampleRow(
        relation_base_url=relation_base,
        relation_version=1,
        link_entity_id="web/old-link",
        subject_id="web/alice",
        object_id="web/car",
        subject_label="Alice",
        object_label="Car",
        source_type_title="Person",
    )

    relation = next(
        record
        for record in build_relation_records(_fixture_types(), [historical], example_count=3)
        if str(record.base_url) == relation_base
    )
    assert relation.version == 2
    assert relation.examples == ()


def test_single_value_is_false_if_any_source_allows_multiple_targets() -> None:
    types = _fixture_types()
    relation_base = "https://example.com/@acme/types/entity-type/owns/"
    asset_base = "https://example.com/@acme/types/entity-type/asset/"
    types.append(
        _row(
            "https://example.com/@acme/types/entity-type/organization/",
            1,
            "Organization",
            links={
                _url(relation_base, 2): {
                    "items": {"oneOf": [{"$ref": _url(asset_base, 1)}]},
                    "maxItems": 2,
                }
            },
        )
    )

    records = build_relation_records(types, [], example_count=2)
    relation = next(record for record in records if str(record.base_url) == relation_base)
    generic_link = next(
        record for record in records if str(record.base_url) == LINK_ENTITY_TYPE_BASE_URL
    )

    assert relation.card_input.constraints.single_value is False
    assert generic_link.card_input.constraints.single_value is None


def test_unresolved_closed_reference_fails() -> None:
    types = _fixture_types()
    types.pop()  # Asset is still referenced by Person's resolved link map.

    with pytest.raises(UnresolvedTypeReferenceError, match="unavailable type"):
        build_relation_records(types, [], example_count=2)


def test_versioned_url_parser_rejects_non_versioned_url() -> None:
    assert versioned_url_base_url(HttpUrl("https://example.com/type/v/3")) == (
        "https://example.com/type/"
    )
    with pytest.raises(ValueError, match="versioned SemType URL"):
        versioned_url_base_url("https://example.com/type/")
