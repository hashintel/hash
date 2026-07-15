"""Resolved SemType schema adaptation tests."""

import pytest
from pydantic import HttpUrl

from atlas_tools.relation_cards.common.cards import qualify_relation_id
from atlas_tools.relation_cards.hash.adapter import (
    LINK_ENTITY_TYPE_BASE_URL,
    UnresolvedTypeReferenceError,
    build_hash_lineage_nodes,
    build_relation_records,
    versioned_url_base_url,
)
from atlas_tools.relation_cards.hash.model import EntityTypeRow, LinkExampleRow

RELATION_BASE = "https://example.com/@acme/types/entity-type/owns/"
PERSON_BASE = "https://example.com/@acme/types/entity-type/person/"
ASSET_BASE = "https://example.com/@acme/types/entity-type/asset/"
ORGANIZATION_BASE = "https://example.com/@acme/types/entity-type/organization/"


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
    link_url = _url(LINK_ENTITY_TYPE_BASE_URL, 1)
    relation_v1_url = _url(RELATION_BASE, 1)
    mapping: dict[str, dict[str, object]] = {
        relation_v1_url: {
            "type": "array",
            "items": {"oneOf": [{"$ref": _url(ASSET_BASE, 1)}]},
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
            RELATION_BASE,
            1,
            "Owns (old)",
            ancestors=((link_url, 1),),
        ),
        _row(
            RELATION_BASE,
            2,
            "Owns",
            description="Possession from an owner to an asset.",
            inverse="Owned By",
            ancestors=((link_url, 1),),
        ),
        _row(PERSON_BASE, 1, "Old Person", links=mapping),
        _row(PERSON_BASE, 2, "Person", description="A human being.", links=mapping),
        _row(ASSET_BASE, 1, "Asset", description="Something that can be owned."),
    ]


def _example(
    suffix: str,
    *,
    subject_label: str,
    object_label: str,
    subject_id: str | None = None,
    object_id: str | None = None,
    direct_type: str = PERSON_BASE,
    type_closure: tuple[str, ...] | None = None,
    subject_frequency: int = 1,
    object_frequency: int = 1,
    relation_version: int = 2,
) -> LinkExampleRow:
    return LinkExampleRow(
        relation_base_url=RELATION_BASE,
        relation_version=relation_version,
        link_entity_id=f"web/link-{suffix}",
        subject_id=subject_id or f"web/subject-{suffix}",
        object_id=object_id or f"web/object-{suffix}",
        subject_label=subject_label,
        object_label=object_label,
        subject_direct_type_base_urls=(direct_type,),
        subject_type_base_urls=type_closure or (direct_type,),
        subject_frequency=subject_frequency,
        object_frequency=object_frequency,
    )


def test_latest_link_type_uses_resolved_sources_targets_and_ancestors() -> None:
    types = _fixture_types()
    types.append(
        _row(
            ORGANIZATION_BASE,
            1,
            "Organization",
            links={
                _url(RELATION_BASE, 2): {
                    "items": {"oneOf": [{"$ref": _url(ASSET_BASE, 1)}]},
                    "maxItems": 1,
                }
            },
        )
    )
    examples = [
        _example(
            "a",
            subject_label="Alice",
            object_label="Car",
        ),
        _example(
            "b",
            subject_label="Acme",
            object_label="Headquarters",
            direct_type=ORGANIZATION_BASE,
        ),
    ]

    records = build_relation_records(types, examples, example_count=2)
    relation = next(record for record in records if str(record.base_url) == RELATION_BASE)

    assert relation.version == 2
    assert str(relation.versioned_url) == _url(RELATION_BASE, 2)
    card_input = relation.card_input
    assert card_input.title == "Owns"
    assert card_input.inverse is not None
    assert card_input.inverse.label == "Owned By"
    assert [phrase.label for phrase in card_input.ancestors] == ["Link"]
    assert [phrase.label for phrase in card_input.source_types] == ["Organization", "Person"]
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
    examples = [
        _example(
            str(index),
            subject_id="web/shared" if index < 2 else None,
            subject_label="Shared" if index < 2 else f"Subject {index}",
            object_label=f"Object {index}",
            direct_type=f"https://example.com/types/entity-type/person-{index % 2}/",
            type_closure=(
                f"https://example.com/types/entity-type/person-{index % 2}/",
                PERSON_BASE,
            ),
        )
        for index in range(5)
    ]

    relation = next(
        record
        for record in build_relation_records(_fixture_types(), examples, example_count=3)
        if str(record.base_url) == RELATION_BASE
    )

    assert len(relation.examples) == 3
    endpoint_ids = [
        identifier
        for example in relation.examples
        for identifier in (example.subject_id, example.object_id)
    ]
    assert len(endpoint_ids) == len(set(endpoint_ids))

    reversed_relation = next(
        record
        for record in build_relation_records(
            _fixture_types(),
            list(reversed(examples)),
            example_count=3,
        )
        if str(record.base_url) == RELATION_BASE
    )
    assert reversed_relation.examples == relation.examples


