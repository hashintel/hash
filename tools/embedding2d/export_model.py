"""
Export a fitted layout as a simple typed-graph model:

    node.json   [{ id, x, y, typeIds, label? }]
    edges.json  [{ id, fromId, toId, typeId }]
    type.json   [{ id, label, iconName? }]
    model.json  { nodes, edges, types }

Positions come from a layout-aXXX.npz (default: run/layout-a100.npz);
node types, node labels, edges, and type metadata are joined live from
the graph DB, so it must be reachable (same env vars as main.py).

Conventions:
- Node/edge IDs are `web_id~entity_uuid` strings (same format as
  hubs.json). An edge's ID is the link entity's own identity.
- Type IDs are versioned type URLs (`<base_url>v/<version>`).
- A node's `label` is the value of its type's `labelProperty` (resolved
  through the closed schema, so inherited label properties count),
  omitted when there is none.
- `iconName` is the type's raw `icon` value (an emoji or an icon path
  such as `/icons/types/file.svg`), omitted when unset.
- Only edges whose endpoints are both in the layout are exported.
  Entities that vanished from the DB since the sample keep their
  position but get an empty `typeIds`.
"""

import argparse
import json
import uuid
from pathlib import Path

import numpy as np
from tqdm import tqdm

FETCH_BATCH_SIZE = 10_000

# Per current (non-draft) entity: its depth-0 type URLs and its label,
# extracted from `properties` via the closed schema's labelProperty.
NODE_QUERY = """
    SELECT
        tm.entity_uuid,
        tm.web_id,
        array_agg(DISTINCT oi.base_url || 'v/' || oi.version::text),
        max(ee.properties ->> (
            jsonb_path_query_first(
                et.closed_schema, '$.allOf[*].labelProperty'
            ) #>> '{}'
        ))
    FROM entity_temporal_metadata tm
    JOIN entity_editions ee ON ee.entity_edition_id = tm.entity_edition_id
    JOIN entity_is_of_type it
        ON it.entity_edition_id = tm.entity_edition_id
        AND it.inheritance_depth = 0
    JOIN ontology_ids oi ON oi.ontology_id = it.entity_type_ontology_id
    JOIN entity_types et ON et.ontology_id = it.entity_type_ontology_id
    WHERE tm.transaction_time @> now()
        AND tm.decision_time @> now()
        AND tm.draft_id IS NULL
    GROUP BY tm.entity_uuid, tm.web_id
"""

# A relation A -> B is a link entity L with rows L -> A
# ('has-left-entity') and L -> B ('has-right-entity'); self-joining on L
# yields (A, B), and L's own identity/type give the edge its id/typeId.
EDGE_QUERY = """
    SELECT
        l.source_entity_uuid,
        l.source_web_id,
        l.target_entity_uuid,
        l.target_web_id,
        r.target_entity_uuid,
        r.target_web_id,
        min(oi.base_url || 'v/' || oi.version::text)
    FROM entity_edge l
    JOIN entity_edge r
        ON l.source_web_id = r.source_web_id
        AND l.source_entity_uuid = r.source_entity_uuid
    JOIN entity_temporal_metadata tm
        ON tm.web_id = l.source_web_id
        AND tm.entity_uuid = l.source_entity_uuid
        AND tm.transaction_time @> now()
        AND tm.decision_time @> now()
        AND tm.draft_id IS NULL
    JOIN entity_is_of_type it
        ON it.entity_edition_id = tm.entity_edition_id
        AND it.inheritance_depth = 0
    JOIN ontology_ids oi ON oi.ontology_id = it.entity_type_ontology_id
    WHERE l.kind = 'has-left-entity' AND l.direction = 'outgoing'
        AND r.kind = 'has-right-entity' AND r.direction = 'outgoing'
    GROUP BY 1, 2, 3, 4, 5, 6
"""

EDGE_COUNT_QUERY = """
    SELECT COUNT(*)
    FROM entity_edge
    WHERE kind = 'has-left-entity' AND direction = 'outgoing'
"""

