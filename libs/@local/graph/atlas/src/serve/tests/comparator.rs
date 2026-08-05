//! The fixed-view comparator, over two serving worlds that differ only in rows the caller cannot
//! see.
//!
//! One world's corpus is the visible set. The other's corpus is that same set plus rows appended
//! as exact embedding repeats, which a scope proof then withholds. The appended rows are joined in
//! a ring of their own, so incident degree ranks them above the corpus rows they repeat. Landmark
//! placement gives every row its assigned landmark's coordinate, so a repeat takes the coordinate
//! its original took. The shared rows therefore keep their layout, their keys and their relative
//! rank while the appended rows claim the shared cells first. The premise tests prove that
//! arrangement rather than assuming it, because the theorem is only about the hidden rows once the
//! visible picture is pinned.
//!
//! The sweep then compares every observable a caller can read. Row identities are compared in
//! delivery order. The head contributes its counts, its runs and its first bucket, and the child
//! frontier and the root's global metadata come with it. Each requested tile set contributes its
//! edge ids, and each locate source contributes its fly-to and its ego graph under every cap. Both
//! worlds serve the same visible rows, so a difference anywhere in that set is a hidden row
//! reaching the wire.
//!
//! Varying the proof over one corpus cannot witness this, because both proofs would share the
//! corpus bucket assignment. The retired selector read exactly that assignment, which is why the
//! negative control in [`the_retired_selector_parts_the_two_worlds`] replays it here and fails to
//! agree across the same pair of worlds this sweep finds identical.

#![expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]

use std::collections::HashSet;

use hashql_core::id::Id;

use super::{
    Bound, CborReader, EdgesLimits, FIXTURE_LOD, HEAD, ROW_IDS, TileCoordinate, children_of, codec,
    decode_rows, edges_request, entity_string_of, expected_edges_bytes, fixture_dataset,
    fixture_dataset_extended, head_counts, head_global, mask_hiding, mask_hiding_rows,
    open_edge_artifacts, publish_dataset, qualifying_columns, request, section, test_codec,
    wire_columns,
};
use crate::{
    dataset::postgres::id::ArchivedEntityId,
    file::generation::Generation,
    identity::{EdgeRowId, NodeRowId},
    morton::{Depth, MortonCell, MortonKey},
    salt::wire::Mode,
    serve::{
        Atlas, CutOffset, DensityBand, DensityPolicy, TileLimits, VisibilityProof,
        locate::LocateLimits,
    },
};

/// The corpus rows the superset world appends, named by the row each repeats.
///
/// A repeat is co-located with its original and competes for the same cells. Between them the
/// entries cover every distinct key the fixture occupies, so no shared cell is left without a
/// competitor.
const HIDDEN_REPEATS: [u64; 8] = [0, 1, 2, 3, 5, 7, 11, 40];

/// The offsets the sweep resolves cuts at, beyond the policy's own.
const OFFSETS: [u8; 3] = [0, 1, 2];

/// A pair of serving worlds over the same visible rows.
struct Worlds {
    visible: Atlas,
    visible_generation: Generation,
    visible_proof: VisibilityProof,
    superset: Atlas,
    superset_generation: Generation,
    superset_proof: VisibilityProof,
    /// The corpus rows both worlds carry, `0..shared` in each world's own row order.
    shared: u32,
}

impl Worlds {
    /// Publishes both worlds and declares the scope each caller holds.
    ///
    /// Both callers hold a scope rather than operator authority, so both are served by the same
    /// contract and neither reads the corpus schedule by declaration. The superset caller's scope
    /// withholds the appended rows and the link rows they carry; the visible caller's scope
    /// withholds nothing, because its world holds nothing to withhold.
    async fn publish(name: &str) -> Self {
        let (visible_generation, visible) =
            publish_dataset(&format!("{name}-visible"), &fixture_dataset()).await;
        let (superset_generation, superset) = publish_dataset(
            &format!("{name}-superset"),
            &fixture_dataset_extended(&HIDDEN_REPEATS),
        )
        .await;

        let shared = u32::try_from(visible.row_ids().len()).expect("fixture universes fit u32");
        let appended = u32::try_from(HIDDEN_REPEATS.len()).expect("the repeat count fits u32");
        let hidden_nodes: Vec<u32> = (shared..shared + appended).collect();
        let visible_links =
            u32::try_from(visible.endpoints.view().len()).expect("fixture link counts fit u32");
        let superset_links =
            u32::try_from(superset.endpoints.view().len()).expect("fixture link counts fit u32");
        let hidden_links: Vec<u32> = (visible_links..superset_links).collect();

        let visible_proof = mask_hiding(&visible, &[]);
        let superset_proof = mask_hiding_rows(&superset, &hidden_nodes, &hidden_links);

        Self {
            visible,
            visible_generation,
            visible_proof,
            superset,
            superset_generation,
            superset_proof,
            shared,
        }
    }