def test_examples_use_frequency_ranking_and_normalized_label_identity() -> None:
    examples = [
        _example(
            "rare",
            subject_label="Purchase order",
            object_label="Nissei Corporation",
        ),
        _example(
            "recognizable",
            subject_label="  Purchase   order  ",
            object_label="  Nissei   Corporation  ",
            subject_frequency=20,
            object_frequency=30,
        ),
        _example(
            "other",
            subject_label="Other purchase order",
            object_label="Tanaka Kikinzoku Kogyo",
            subject_frequency=2,
            object_frequency=3,
        ),
    ]

    relation = next(
        record
        for record in build_relation_records(_fixture_types(), examples, example_count=3)
        if str(record.base_url) == RELATION_BASE
    )

    assert [example.object_label for example in relation.examples] == [
        "Nissei Corporation",
        "Tanaka Kikinzoku Kogyo",
    ]
    assert relation.examples[0].subject_label == "Purchase order"


def test_rendered_pair_alternates_survive_cross_web_endpoint_conflicts() -> None:
    examples = [
        _example(
            "leaf-middle-a",
            subject_id="web-a/leaf",
            object_id="web-a/middle",
            subject_label="Leaf",
            object_label="Middle",
        ),
        _example(
            "leaf-middle-b",
            subject_id="web-b/leaf",
            object_id="web-b/middle",
            subject_label="Leaf",
            object_label="Middle",
        ),
        _example(
            "middle-first-a",
            subject_id="web-a/middle",
            object_id="web-a/first",
            subject_label="Middle",
            object_label="First",
        ),
        _example(
            "middle-first-b",
            subject_id="web-b/middle",
            object_id="web-b/first",
            subject_label="Middle",
            object_label="First",
        ),
    ]

    relation = next(
        record
        for record in build_relation_records(_fixture_types(), examples, example_count=4)
        if str(record.base_url) == RELATION_BASE
    )

    assert {(example.subject_label, example.object_label) for example in relation.examples} == {
        ("Leaf", "Middle"),
        ("Middle", "First"),
    }


def test_examples_use_nearest_url_stratum_despite_title_collision() -> None:
    employee_base = "https://example.com/@acme/types/entity-type/employee/"
    types = _fixture_types()
    types.append(
        _row(
            employee_base,
            1,
            "Person",
            ancestors=((_url(PERSON_BASE, 2), 1),),
            links={
                _url(RELATION_BASE, 2): {
                    "items": {"oneOf": [{"$ref": _url(ASSET_BASE, 1)}]},
                    "maxItems": 1,
                }
            },
        )
    )
    example = _example(
        "employee",
        subject_label="Alice",
        object_label="Laptop",
        direct_type=employee_base,
        type_closure=(employee_base, PERSON_BASE),
    )

    relation = next(
        record
        for record in build_relation_records(types, [example], example_count=2)
        if str(record.base_url) == RELATION_BASE
    )

    assert str(relation.examples[0].source_type_base_url) == employee_base
    assert relation.examples[0].source_type_title == "Person"
    assert relation.example_selection.stratum_candidates == {employee_base: 1}


