"""P2302 parsing unit tests (parse scope documented in properties.py)."""

from atlas_tools.wikidata.properties import Snak, Statement, parse_constraints


def _constraint(constraint_type: str, qualifiers: dict[str, list[str]] | None = None) -> Statement:
    statement = {
        "mainsnak": {
            "snaktype": "value",
            "datavalue": {
                "type": "wikibase-entityid",
                "value": {"entity-type": "item", "id": constraint_type},
            },
        }
    }
    if qualifiers:
        statement["qualifiers"] = {
            qualifier: [
                {"snaktype": "value", "datavalue": {"value": {"id": entity_id}}}
                for entity_id in ids
            ]
            for qualifier, ids in qualifiers.items()
        }
    return Statement.model_validate(statement)


def test_symmetric_and_transitive_parsed() -> None:
    constraints = parse_constraints([_constraint("Q21510862"), _constraint("Q18647515")])
    assert constraints.symmetric
    assert constraints.transitive
    assert not constraints.single_value
    assert not constraints.distinct_values


def test_uniqueness_constraints_parsed() -> None:
    constraints = parse_constraints([_constraint("Q19474404"), _constraint("Q21502410")])
    assert constraints.single_value
    assert constraints.distinct_values


def test_subject_and_value_type_classes_parsed_from_p2308() -> None:
    constraints = parse_constraints(
        [
            _constraint("Q21503250", {"P2308": ["Q571", "Q11424"]}),
            _constraint("Q21510865", {"P2308": ["Q5"]}),
        ]
    )
    assert constraints.subject_types == ("Q571", "Q11424")
    assert constraints.value_types == ("Q5",)


def test_inverse_constraint_parsed_from_p2306() -> None:
    constraints = parse_constraints([_constraint("Q21510855", {"P2306": ["P527"]})])
    assert constraints.inverse_pid == "P527"


def test_unknown_constraint_type_ignored_without_error() -> None:
    constraints = parse_constraints(
        [_constraint("Q99999999"), _constraint("Q21510862"), _constraint("Q99999999")]
    )
    assert constraints.symmetric
    assert constraints.ignored_types == ("Q99999999",)  # deduplicated


def test_novalue_snak_skipped() -> None:
    statement = Statement(mainsnak=Snak(snaktype="novalue"))
    assert parse_constraints([statement]) == parse_constraints([])