    /// The pair as `(atlas, proof)`, visible world first.
    fn pair(&self) -> [(&Atlas, &VisibilityProof); 2] {
        [
            (&self.visible, &self.visible_proof),
            (&self.superset, &self.superset_proof),
        ]
    }
}

/// One shared row's pinned layout.
#[derive(Debug, PartialEq)]
struct Layout {
    coordinate: (u32, u32),
    key: MortonKey,
}

/// The layout of rows `0..shared`, in row order, with those rows' rank order beside it.
///
/// The coordinate is compared by bits rather than by value, so a difference no `f32` comparison
/// distinguishes still fails. The rank order is the shared rows sorted by importance rank: the
/// appended rows interleave into the absolute ranks, so only the relative order can hold.
fn layout(atlas: &Atlas, shared: u32) -> (Vec<Layout>, Vec<u32>) {
    let ranks = atlas.ranks.view();
    let position_of = |row: u32| atlas.positions_of_row()[NodeRowId::from_u32(row)];

    let layouts = (0..shared)
        .map(|row| {
            let position = position_of(row);
            let point = atlas.positions()[position];
            Layout {
                coordinate: (point.x().to_bits(), point.y().to_bits()),
                key: atlas.morton.code(position),
            }
        })
        .collect();

    let mut order: Vec<u32> = (0..shared).collect();
    order.sort_by_key(|&row| ranks[position_of(row)].as_u32());

    (layouts, order)
}

/// The rows one world's tile response delivers, as row indices in delivery order.
fn delivered_rows(atlas: &Atlas, bytes: &[u8]) -> Vec<u32> {
    let node_codec = test_codec(atlas);

    decode_rows(section(bytes, ROW_IDS).expect("ROW_IDS is present"))
        .into_iter()
        .map(|wire| {
            node_codec
                .decode(codec::WireRow::pinned(wire))
                .expect("delivered wire ids decode")
                .as_u32()
        })
        .collect()
}

/// Reads the scalars of one tile head that two worlds can be compared on.
///
/// The digest holds five values. They are the delivered count and the tile-local visible count and
/// the first bucket and the runs and the child frontier.
///
/// [`head_counts`] refuses a head carrying retired key 11 and checks the runs against the
/// delivered count. Reading through it is therefore what pins the key's absence in every swept
/// tile.
fn head_digest(head: &[u8]) -> (u64, Vec<u64>, u64, u64, u64) {
    let (delivered, runs) = head_counts(head);
    let scalar = |wanted: u64| {
        let mut reader = CborReader { bytes: head, at: 0 };
        let entries = reader.head(5);
        for _ in 0..entries {
            if reader.uint() == wanted {
                return reader.uint();
            }
            reader.skip();
        }

        panic!("HEAD key {wanted} is missing");
    };

    (delivered, runs, scalar(5), scalar(6), children_of(head))
}

/// Every cell of every zoom the fixture schedule addresses, with its route coordinate.
fn grid() -> Vec<(u8, u32, u32, MortonCell)> {
    (0..=FIXTURE_LOD.max_tile_depth)
        .flat_map(|z| {
            let cells = 1_u32 << z;
            (0..cells).flat_map(move |x| {
                (0..cells).map(move |y| {
                    (
                        z,
                        x,
                        y,
                        MortonCell::new(Depth::new(z).expect("zooms are depths"), x, y)
                            .expect("the sweep stays on each zoom's grid"),
                    )
                })
            })
        })
        .collect()
}

