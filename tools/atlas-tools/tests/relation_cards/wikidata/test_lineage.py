"""Wikidata direct-fact persistence and source-lineage publication tests."""

import json
import shutil
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

import pytest
from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.common.progress import NO_PROGRESS
from atlas_tools.common.provenance import canonical_json_bytes, sha256_file
from atlas_tools.relation.lineage.api import (
    WIKIDATA_INVERSE_EDGE_KIND,
    VerifiedSourceLineage,
    verify_source_lineage,
)
from atlas_tools.relation_cards.common.cards import qualify_relation_id
from atlas_tools.relation_cards.wikidata.cards import (
    ExtractPaths,
    _lineage_nodes,
    emit_cards,
)
from atlas_tools.wikidata.cli import RenderCardsCommand
from atlas_tools.wikidata.config import Config, ExtractionConfig
from atlas_tools.wikidata.model import Pid, PropertyLineage, PropertyRecord
from atlas_tools.wikidata.properties import (
    EntityDocument,
    EntityIdValue,
    Snak,
    SnakDataValue,
    Statement,
    _collect_entity_metadata,
    _PropertyDocuments,
    extract_properties,
    merge_closed_ancestors,
    parse_property_document,
)
from atlas_tools.wikidata.records import RECORDS_FORMAT_VERSION, load_records
from atlas_tools.wikidata.taxonomy import Taxonomy
from atlas_tools.wikidata.transport import FixtureTransport, Response
from tests.wikidata.conftest import CONFIG_PATH, RESPONSES, TAXONOMY_PATH

EN = LanguageAlpha2("en")


@dataclass(frozen=True)
class _Artifact:
    paths: ExtractPaths
    lineage: VerifiedSourceLineage


@pytest.fixture(scope="module")
def artifact(tmp_path_factory: pytest.TempPathFactory) -> _Artifact:
    config = Config.load(CONFIG_PATH)
    result = extract_properties(
        config,
        FixtureTransport(RESPONSES),
        taxonomy=Taxonomy.load(TAXONOMY_PATH),
    )
    out_dir = tmp_path_factory.mktemp("wikidata-lineage")
    paths = emit_cards(result, config, out_dir)
    return _Artifact(paths=paths, lineage=verify_source_lineage(out_dir))


def _value_snak(entity_id: str) -> Snak:
    return Snak(
        snaktype="value",
        datavalue=SnakDataValue(value=EntityIdValue(id=entity_id)),
    )


def _property_document(
    pid: str,
    *,
    direct_ancestors: tuple[str, ...] = (),
    p1696_inverse_pids: tuple[str, ...] = (),
    p2306_fallback: str | None = None,
) -> EntityDocument:
    claims: dict[str, list[Statement]] = {}
    if direct_ancestors:
        claims["P1647"] = [Statement(mainsnak=_value_snak(value)) for value in direct_ancestors]
    if p1696_inverse_pids:
        claims["P1696"] = [Statement(mainsnak=_value_snak(value)) for value in p1696_inverse_pids]
    if p2306_fallback is not None:
        claims["P2302"] = [
            Statement(
                mainsnak=_value_snak("Q21510855"),
                qualifiers={"P2306": [_value_snak(p2306_fallback)]},
            )
        ]
    return EntityDocument(id=Pid(pid), datatype="wikibase-item", claims=claims)


class _DependencyTransport:
    def __init__(self, documents: Mapping[str, EntityDocument]) -> None:
        self._documents = dict(documents)
        self.requested: list[tuple[str, ...]] = []

    def get(self, url: str, params: Mapping[str, str] | None = None) -> Response:
        if not url:
            raise AssertionError("wbgetentities URL is required")
        if params is None:
            raise AssertionError("wbgetentities parameters are required")
        entity_ids = tuple(params["ids"].split("|"))
        self.requested.append(entity_ids)
        entities = {
            entity_id: self._documents[entity_id].model_dump(mode="json")
            for entity_id in entity_ids
        }
        return Response(status=200, body=canonical_json_bytes({"entities": entities}))