def test_unmatched_examples_are_guarded_with_all_strata_empty_fallback() -> None:
    valid = _example("valid", subject_label="Alice", object_label="Car")
    unmatched = _example(
        "unmatched",
        subject_label="Unexpected source",
        object_label="Asset",
        direct_type=ASSET_BASE,
    )

    guarded = next(
        record
        for record in build_relation_records(_fixture_types(), [valid, unmatched], example_count=2)
        if str(record.base_url) == RELATION_BASE
    )
    assert [example.subject_label for example in guarded.examples] == ["Alice"]
    assert guarded.example_selection.unmatched_candidates == 1
    assert not guarded.example_selection.unmatched_used

    fallback = next(
        record
        for record in build_relation_records(_fixture_types(), [unmatched], example_count=2)
        if str(record.base_url) == RELATION_BASE
    )
    assert [example.subject_label for example in fallback.examples] == ["Unexpected source"]
    assert fallback.examples[0].source_type_title is None
    assert fallback.example_selection.unmatched_used


def test_historical_link_instances_do_not_populate_latest_card() -> None:
    historical = _example(
        "old",
        subject_label="Alice",
        object_label="Car",
        relation_version=1,
    )

    relation = next(
        record
        for record in build_relation_records(_fixture_types(), [historical], example_count=3)
        if str(record.base_url) == RELATION_BASE
    )
    assert relation.version == 2
    assert relation.examples == ()


def test_single_value_is_false_if_any_source_allows_multiple_targets() -> None:
    types = _fixture_types()
    types.append(
        _row(
            ORGANIZATION_BASE,
            1,
            "Organization",
            links={
                _url(RELATION_BASE, 2): {
                    "items": {"oneOf": [{"$ref": _url(ASSET_BASE, 1)}]},
                    "maxItems": 2,
                }
            },
        )
    )

    records = build_relation_records(types, [], example_count=2)
    relation = next(record for record in records if str(record.base_url) == RELATION_BASE)
    generic_link = next(
        record for record in records if str(record.base_url) == LINK_ENTITY_TYPE_BASE_URL
    )

    assert relation.card_input.constraints.single_value is False
    assert generic_link.card_input.constraints.single_value is None


def test_lineage_uses_depth_one_ids_and_closes_over_dependency_nodes() -> None:
    parent_base = "https://example.com/@acme/types/entity-type/parent/"
    dependency_base = "https://example.com/@acme/types/entity-type/dependency/"
    child_base = "https://example.com/@acme/types/entity-type/child/"
    link_url = _url(LINK_ENTITY_TYPE_BASE_URL, 1)
    parent_url = _url(parent_base, 3)
    dependency_url = _url(dependency_base, 2)
    types = [
        _row(LINK_ENTITY_TYPE_BASE_URL, 1, "Link"),
        _row(dependency_base, 2, "Dependency"),
        _row(parent_base, 3, "Parent", ancestors=((link_url, 1),)),
        _row(
            child_base,
            4,
            "Child",
            ancestors=((parent_url, 1), (dependency_url, 1), (link_url, 2)),
        ),
    ]

    records = build_relation_records(types, [], example_count=2)
    nodes = {node.relation_id: node for node in build_hash_lineage_nodes(types)}
    link_id = qualify_relation_id("hash", LINK_ENTITY_TYPE_BASE_URL)
    parent_id = qualify_relation_id("hash", parent_base)
    dependency_id = qualify_relation_id("hash", dependency_base)
    child_id = qualify_relation_id("hash", child_base)

    assert dependency_base not in {str(record.base_url) for record in records}
    assert nodes[child_id].extends == tuple(sorted((dependency_id, parent_id)))
    assert link_id not in nodes[child_id].extends
    assert nodes[parent_id].extends == (link_id,)
    assert nodes[dependency_id].extends == ()
    assert nodes[link_id].extends == ()
    assert all(node.inverse_edges == () for node in nodes.values())


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