/// Both independently fitted worlds agree on every visible row's layout and identity.
///
/// The comparator's premise, stated as its own test so that a fixture change breaking it fails
/// here rather than turning the theorem into a comparison of two different pictures.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn two_worlds_share_every_visible_row_layout() {
    let worlds = Worlds::publish("comparator-premise").await;
    let Worlds {
        visible,
        superset,
        shared,
        ..
    } = &worlds;

    assert_eq!(
        superset.row_ids().len(),
        visible.row_ids().len() + HIDDEN_REPEATS.len(),
        "the superset world carries exactly the appended rows",
    );

    let (visible_layout, visible_order) = layout(visible, *shared);
    let (superset_layout, superset_order) = layout(superset, *shared);
    for row in 0..*shared {
        let at = usize::try_from(row).expect("fixture rows fit usize");
        assert_eq!(
            visible_layout[at], superset_layout[at],
            "row {row} takes a different layout across the two worlds",
        );
    }
    assert_eq!(
        visible_order, superset_order,
        "the shared rows keep their relative importance order",
    );

    // The visible link rows and their recorded endpoints are the other declared premise.
    let ordered_endpoints = |atlas: &Atlas, links: usize| {
        atlas
            .endpoints
            .view()
            .iter()
            .take(links)
            .map(|pair| pair.map(Id::as_u32))
            .collect::<Vec<_>>()
    };
    let visible_links = visible.endpoints.view().len();
    assert_eq!(
        ordered_endpoints(visible, visible_links),
        ordered_endpoints(superset, visible_links),
        "the visible link rows keep their recorded endpoint order",
    );

    // A row number is each world's own numbering, so the endpoints are compared again as the node
    // identities they name: the two worlds must draw each link between the same two entities.
    assert_eq!(
        endpoint_identities(visible, visible_links),
        endpoint_identities(superset, visible_links),
        "the visible link rows join different entities across the two worlds",
    );

    // An appended row sitting at an unoccupied coordinate would perturb a cell no visible row
    // competes for, which is a weaker intervention than the one this fixture claims.
    let occupied: HashSet<(u32, u32)> = (0..*shared)
        .map(|row| {
            let point = superset.positions()[superset.positions_of_row()[NodeRowId::from_u32(row)]];
            (point.x().to_bits(), point.y().to_bits())
        })
        .collect();
    for offset in 0..u32::try_from(HIDDEN_REPEATS.len()).expect("the repeat count fits u32") {
        let row = *shared + offset;
        let point = superset.positions()[superset.positions_of_row()[NodeRowId::from_u32(row)]];
        assert!(
            occupied.contains(&(point.x().to_bits(), point.y().to_bits())),
            "appended row {row} sits on a coordinate no visible row occupies",
        );
    }
}

/// The appended rows take shared cells away from the visible rows in the corpus schedule.
///
/// The intervention has to reach the schedule the retired selector read, or the negative control
/// cannot fail and the sweep would agree for want of a difference to find.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn the_appended_rows_move_the_corpus_schedule() {
    let worlds = Worlds::publish("comparator-intervention").await;
    let bucket_of = |atlas: &Atlas, row: u32| {
        atlas
            .morton
            .bucket_of(atlas.positions_of_row()[NodeRowId::from_u32(row)])
            .get()
    };

    let moved: Vec<u32> = (0..worlds.shared)
        .filter(|&row| bucket_of(&worlds.visible, row) != bucket_of(&worlds.superset, row))
        .collect();
    assert!(
        !moved.is_empty(),
        "no visible row changes its corpus bucket when the repeats join the corpus, so the \
         comparator's intervention reaches nothing (moved {moved:?})",
    );
}