def test_records_v4_persist_direct_facts_and_dependency_only_nodes(artifact: _Artifact) -> None:
    record_set = load_records(artifact.paths.records.records_jsonl.parent)
    assert RECORDS_FORMAT_VERSION == 4
    assert record_set.meta.details.records_format_version == 4
    assert record_set.meta.details.counts.lineage_nodes == len(record_set.lineage)

    p50 = next(record for record in record_set.records if record.pid == "P50")
    assert p50.direct_ancestors == ("P9005",)
    assert p50.ancestors == ("P9005", "P9006")

    direct_facts = {node.pid: node for node in record_set.lineage}
    assert direct_facts[Pid("P50")].direct_ancestors == ("P9005",)
    assert direct_facts[Pid("P9005")].direct_ancestors == ("P9006",)
    assert direct_facts[Pid("P9006")] == PropertyLineage(pid=Pid("P9006"))

    hashes = record_set.meta.details.content_hashes
    assert set(hashes) == {
        "entity_labels.json",
        "lineage-records.jsonl",
        "records.jsonl",
    }
    assert hashes["records.jsonl"] == sha256_file(artifact.paths.records.records_jsonl)
    assert hashes["lineage-records.jsonl"] == sha256_file(artifact.paths.records.lineage_records)

    lines = artifact.paths.records.lineage_records.read_text(encoding="utf-8").splitlines()
    rows = [json.loads(line) for line in lines]
    assert [row["pid"] for row in rows] == sorted(row["pid"] for row in rows)
    assert all(list(row) == sorted(row) for row in rows)


def test_source_lineage_uses_only_direct_p1647_and_exact_p1696(artifact: _Artifact) -> None:
    paths = artifact.paths.cards
    assert paths.lineage_jsonl == artifact.lineage.lineage_path
    assert paths.lineage_manifest == artifact.lineage.manifest_path

    nodes = {node.relation_id: node for node in artifact.lineage.nodes}
    p50 = qualify_relation_id("wikidata", "P50")
    p361 = qualify_relation_id("wikidata", "P361")
    p527 = qualify_relation_id("wikidata", "P527")
    p9005 = qualify_relation_id("wikidata", "P9005")
    p9006 = qualify_relation_id("wikidata", "P9006")

    assert nodes[p50].extends == (p9005,)
    assert p9006 not in nodes[p50].extends
    assert nodes[p9005].extends == (p9006,)
    assert [(edge.kind, edge.relation_id) for edge in nodes[p361].inverse_edges] == [
        (WIKIDATA_INVERSE_EDGE_KIND, p527)
    ]
    assert [(edge.kind, edge.relation_id) for edge in nodes[p527].inverse_edges] == [
        (WIKIDATA_INVERSE_EDGE_KIND, p361)
    ]

    manifest = artifact.lineage.manifest
    card_manifest = json.loads(paths.manifest.read_text(encoding="utf-8"))
    assert card_manifest["details"]["snapshot"] == {
        "kind": "wikidata-api-snapshot-date",
        "value": "2025-06-01",
    }
    assert manifest.details.snapshot.model_dump(mode="json") == card_manifest["details"]["snapshot"]
    assert manifest.details.edge_policy.inverse_edge_kinds == (WIKIDATA_INVERSE_EDGE_KIND,)
    assert manifest.input_hashes is not None
    assert manifest.input_hashes["records.jsonl"] == sha256_file(
        artifact.paths.records.records_jsonl
    )
    assert manifest.input_hashes["lineage-records.jsonl"] == sha256_file(
        artifact.paths.records.lineage_records
    )
    assert manifest.input_hashes["cards.jsonl"] == sha256_file(paths.cards_jsonl)
    assert manifest.input_hashes["cards.manifest.json"] == sha256_file(paths.manifest)
    assert manifest.details.leaf_card_artifact.cards_hash == sha256_file(paths.cards_jsonl)
    assert manifest.details.leaf_card_artifact.manifest_hash == sha256_file(paths.manifest)

    relation_ids = [node.relation_id for node in artifact.lineage.nodes]
    assert relation_ids == sorted(relation_ids)


