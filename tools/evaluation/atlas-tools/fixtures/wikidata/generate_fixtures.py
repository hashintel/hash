"""Generate the committed Wikidata miner fixtures (deterministic).

Run from the atlas-tools root:

    uv run --no-sync python fixtures/wikidata/generate_fixtures.py

Outputs (all committed):

- ``dump_excerpt.jsondump`` — 200 synthetic entities in exact Wikidata JSON dump
  (the extension is deliberately NOT ``.json``: the dump format is
  line-oriented and editor/CI JSON formatters must never reflow it)
  line format ("[", one entity per line with trailing comma, "]"). Entities
  span 10 P31 classes with skewed sizes, en/de (and occasional fr) labels,
  sitelinks, and claims using P361, P50, P212 (external-id) and P527.
- ``responses/`` — fixture HTTP responses (SPARQL inventory, wbgetentities
  batches, example queries) plus ``index.json`` keyed by
  ``transport.request_key`` so ``FixtureTransport`` stays in sync with the
  real query builders by construction.

Every rule below is pure arithmetic on the entity index — no RNG is needed,
which makes expectations hand-computable in tests.

Entity rules (index i in 0..199, qid = Q<9000+i>):
- class: consecutive blocks per ``CLASSES`` below.
- secondary P31 "Q99999999" when i % 10 == 5.
- labels: en always ("<ClassName> <i:03d>"); de when i % 3 != 0; fr when
  i % 7 == 0 ("Entité <i:03d>").
- sitelinks: i % 7 entries.
- claims: P361 when i % 5 == 0; P527 when i % 11 == 0; books additionally
  carry P50 (author) and a P212 external-id claim.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.properties import chunk_ids, wbgetentities_params
from atlas_tools.wikidata.sparql import (
    example_pairs_query,
    property_ancestors_query,
    property_inventory_query,
    sparql_params,
)
from atlas_tools.wikidata.taxonomy import write_taxonomy_parquet
from atlas_tools.wikidata.transport import request_key

HERE = Path(__file__).parent
FIXTURE_DATE = "2025-06-01T00:00:00+00:00"

# (class QID, en name, de name, count) — skewed sizes summing to 200.
CLASSES = [
    ("Q5", "Person", "Person", 80),
    ("Q4830453", "Company", "Unternehmen", 40),
    ("Q515", "City", "Stadt", 25),
    ("Q571", "Book", "Buch", 20),
    ("Q11424", "Film", "Film", 12),
    ("Q3305213", "Painting", "Gemälde", 8),
    ("Q7889", "Game", "Spiel", 6),
    ("Q34770", "Language", "Sprache", 4),
    ("Q16521", "Taxon", "Taxon", 3),
    ("Q23397", "Lake", "See", 2),
]

WIKIBASE_ITEM = "http://wikiba.se/ontology#WikibaseItem"
EXTERNAL_ID = "http://wikiba.se/ontology#ExternalId"


def _item_snak(prop: str, qid: str) -> dict:
    return {
        "mainsnak": {
            "snaktype": "value",
            "property": prop,
            "datavalue": {
                "type": "wikibase-entityid",
                "value": {"entity-type": "item", "id": qid},
            },
        },
        "type": "statement",
        "rank": "normal",
    }


def _string_snak(prop: str, value: str) -> dict:
    return {
        "mainsnak": {
            "snaktype": "value",
            "property": prop,
            "datavalue": {"type": "string", "value": value},
        },
        "type": "statement",
        "rank": "normal",
    }


def class_for_index(i: int) -> tuple[str, str, str]:
    offset = 0
    for qid, en, de, count in CLASSES:
        if i < offset + count:
            return qid, en, de
        offset += count
    raise ValueError(i)


def build_entity(i: int) -> dict:
    qid = f"Q{9000 + i}"
    cls, en_name, de_name = class_for_index(i)

    labels = {"en": {"language": "en", "value": f"{en_name} {i:03d}"}}
    if i % 3 != 0:
        labels["de"] = {"language": "de", "value": f"{de_name} {i:03d}"}
    if i % 7 == 0:
        labels["fr"] = {"language": "fr", "value": f"Entité {i:03d}"}

    claims: dict[str, list[dict]] = {"P31": [_item_snak("P31", cls)]}
    if i % 10 == 5:
        claims["P31"].append(_item_snak("P31", "Q99999999"))
    if i % 5 == 0:
        claims["P361"] = [_item_snak("P361", f"Q{9000 + (i + 50) % 200}")]
    if i % 11 == 0:
        claims["P527"] = [_item_snak("P527", f"Q{9000 + (i + 3) % 200}")]
    if cls == "Q571":  # books get an author and an external identifier
        claims["P50"] = [_item_snak("P50", f"Q{9000 + i % 80}")]
        claims["P212"] = [_string_snak("P212", f"978-3-16-{i:06d}-0")]

    sitelinks = {
        f"site{j}wiki": {"site": f"site{j}wiki", "title": labels["en"]["value"]}
        for j in range(i % 7)
    }

    entity = {"type": "item", "id": qid, "labels": labels, "claims": claims}
    if i % 2 == 0:
        entity["descriptions"] = {
            "en": {"language": "en", "value": f"synthetic {en_name.lower()} entity"}
        }
    if sitelinks:
        entity["sitelinks"] = sitelinks
    return entity


def write_dump_excerpt() -> None:
    lines = ["[\n"]
    for i in range(200):
        entity_json = json.dumps(build_entity(i), ensure_ascii=False, sort_keys=True)
        suffix = ",\n" if i < 199 else "\n"
        lines.append(entity_json + suffix)
    lines.append("]\n")
    (HERE / "dump_excerpt.jsondump").write_text("".join(lines), encoding="utf-8")


# --- fixture HTTP responses --------------------------------------------------

INVENTORY_ROWS = [
    # (pid, datatype URI, usage) — response order mimics ORDER BY ?property.
    ("P212", EXTERNAL_ID, 900000),
    ("P361", WIKIBASE_ITEM, 500000),
    ("P50", WIKIBASE_ITEM, 300000),
    ("P527", WIKIBASE_ITEM, 200000),
    ("P9001", WIKIBASE_ITEM, 50),
    ("P9002", WIKIBASE_ITEM, 20),
    ("P9003", WIKIBASE_ITEM, 10),
    ("P9004", WIKIBASE_ITEM, 5),
    ("P9005", WIKIBASE_ITEM, 15),
]


def _label(lang: str, value: str) -> dict:
    return {"language": lang, "value": value}


def _constraint(
    constraint_type: str, qualifiers: dict[str, list[str]] | None = None
) -> dict:
    statement = {
        "mainsnak": {
            "snaktype": "value",
            "property": "P2302",
            "datavalue": {
                "type": "wikibase-entityid",
                "value": {"entity-type": "item", "id": constraint_type},
            },
        },
        "type": "statement",
        "rank": "normal",
    }
    if qualifiers:
        statement["qualifiers"] = {
            prop: [
                {
                    "snaktype": "value",
                    "property": prop,
                    "datavalue": {
                        "type": "wikibase-entityid",
                        "value": {"id": entity_id},
                    },
                }
                for entity_id in entity_ids
            ]
            for prop, entity_ids in qualifiers.items()
        }
    return statement


def _property_snak(prop: str, pid: str) -> dict:
    return {
        "mainsnak": {
            "snaktype": "value",
            "property": prop,
            "datavalue": {
                "type": "wikibase-entityid",
                "value": {"entity-type": "property", "id": pid},
            },
        },
        "type": "statement",
        "rank": "normal",
    }


PROPERTY_DOCS = {
    "P50": {
        "id": "P50",
        "type": "property",
        "datatype": "wikibase-item",
        "labels": {"en": _label("en", "author"), "de": _label("de", "Autor")},
        "descriptions": {
            "en": _label("en", "main creator(s) of a written work"),
            "de": _label("de", "Hauptverfasser eines schriftlichen Werks"),
        },
        "aliases": {"en": [_label("en", "writer"), _label("en", "authored by")]},
        "claims": {
            "P1647": [_property_snak("P1647", "P9005")],
            "P2302": [
                _constraint("Q21503250", {"P2308": ["Q571"]}),
                _constraint("Q21510865", {"P2308": ["Q5"]}),
            ],
        },
    },
    "P361": {
        "id": "P361",
        "type": "property",
        "datatype": "wikibase-item",
        "labels": {"en": _label("en", "part of"), "de": _label("de", "ist Teil von")},
        "descriptions": {
            "en": _label("en", "this item is a part of that item"),
            "de": _label("de", "dieses Objekt ist Teil jenes Objekts"),
        },
        "aliases": {
            "en": [_label("en", "contained within"), _label("en", "component of")]
        },
        # TWO subject-type constraint classes -> the example selector
        # stratifies P361 into settlement + written-work strata; the
        # film-typed pairs match neither and land in `other`.
        "claims": {
            "P1696": [_property_snak("P1696", "P527")],
            "P2302": [
                _constraint("Q18647515"),
                _constraint("Q21510855", {"P2306": ["P527"]}),
                _constraint("Q21503250", {"P2308": ["Q486972", "Q47461344"]}),
                _constraint("Q21510865", {"P2308": ["Q35120"]}),
            ],
        },
    },
    "P527": {
        "id": "P527",
        "type": "property",
        "datatype": "wikibase-item",
        "labels": {"en": _label("en", "has part"), "de": _label("de", "besteht aus")},
        "descriptions": {"en": _label("en", "this item has the listed part")},
        "aliases": {"en": [_label("en", "contains"), _label("en", "assembled from")]},
        "claims": {
            "P1696": [_property_snak("P1696", "P361")],
            "P2302": [_constraint("Q18647515")],
        },
    },
    "P9001": {
        "id": "P9001",
        "type": "property",
        "datatype": "wikibase-item",
        "labels": {"en": _label("en", "affiliated with")},
        "descriptions": {
            "en": _label("en", "synthetic symmetric affiliation between organizations")
        },
        "claims": {"P2302": [_constraint("Q21510862")]},
    },
    "P9002": {
        "id": "P9002",
        "type": "property",
        "datatype": "wikibase-item",
        "labels": {"en": _label("en", "sponsors")},
        "descriptions": {"en": _label("en", "synthetic sponsorship relation")},
        # Q99999999 is an unknown constraint type: parsed as ignored.
        "claims": {"P2302": [_constraint("Q21502410"), _constraint("Q99999999")]},
    },
    "P9003": {
        "id": "P9003",
        "type": "property",
        "datatype": "wikibase-item",
        "labels": {"en": _label("en", "old linkage")},
        "descriptions": {"en": _label("en", "deprecated synthetic property")},
        "claims": {"P31": [_item_snak("P31", "Q18644427")]},
    },
    "P9004": {
        "id": "P9004",
        "type": "property",
        "datatype": "wikibase-item",
        "labels": {"en": _label("en", "Wikimedia list linkage")},
        "descriptions": {
            "en": _label("en", "Wikimedia-maintenance synthetic property")
        },
        "claims": {"P31": [_item_snak("P31", "Q18644435")]},
    },
    "P9005": {
        "id": "P9005",
        "type": "property",
        "datatype": "wikibase-item",
        "labels": {"en": _label("en", "creative contributor")},
        "descriptions": {
            "en": _label(
                "en", "synthetic ancestor property for creative contribution relations"
            )
        },
        # Direct parent P9006 -> P50's CLOSED ancestor set gains a
        # grandparent (depth-2 P1647 chain).
        "claims": {"P1647": [_property_snak("P1647", "P9006")]},
    },
}

# P1647 closure pairs served by the ancestors query fixture. P9006 is NOT a
# retained property (absent from the inventory), so its card label must be
# resolved through the wbgetentities label batch.
ANCESTOR_CLOSURE_PAIRS = [
    ("P50", "P9005"),
    ("P50", "P9006"),
    ("P9005", "P9006"),
]

ITEM_DOCS = {
    # A non-retained ancestor property: labels come from this batch.
    "P9006": {
        "id": "P9006",
        "labels": {"en": _label("en", "abstract involvement")},
        "descriptions": {
            "en": _label(
                "en", "synthetic grandparent property for involvement relations"
            )
        },
    },
    "Q5": {
        "id": "Q5",
        "labels": {"en": _label("en", "human")},
        "descriptions": {"en": _label("en", "any member of Homo sapiens")},
    },
    "Q571": {
        "id": "Q571",
        "labels": {"en": _label("en", "book")},
        "descriptions": {
            "en": _label(
                "en",
                "written medium of text bound as pages. Includes physical and"
                " digital volumes.",
            )
        },
    },
    "Q35120": {
        "id": "Q35120",
        "labels": {"en": _label("en", "entity")},
        "descriptions": {
            "en": _label(
                "en",
                "anything that can be considered, discussed, or observed. The"
                " root class of the ontology.",
            )
        },
    },
    "Q486972": {
        "id": "Q486972",
        "labels": {"en": _label("en", "human settlement")},
        "descriptions": {
            "en": _label("en", "community of people living in a particular place")
        },
    },
    "Q47461344": {
        "id": "Q47461344",
        "labels": {"en": _label("en", "written work")},
        "descriptions": {"en": _label("en", "any work expressed in writing")},
    },
}


# One example-pool row: entity QIDs, labels, subject P31 (or ""), and the
# sitelink counts that drive recognizability weighting. A shared entity
# always reuses the same QID + sitelink count across pairs and properties
# (a consistent synthetic snapshot); sitelinks of 0 OMIT the binding to
# exercise the parser's OPTIONAL path.
@dataclass(frozen=True)
class ExamplePair:
    subject_qid: str
    subject_label: str
    subject_sitelinks: int
    object_qid: str
    object_label: str
    object_sitelinks: int
    subject_type: str = ""


EXAMPLE_PAIRS = {
    # P361 subjects stratify as: city rows -> human settlement (Q486972),
    # book rows -> written work (Q47461344), film rows -> `other`
    # (Q11424 is under neither), untyped rows -> dropped. Sitelink weights
    # make the settlement head (Left Bank -> Paris) deterministic, and the
    # second Paris pair exercises endpoint dedup within a stratum.
    "P361": [
        ExamplePair("Q9001001", "Left Bank", 40, "Q9001002", "Paris", 300, "Q515"),
        ExamplePair("Q9001003", "Old Town", 15, "Q9001004", "Prague", 250, "Q515"),
        ExamplePair("Q9001005", "Montmartre", 25, "Q9001002", "Paris", 300, "Q515"),
        ExamplePair(
            "Q9001010", "Chapter One", 2, "Q9001011", "Synthetic Novel", 8, "Q571"
        ),
        ExamplePair("Q9001012", "Appendix", 1, "Q9001013", "Field Guide", 5, "Q571"),
        ExamplePair(
            "Q9001020", "Opening Scene", 3, "Q9001021", "Synthetic Film", 12, "Q11424"
        ),
        ExamplePair("Q9001022", "Finale", 2, "Q9001023", "Concert Film", 9, "Q11424"),
        ExamplePair("Q9001030", "Engine", 4, "Q9001031", "Car", 60),
        ExamplePair("Q9001032", "Wheel", 2, "Q9001033", "Bicycle", 30),
    ],
    # P50 constrains subjects to Q571 (book): the film rows and the
    # Q5-typed row land in `other` (never on the card while the book
    # stratum is non-empty), the untyped row is dropped (the P6-style
    # reversed-statement scenario).
    "P50": [
        ExamplePair(
            "Q9001011", "Synthetic Novel", 8, "Q9002001", "Person 001", 5, "Q571"
        ),
        ExamplePair("Q9001013", "Field Guide", 5, "Q9002002", "Person 002", 2, "Q571"),
        ExamplePair(
            "Q9001021", "Synthetic Film", 12, "Q9002003", "Person 003", 7, "Q11424"
        ),
        ExamplePair(
            "Q9001023", "Concert Film", 9, "Q9002004", "Person 004", 1, "Q11424"
        ),
        ExamplePair(
            "Q9001014", "Poem Collection", 3, "Q9002005", "Person 005", 0, "Q571"
        ),
        ExamplePair(
            "Q9001015", "Essay Anthology", 2, "Q9002006", "Person 006", 0, "Q571"
        ),
        ExamplePair("Q9001016", "Anonymous Manuscript", 0, "Q9002007", "Person 007", 0),
        ExamplePair("Q9002008", "Some Human", 30, "Q9002009", "Person 008", 1, "Q5"),
    ],
    # P527 has no subject-type constraints: one unstratified pool, untyped
    # rows included. The two Paris-subject pairs exercise endpoint dedup on
    # an unstratified card (exactly one survives), leaving a deterministic
    # 4-of-5 selection at example_count=4.
    "P527": [
        ExamplePair("Q9001002", "Paris", 300, "Q9001001", "Left Bank", 40, "Q515"),
        ExamplePair("Q9001002", "Paris", 300, "Q9001005", "Montmartre", 25, "Q515"),
        ExamplePair("Q9001004", "Prague", 250, "Q9001003", "Old Town", 15, "Q515"),
        ExamplePair(
            "Q9001011", "Synthetic Novel", 8, "Q9001010", "Chapter One", 2, "Q571"
        ),
        ExamplePair("Q9001031", "Car", 60, "Q9001030", "Engine", 4),
    ],
    "P9001": [
        ExamplePair(
            "Q9003001", "Company 081", 3, "Q9003002", "Company 082", 2, "Q4830453"
        ),
        ExamplePair(
            "Q9003003", "Company 083", 1, "Q9003004", "Company 084", 1, "Q4830453"
        ),
        ExamplePair("Q9002001", "Person 001", 5, "Q9003005", "Company 085", 0, "Q5"),
        ExamplePair("Q9002002", "Person 002", 2, "Q9003006", "Company 086", 0, "Q5"),
    ],
    "P9005": [
        ExamplePair(
            "Q9001011", "Synthetic Novel", 8, "Q9002001", "Person 001", 5, "Q571"
        ),
        ExamplePair(
            "Q9001021", "Synthetic Film", 12, "Q9002003", "Person 003", 7, "Q11424"
        ),
        ExamplePair(
            "Q9001014", "Poem Collection", 3, "Q9002005", "Person 005", 0, "Q571"
        ),
    ],
}


def sparql_results(bindings: list[dict]) -> dict:
    return {"head": {"vars": []}, "results": {"bindings": bindings}}


def inventory_response() -> dict:
    bindings = []
    for pid, datatype_uri, usage in INVENTORY_ROWS:
        bindings.append(
            {
                "property": {
                    "type": "uri",
                    "value": f"http://www.wikidata.org/entity/{pid}",
                },
                "propertyType": {"type": "uri", "value": datatype_uri},
                "usage": {"type": "literal", "value": str(usage)},
            }
        )
    return sparql_results(bindings)


def ancestors_response() -> dict:
    bindings = []
    for property_pid, ancestor_pid in ANCESTOR_CLOSURE_PAIRS:
        bindings.append(
            {
                "property": {
                    "type": "uri",
                    "value": f"http://www.wikidata.org/entity/{property_pid}",
                },
                "ancestor": {
                    "type": "uri",
                    "value": f"http://www.wikidata.org/entity/{ancestor_pid}",
                },
            }
        )
    return sparql_results(bindings)


def example_response(pid: str) -> dict:
    bindings = []
    for pair in EXAMPLE_PAIRS[pid]:
        binding = {
            "subject": {
                "type": "uri",
                "value": f"http://www.wikidata.org/entity/{pair.subject_qid}",
            },
            "object": {
                "type": "uri",
                "value": f"http://www.wikidata.org/entity/{pair.object_qid}",
            },
            "subjectLabel": {"type": "literal", "value": pair.subject_label},
            "objectLabel": {"type": "literal", "value": pair.object_label},
        }
        if pair.subject_type:
            binding["subjectType"] = {
                "type": "uri",
                "value": f"http://www.wikidata.org/entity/{pair.subject_type}",
            }
        # Zero sitelinks omit the binding (the OPTIONAL-absent path).
        for name, count in (
            ("subjectSitelinks", pair.subject_sitelinks),
            ("objectSitelinks", pair.object_sitelinks),
        ):
            if count:
                binding[name] = {"type": "literal", "value": str(count)}
        bindings.append(binding)
    return sparql_results(bindings)


TIMEOUT_BODY = {"error": "java.util.concurrent.TimeoutException: query timed out"}
QLEVER_FAILURE_BODY = {"exception": "synthetic QLever failure for fixtures"}


def write_responses(config: Config) -> None:
    responses_dir = HERE / "responses"
    responses_dir.mkdir(parents=True, exist_ok=True)
    # Scenario/query changes rename response files; drop stale ones so the
    # committed set is exactly what the index references.
    for stale in responses_dir.glob("*.json"):
        stale.unlink()
    index: dict[str, dict] = {}

    def add(
        name: str, url: str, params: dict[str, str], body: dict, status: int = 200
    ) -> None:
        (responses_dir / name).write_text(
            json.dumps(body, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        index[request_key(url, params)] = {
            "file": name,
            "status": status,
            "headers": {"date": FIXTURE_DATE, "content-type": "application/json"},
            "url": url,
            "params": params,
        }

    wdqs = config.extraction.endpoints.wdqs
    qlever = config.extraction.endpoints.qlever
    api = config.extraction.endpoints.wikibase_api

    # 1. Property inventory (WDQS).
    add(
        "inventory.json",
        wdqs,
        sparql_params(property_inventory_query()),
        inventory_response(),
    )

    # 1b. P1647 ancestor closure for all item-properties (QLever).
    add(
        "ancestors.json",
        qlever,
        sparql_params(property_ancestors_query()),
        ancestors_response(),
    )

    # 2. wbgetentities property batch (all wikibase-item pids, one batch).
    item_pids = [pid for pid, dt, _ in INVENTORY_ROWS if dt == WIKIBASE_ITEM]
    for batch_index, batch in enumerate(chunk_ids(item_pids)):
        add(
            f"props_batch_{batch_index}.json",
            api,
            wbgetentities_params(batch, config.extraction.languages),
            {"entities": {pid: PROPERTY_DOCS[pid] for pid in batch}, "success": 1},
        )

    # 3. wbgetentities label batch: constraint-referenced QIDs plus the
    # non-retained closed ancestor P9006 (mixed P/Q batch, like the real
    # pipeline builds).
    for batch_index, batch in enumerate(chunk_ids(list(ITEM_DOCS))):
        add(
            f"items_batch_{batch_index}.json",
            api,
            wbgetentities_params(batch, config.extraction.languages),
            {"entities": {qid: ITEM_DOCS[qid] for qid in batch}, "success": 1},
        )

    # 4. Example ladder responses.
    def example_params(pid: str, offset: int) -> dict[str, str]:
        return sparql_params(
            example_pairs_query(
                pid, limit=config.extraction.example_pool_limit, offset=offset
            )
        )

    # Ladder scenario (QLever-first, per config.example_endpoint_ladder):
    # - P361/P50/P527/P9005 succeed on the first rung (QLever); no WDQS
    #   fixtures exist for them, so an unexpected WDQS probe fails loudly.
    # - P9001 times out on QLever and falls back to WDQS (fallback flag).
    # - P9002 fails on both endpoints -> recorded skip flag.
    for offset in config.extraction.example_offsets:
        for pid in ("P361", "P50", "P527", "P9005"):
            add(
                f"examples_{pid}_qlever_{offset}.json",
                qlever,
                example_params(pid, offset),
                example_response(pid),
            )
        add(
            f"examples_P9001_qlever_{offset}.json",
            qlever,
            example_params("P9001", offset),
            QLEVER_FAILURE_BODY,
            status=500,
        )
        add(
            f"examples_P9001_wdqs_{offset}.json",
            wdqs,
            example_params("P9001", offset),
            example_response("P9001"),
        )
        add(
            f"examples_P9002_qlever_{offset}.json",
            qlever,
            example_params("P9002", offset),
            QLEVER_FAILURE_BODY,
            status=500,
        )
        add(
            f"examples_P9002_wdqs_{offset}.json",
            wdqs,
            example_params("P9002", offset),
            TIMEOUT_BODY,
            status=500,
        )

    (responses_dir / "index.json").write_text(
        json.dumps(index, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


# Synthetic P279 edges (numeric QIDs) covering the fixture classes. Depth-2
# chains (city -> human settlement -> entity; book -> written work ->
# entity) exercise transitive subsumption in the live pipeline; film/human/
# business attach directly under entity. Q11424 is deliberately NOT under
# Q571, so film-typed subjects violate P50's book-only constraint.
TAXONOMY_EDGES = [
    (515, 486972),  # city -> human settlement
    (486972, 35120),  # human settlement -> entity
    (571, 47461344),  # book -> written work
    (47461344, 35120),  # written work -> entity
    (11424, 35120),  # film -> entity
    (5, 35120),  # human -> entity
    (4830453, 35120),  # business -> entity
]


def main() -> None:
    config = Config.load(HERE / "config.yaml")
    write_dump_excerpt()
    write_responses(config)
    write_taxonomy_parquet(tuple(TAXONOMY_EDGES), HERE / "taxonomy.parquet")
    print(f"wrote fixtures under {HERE}")


if __name__ == "__main__":
    main()