/// Both worlds resolve the same delivery cut for the same visible view.
///
/// The policy is one value read by both, so the two runs share `z_max`, the band and the tie-break
/// by construction. What the assertion adds is that each world's census hands that policy the same
/// aggregate.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn both_worlds_resolve_the_same_cut() {
    let worlds = Worlds::publish("comparator-cut").await;
    let policy = DensityPolicy::new(
        DensityBand::new(
            core::num::NonZero::new(8).expect("the band's lower bound is positive"),
            core::num::NonZero::new(16).expect("the band's upper bound is positive"),
        )
        .expect("the band is ordered"),
        FIXTURE_LOD.span,
        FIXTURE_LOD.max_tile_depth,
    )
    .expect("the fixture schedule admits an offset");

    let [(visible, visible_proof), (superset, superset_proof)] = worlds.pair();
    let visible_occupancy = visible.visible_occupancy(visible_proof);
    let superset_occupancy = superset.visible_occupancy(superset_proof);
    assert_eq!(
        visible_occupancy, superset_occupancy,
        "the two views hand the policy different aggregates",
    );
    assert_eq!(
        policy.resolve(&visible_occupancy),
        policy.resolve(&superset_occupancy),
        "the two worlds resolve different cuts for the same visible view",
    );
}

/// Every tile observable is identical across the two worlds, at every offset, zoom and mode.
///
/// The delivered rows are compared as row identities rather than as wire ids, because the codec
/// derives from each generation's own identity and universe: two worlds cannot spell the same row
/// with the same wire id, and the caller's picture is the identity behind it.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn the_two_worlds_deliver_the_same_tiles() {
    let worlds = Worlds::publish("comparator-tiles").await;
    let [(visible, visible_proof), (superset, superset_proof)] = worlds.pair();

    for k in OFFSETS {
        let offset = CutOffset::new(k);
        for (z, x, y, _cell) in grid() {
            for mode in [Mode::Delta, Mode::Total] {
                let at = format!("k={k} {mode:?} {z}/{x}/{y}");
                let serve = |atlas: &Atlas, proof: &VisibilityProof| {
                    atlas
                        .tile(
                            &request(z, x, y, mode),
                            TileLimits::default(),
                            proof,
                            offset,
                        )
                        .expect("the scoped tile serves")
                };
                let visible_bytes = serve(visible, visible_proof);
                let superset_bytes = serve(superset, superset_proof);

                assert_eq!(
                    delivered_rows(visible, &visible_bytes),
                    delivered_rows(superset, &superset_bytes),
                    "{at} delivers different rows",
                );

                let visible_head = section(&visible_bytes, HEAD).expect("HEAD is present");
                let superset_head = section(&superset_bytes, HEAD).expect("HEAD is present");
                assert_eq!(
                    head_digest(visible_head),
                    head_digest(superset_head),
                    "{at} heads disagree on counts, runs, first bucket or children",
                );

                if z == 0 && mode == Mode::Delta {
                    assert_eq!(
                        head_global(visible_head).expect("the root carries global metadata"),
                        head_global(superset_head).expect("the root carries global metadata"),
                        "{at} roots disagree on bounds, visible count or minimum resolution",
                    );
                }
            }
        }
    }
}

/// The retired hidden-budget selector parts the two worlds the tile sweep cannot part.
///
/// The negative control the comparator needs, run over the same pair of worlds and the same
/// requests. The retired law delivered a tile's corpus bucket runs, masked after the fact; it is
/// replayed here from the corpus schedule directly, because the code that read it is gone. Its
/// answer to one caller changes when rows that caller cannot see join the corpus, which is the
/// channel the cascade closed and the reason the sweep above is evidence rather than a tautology.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn the_retired_selector_parts_the_two_worlds() {
    let worlds = Worlds::publish("comparator-control").await;
    let retired = |atlas: &Atlas, proof: &VisibilityProof, z: u8, cell: MortonCell, k: u8| {
        let row_ids = atlas.row_ids();
        (0..=(z + FIXTURE_LOD.span.get() + k))
            .filter_map(Depth::new)
            .flat_map(|bucket| atlas.morton.run(bucket, cell))
            .map(|position| row_ids[position])
            .filter(|&row| proof.contains(row))
            .map(Id::as_u32)
            .collect::<Vec<u32>>()
    };

    let [(visible, visible_proof), (superset, superset_proof)] = worlds.pair();
    let mut parted = 0_usize;
    for k in OFFSETS {
        for (z, _x, _y, cell) in grid() {
            parted += usize::from(
                retired(visible, visible_proof, z, cell, k)
                    != retired(superset, superset_proof, z, cell, k),
            );
        }
    }

    assert!(
        parted > 0,
        "the retired selector answers the same caller identically in both worlds, so the tile \
         sweep's agreement witnesses nothing",
    );
}