TYPE_QUERY = """
    SELECT
        oi.base_url || 'v/' || oi.version::text,
        et.schema ->> 'title',
        et.schema ->> 'icon'
    FROM entity_types et
    JOIN ontology_ids oi ON oi.ontology_id = et.ontology_id
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "layout", type=Path, nargs="?", default=Path("run/layout-a100.npz")
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="output directory (default: <layout dir>/export)",
    )
    args = parser.parse_args()
    out_dir = args.out_dir or args.layout.parent / "export"
    out_dir.mkdir(parents=True, exist_ok=True)

    from app.fit import Layout  # lazy: fit pulls the full torch stack
    from app.sample import METADATA_DT, connect, row_lookup

    layout = Layout.load(args.layout)
    lookup = row_lookup(layout.metadata)
    n = len(layout.metadata)

    ids = [
        f"{uuid.UUID(bytes=r['web_id'].tobytes())}"
        f"~{uuid.UUID(bytes=r['entity_uuid'].tobytes())}"
        for r in layout.metadata
    ]

    type_ids: list[list[str]] = [[] for _ in range(n)]
    labels: list[str | None] = [None] * n
    edges: list[dict] = []

    with connect() as connection:
        with (
            connection.cursor(name="node_export") as cursor,
            tqdm(desc="fetching node types", unit="row", unit_scale=True) as progress,
        ):
            cursor.itersize = FETCH_BATCH_SIZE
            cursor.execute(NODE_QUERY)

            while batch := cursor.fetchmany(FETCH_BATCH_SIZE):
                records = np.array(
                    [(eu.bytes, wu.bytes) for (eu, wu, _, _) in batch],
                    dtype=METADATA_DT,
                )
                rows, found = lookup(records)
                for row, ok, (_, _, types, label) in zip(rows, found, batch):
                    if ok:
                        type_ids[row] = types
                        labels[row] = label
                progress.update(len(batch))

        with connection.cursor() as cursor:
            cursor.execute(EDGE_COUNT_QUERY)
            (edge_total,) = cursor.fetchone()

        with (
            connection.cursor(name="edge_export") as cursor,
            tqdm(
                total=edge_total, desc="fetching edges", unit="edge", unit_scale=True
            ) as progress,
        ):
            cursor.itersize = FETCH_BATCH_SIZE
            cursor.execute(EDGE_QUERY)

            while batch := cursor.fetchmany(FETCH_BATCH_SIZE):
                sources = np.array(
                    [(eu.bytes, wu.bytes) for (_, _, eu, wu, _, _, _) in batch],
                    dtype=METADATA_DT,
                )
                targets = np.array(
                    [(eu.bytes, wu.bytes) for (_, _, _, _, eu, wu, _) in batch],
                    dtype=METADATA_DT,
                )
                source_rows, source_ok = lookup(sources)
                target_rows, target_ok = lookup(targets)

                for (link_eu, link_wu, *_, type_id), source, target, ok in zip(
                    batch, source_rows, target_rows, source_ok & target_ok
                ):
                    if ok:
                        edges.append(
                            {
                                "id": f"{link_wu}~{link_eu}",
                                "fromId": ids[source],
                                "toId": ids[target],
                                "typeId": type_id,
                            }
                        )
                progress.update(len(batch))

        with connection.cursor() as cursor:
            cursor.execute(TYPE_QUERY)
            all_types = cursor.fetchall()

    nodes = [
        {"id": ids[row], "x": round(float(x), 4), "y": round(float(y), 4)}
        | ({"label": labels[row]} if labels[row] else {})
        | {"typeIds": type_ids[row]}
        for row, (x, y) in enumerate(layout.xy)
    ]

    referenced = {t for ts in type_ids for t in ts} | {e["typeId"] for e in edges}
    types = [
        {"id": type_id, "label": title} | ({"iconName": icon} if icon else {})
        for type_id, title, icon in all_types
        if type_id in referenced
    ]

    # Serialize each collection once; model.json is just their composition.
    parts = {"nodes": nodes, "edges": edges, "types": types}
    serialized = {
        key: json.dumps(value, separators=(",", ":")) for key, value in parts.items()
    }
    for key, filename in [
        ("nodes", "node.json"),
        ("edges", "edges.json"),
        ("types", "type.json"),
    ]:
        (out_dir / filename).write_text(serialized[key])
    (out_dir / "model.json").write_text(
        "{" + ",".join(f'"{key}":{value}' for key, value in serialized.items()) + "}"
    )

    untyped = sum(not ts for ts in type_ids)
    print(
        f"wrote {out_dir}/{{node,edges,type,model}}.json: "
        f"{len(nodes):,} nodes ({untyped:,} untyped), "
        f"{len(edges):,} edges, {len(types):,} types"
    )


if __name__ == "__main__":
    main()