def test_p2302_fallback_never_becomes_a_schema_v1_inverse_edge() -> None:
    explicit = parse_property_document(
        _property_document(
            "P1",
            p1696_inverse_pids=("P20", "P2"),
            p2306_fallback="P3",
        ),
        (EN,),
    )
    fallback_only = parse_property_document(
        _property_document("P4", p2306_fallback="P3"),
        (EN,),
    )
    assert explicit.inverse_pid == "P20"
    assert explicit.p1696_inverse_pids == ("P2", "P20")
    assert explicit.constraints.inverse_pid == "P3"
    assert fallback_only.inverse_pid == "P3"
    assert fallback_only.p1696_inverse_pids == ()

    nodes = _lineage_nodes(
        (
            PropertyLineage(pid=Pid("P1"), p1696_inverse_pids=explicit.p1696_inverse_pids),
            PropertyLineage(pid=Pid("P2")),
            PropertyLineage(pid=Pid("P20")),
            PropertyLineage(pid=Pid("P3")),
            PropertyLineage(
                pid=Pid("P4"),
                p1696_inverse_pids=fallback_only.p1696_inverse_pids,
            ),
        )
    )
    by_id = {node.relation_id: node for node in nodes}
    assert [edge.relation_id for edge in by_id["wikidata:P1"].inverse_edges] == [
        "wikidata:P2",
        "wikidata:P20",
    ]
    assert by_id["wikidata:P4"].inverse_edges == ()


def test_direct_property_facts_are_sorted_and_kept_separate_from_card_closure() -> None:
    record = parse_property_document(
        _property_document("P5", direct_ancestors=("P2", "P10")),
        (EN,),
    )
    assert record.direct_ancestors == ("P10", "P2")
    assert record.ancestors == ("P2", "P10")

    record.ancestors = merge_closed_ancestors(
        record,
        {Pid("P5"): (Pid("P20"), Pid("P10"), Pid("P2"))},
    )
    assert record.direct_ancestors == ("P10", "P2")
    assert record.ancestors == ("P2", "P10", "P20")


def test_dependency_only_documents_keep_their_own_direct_facts() -> None:
    root = PropertyRecord(
        pid=Pid("P1"),
        datatype="wikibase-item",
        direct_ancestors=(Pid("P3"),),
        ancestors=(Pid("P2"), Pid("P3")),
    )
    properties = _PropertyDocuments(records=[root], by_pid={Pid("P1"): root})
    transport = _DependencyTransport(
        {
            # P2 is requested initially only because the card's transitive
            # ancestor display references it. P3 then identifies it as a
            # direct lineage dependency, so its already-fetched facts must
            # remain available without a second P2 request.
            "P2": _property_document(
                "P2",
                direct_ancestors=("P4",),
                p1696_inverse_pids=("P5",),
            ),
            "P3": _property_document("P3", direct_ancestors=("P2",)),
            "P4": _property_document("P4"),
            "P5": _property_document("P5"),
        }
    )

    metadata = _collect_entity_metadata(
        properties,
        ExtractionConfig(languages=(EN,)),
        transport,
        NO_PROGRESS,
    )
    facts = {node.pid: node for node in metadata.lineage}
    assert tuple(facts) == ("P1", "P2", "P3", "P4", "P5")
    assert facts[Pid("P2")].direct_ancestors == ("P4",)
    assert facts[Pid("P2")].p1696_inverse_pids == ("P5",)
    assert facts[Pid("P3")].direct_ancestors == ("P2",)
    assert transport.requested == [("P2", "P3"), ("P4", "P5")]


def test_load_records_rejects_direct_fact_hash_drift(
    artifact: _Artifact,
    tmp_path: Path,
) -> None:
    copied = tmp_path / "records"
    shutil.copytree(artifact.paths.records.records_jsonl.parent, copied)
    lineage_path = copied / "lineage-records.jsonl"
    lineage_path.write_bytes(lineage_path.read_bytes() + b" ")

    with pytest.raises(ValueError, match=r"content hash mismatch: lineage-records.jsonl"):
        load_records(copied)


def test_render_cards_cli_reports_card_and_lineage_manifests(
    artifact: _Artifact,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    command = RenderCardsCommand(
        records=artifact.paths.records.records_jsonl.parent,
        config=CONFIG_PATH,
        out=tmp_path / "rendered",
    )
    command.cli_cmd()

    output = capsys.readouterr().out
    assert str(tmp_path / "rendered" / "cards.jsonl") in output
    assert str(tmp_path / "rendered" / "cards.manifest.json") in output
    assert str(tmp_path / "rendered" / "lineage.jsonl") in output
    assert str(tmp_path / "rendered" / "lineage.manifest.json") in output