/// Every edges observable is identical across the two worlds.
///
/// Each world's served bytes are pinned to the subgraph its own delivered rows induce before the
/// two worlds are compared to each other, so a difference between them is a difference in the
/// bounding set rather than in the reconstruction.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn the_two_worlds_deliver_the_same_edges() {
    let worlds = Worlds::publish("comparator-links").await;
    let generations = [&worlds.visible_generation, &worlds.superset_generation];

    let endpoints_of = |generation: &Generation| {
        open_edge_artifacts(generation)
            .endpoints
            .u64_le_pairs()
            .expect("the endpoint column is little-endian u64 pairs")
            .iter()
            .map(|pair| pair.map(zerocopy::U64::get))
            .collect::<Vec<[u64; 2]>>()
    };
    let world_endpoints = [endpoints_of(generations[0]), endpoints_of(generations[1])];

    for k in OFFSETS {
        let offset = CutOffset::new(k);

        // Edges: one tile list per zoom whose cut still discriminates, plus the root alone.
        for tiles in [
            vec![TileCoordinate { z: 0, x: 0, y: 0 }],
            (0..2_u32)
                .flat_map(|x| (0..2_u32).map(move |y| TileCoordinate { z: 1, x, y }))
                .collect(),
        ] {
            let at = format!("k={k} {} tiles", tiles.len());
            let mut answers = Vec::new();
            for (index, (atlas, proof)) in worlds.pair().into_iter().enumerate() {
                let delivered: HashSet<u32> = tiles
                    .iter()
                    .flat_map(|&coordinate| {
                        let bytes = atlas
                            .tile(
                                &request(coordinate.z, coordinate.x, coordinate.y, Mode::Total),
                                TileLimits::default(),
                                proof,
                                offset,
                            )
                            .expect("the scoped tile serves");
                        delivered_rows(atlas, &bytes)
                    })
                    .collect();

                let bytes = atlas
                    .edges(
                        &edges_request(tiles.clone()),
                        EdgesLimits::default(),
                        proof,
                        offset,
                    )
                    .expect("the scoped edges request serves");
                let (sources, targets, rows) =
                    qualifying_columns(&world_endpoints[index], &delivered);
                let (wire_sources, wire_targets, edge_ids) =
                    wire_columns(atlas, &sources, &targets, &rows);
                assert_eq!(
                    bytes,
                    expected_edges_bytes(
                        generations[index],
                        true,
                        &wire_sources,
                        &wire_targets,
                        &edge_ids,
                    ),
                    "{at} does not draw the subgraph its own tiles delivered",
                );
                answers.push((sources, targets, rows));
            }

            assert_eq!(answers[0], answers[1], "{at} draws different subgraphs");
        }
    }
}

/// Every locate observable is identical across the two worlds, at every source and every cap.
///
/// The cap's tie-break reads each partner's first visible zoom, which is where a hidden row would
/// choose which authorized partner survives. The sweep therefore walks every cap between nothing
/// and the whole ego graph rather than the default alone.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn the_two_worlds_deliver_the_same_ego_graphs() {
    let worlds = Worlds::publish("comparator-locate").await;

    for k in OFFSETS {
        let offset = CutOffset::new(k);
        for row in 0..worlds.shared {
            let seed = u8::try_from(row).expect("fixture rows fit u8");
            let at = format!("k={k} source {row}");
            let mut answers = Vec::new();
            for (atlas, proof) in worlds.pair() {
                let bound = Bound::new(atlas, proof, offset);
                let view = bound.view(atlas);
                let source = atlas
                    .resolve_source(&view, &entity_string_of(seed))
                    .expect("a visible row's own entity id resolves");
                let full = atlas.locate_subgraph(source, LocateLimits::default(), &view);

                let mut caps = Vec::new();
                for cap in 0..=full.edges.len() {
                    let subgraph = atlas.locate_subgraph(
                        source,
                        LocateLimits {
                            edges: u32::try_from(cap).expect("fixture edge counts are small"),
                            ..LocateLimits::default()
                        },
                        &view,
                    );
                    caps.push((
                        subgraph.complete,
                        subgraph
                            .rows
                            .iter()
                            .map(|row| row.as_u32())
                            .collect::<Vec<u32>>(),
                        subgraph
                            .edges
                            .iter()
                            .map(|(edge, _)| edge.row.get().as_u32())
                            .collect::<Vec<u32>>(),
                    ));
                }

                answers.push((source.zoom, source.cell, caps));
            }

            assert_eq!(
                answers[0], answers[1],
                "{at} resolves a different fly-to or ego graph",
            );
        }
    }
}

/// The endpoints of link rows `0..links`, in row order, as the node identities they name.
fn endpoint_identities(atlas: &Atlas, links: usize) -> Vec<[ArchivedEntityId; 2]> {
    atlas
        .endpoints
        .view()
        .iter()
        .take(links)
        .map(|pair| {
            pair.map(|row| {
                atlas
                    .node_ids
                    .id(row)
                    .expect("a visible endpoint carries a published identity")
            })
        })
        .collect()
}

/// One link identity resolves to one link row in both worlds, and a withheld link to neither.
///
/// The link half of the pairing every comparison above rests on. Link rows are compared by index,
/// which is the caller's own picture only if index and identity agree across the two worlds, and
/// two assembled worlds number their rows independently. The published identity table is what
/// joins them, and this reads it in both directions. Each row yields its identity, and that
/// identity resolves back to a row through the lookup a translate request runs. The withheld rows
/// are the other half, and their identities reach no row of the visible world at all. The shared
/// prefix therefore agrees on identities rather than on a count of rows that happen to line up.
///
/// What this case cannot do is establish the pairing from nothing. The fixture's identity rewrite
/// keys row `r` of each world to the same derived identity, so identity follows the row number
/// here and the two agree because both datasets stream the same shared prefix in the same order.
/// What the case does catch is that prefix moving. A link row that shifts in the superset world
/// leaves each surviving row naming different endpoints, which the endpoint identities in
/// [`two_worlds_share_every_visible_row_layout`] read directly. The stronger statement needs a
/// fixture whose identities arrive with the dataset rather than after the publish.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn one_link_identity_resolves_to_one_link_row_in_both_worlds() {
    let worlds = Worlds::publish("comparator-link-identities").await;
    let links_of = |atlas: &Atlas| {
        u32::try_from(atlas.endpoints.view().len()).expect("fixture link counts fit u32")
    };
    let visible_links = links_of(&worlds.visible);

    for row in 0..visible_links {
        let link = EdgeRowId::from_u32(row);
        let identity = worlds
            .visible
            .edge_ids
            .id(link)
            .expect("a visible link row carries a published identity");
        assert_eq!(
            worlds.superset.edge_ids.id(link),
            Some(identity),
            "link row {row} carries a different identity across the two worlds",
        );
        for atlas in [&worlds.visible, &worlds.superset] {
            assert_eq!(
                atlas.edge_ids.row_of(identity).map(Id::as_u32),
                Some(row),
                "the identity of link row {row} resolves elsewhere in one of the two worlds",
            );
        }
    }

    for row in visible_links..links_of(&worlds.superset) {
        let identity = worlds
            .superset
            .edge_ids
            .id(EdgeRowId::from_u32(row))
            .expect("an appended link row carries a published identity");
        assert!(
            worlds.visible.edge_ids.row_of(identity).is_none(),
            "appended link row {row} resolves to a row of the visible world",
        );
    }
}

/// One identity resolves to one row index in both worlds, which is what the pairing rests on.
///
/// Every comparison above pairs rows by index, which is only the caller's own picture if index and
/// identity agree across the two worlds. Serving resolves in one direction, from an entity id
/// arriving on a request to the row that answers it, and the assertion follows it.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn one_identity_resolves_to_one_row_in_both_worlds() {
    let worlds = Worlds::publish("comparator-identities").await;

    for row in 0..worlds.shared {
        let identity = super::entity_id_of(u8::try_from(row).expect("fixture rows fit u8"));
        for atlas in [&worlds.visible, &worlds.superset] {
            assert_eq!(
                atlas.node_ids.row_of(identity).map(Id::as_u32),
                Some(row),
                "row {row} resolves elsewhere in one of the two worlds",
            );
        }
    }
}
