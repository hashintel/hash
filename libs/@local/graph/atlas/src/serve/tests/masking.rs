//! The visibility masking battery, covering every read path computed over the masked view.

use core::assert_matches;

use rand::{RngExt as _, SeedableRng as _};

use super::{
    Artifacts, Atlas, BasePosition, Bound, CutOffset, Depth, EDGE_SEED, EdgesLimits, FIXTURE_EDGES,
    FIXTURE_LOD, FULL, Generation, HEAD, HashMap, HashSet, Id as _, IdSlice, Mode, MortonCell,
    NodeRowId, POSITIONS, ROW_IDS, ServeLimits, TileHead, TileLimits, TileQuery, TileRequest,
    TileResponse, UntouchedStore, VisibilityProof, Xoshiro256PlusPlus, codec, coordinate_of,
    decode_rows, domain_mask, edges_request, entity_string_of, expected_edges_bytes,
    fixture_row_ids, full_grid, head_global, locate_request, mask_hiding, mask_hiding_rows,
    narrow_usize, open_artifacts, publish, qualifying_columns, request, section, test_codec,
    viewing, walk, wire_columns,
};
use crate::{
    math::{Bounds2, Vec2},
    serve::visibility::VisibleRow,
};

/// The generation's extent, and the rows attaining any of its four extremes.
///
/// Hiding exactly these rows vacates every edge of the extent, which is what lets a census witness
/// fail on a census read off the artifacts rather than off the view: with any edge still attained,
/// the corpus extent and the view's extent agree there and the wrong answer looks right.
fn extremes(points: &[Vec2], row_ids: &[u32]) -> (Bounds2, Vec<u32>) {
    let corpus = Bounds2::from_points(points.iter().copied()).expect("the fixture holds points");

    // Exact equality is the predicate: an extremum IS one of this column's own values, so a row
    // attains it bit-for-bit or does not attain it.
    #[expect(
        clippy::float_cmp,
        reason = "the comparand is drawn from this very column, so bit equality is the intended \
                  test"
    )]
    let mut attaining: Vec<u32> = points
        .iter()
        .enumerate()
        .filter(|(_, point)| {
            point.x() == corpus.min().x()
                || point.x() == corpus.max().x()
                || point.y() == corpus.min().y()
                || point.y() == corpus.max().y()
        })
        .map(|(position, _)| row_ids[position])
        .collect();
    attaining.sort_unstable();
    attaining.dedup();

    (corpus, attaining)
}

/// The resolve seam collapses every failure to one [`None`].
///
/// Under the full proof every in-universe wire id resolves to its row; under a mask the hidden
/// row's wire id answers exactly the [`None`] an out-of-universe value answers, so forbidden and
/// nonexistent are indistinguishable downstream of the seam.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn resolve_collapses_every_failure_to_one_none() {
    let (_generation, atlas) = publish("resolve-seam").await;
    let node_codec = test_codec(&atlas);
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");

    let masked = mask_hiding(&atlas, &[7]);
    for row in 0..universe {
        let wire = node_codec.encode(NodeRowId::from_u32(row));
        assert_eq!(
            atlas.resolve(&FULL, wire).map(VisibleRow::get),
            Some(NodeRowId::from_u32(row)),
        );
        assert_eq!(
            atlas.resolve(&masked, wire).map(VisibleRow::get),
            (row != 7).then(|| NodeRowId::from_u32(row)),
        );
    }
    assert!(
        atlas
            .resolve(&FULL, codec::WireRow::pinned(universe))
            .is_none()
    );
    assert!(
        atlas
            .resolve(&masked, codec::WireRow::pinned(universe))
            .is_none()
    );
}

/// The masked root serves the scope cascade's rows, in both modes.
///
/// The delivered rows and their positions column equal the reference over exactly the visible
/// rows - a visible row may sit shallower than the corpus schedule placed it, because its
/// hidden competitor is out of its view - and a fully masked populated tile answers
/// byte-identically to a tile that never had rows (empty is empty: the head's occupancy fields
/// carry no evidence of hidden points).
#[expect(
    clippy::too_many_lines,
    reason = "two modes and the empty-cell byte identity share one publish"
)]
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn masked_root_serves_the_scope_cascades_rows_in_both_modes() {
    let (generation, atlas) = publish("masked-tile").await;
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");
    let node_codec = test_codec(&atlas);

    // Hide every third row; the hidden set crosses every bucket of
    // the 48-point fixture.
    let hidden: Vec<u32> = (0..universe).filter(|row| row.is_multiple_of(3)).collect();
    let proof = mask_hiding(&atlas, &hidden);

    let schedule = super::schedule::reference::Schedule::new(
        super::schedule::reference::rows(&atlas, &proof),
        FIXTURE_LOD.span.get(),
        FIXTURE_LOD.max_tile_depth,
        0,
    );
    let root_cell = MortonCell::new(Depth::MIN, 0, 0).expect("the root cell exists");
    let position_of: HashMap<NodeRowId, u32> = atlas
        .row_ids()
        .iter()
        .enumerate()
        .map(|(position, &row)| (row, u32::try_from(position).expect("positions fit u32")))
        .collect();
    let wire_points = atlas.positions();

    for mode in [Mode::Delta, Mode::Total] {
        let masked_bytes = atlas
            .tile(
                &request(0, 0, 0, mode),
                TileLimits::default(),
                Bound::new(&atlas, &proof, CutOffset::ZERO).view(&atlas),
            )
            .expect("the masked root serves");

        let masked_rows = decode_rows(section(&masked_bytes, ROW_IDS).expect("ROW_IDS is present"));
        let delivered: Vec<u32> = masked_rows
            .iter()
            .map(|&wire| {
                let row = node_codec
                    .decode(codec::WireRow::pinned(wire))
                    .expect("delivered wire ids decode");
                position_of[&row]
            })
            .collect();
        let expected = schedule.delivery(0, root_cell, mode);
        assert_eq!(
            delivered, expected.positions,
            "the {mode:?} root delivers the scope cascade's rows"
        );

        // The positions column carries each delivered row's own wire coordinates.
        let masked_positions = section(&masked_bytes, POSITIONS).expect("POSITIONS is present");
        let expected_positions: Vec<u8> = expected
            .positions
            .iter()
            .flat_map(|&position| {
                let point = wire_points[BasePosition::from_u32(position)];
                let mut bytes = point.x().to_le_bytes().to_vec();
                bytes.extend_from_slice(&point.y().to_le_bytes());
                bytes
            })
            .collect();
        assert_eq!(masked_positions, expected_positions);
    }

    // A fully masked populated cell answers byte-identically to a
    // cell that never had rows: same empty runs, zero visible count,
    // zero children bits.
    let Artifacts {
        morton: _,
        quad,
        coordinates,
        rows,
    } = open_artifacts(&generation);
    let points = coordinates.points().expect("wire coordinates are points");
    let _row_ids = rows
        .u64_le_elements()
        .expect("the row column is little-endian u64 rows");
    let root_cell = MortonCell::new(Depth::MIN, 0, 0).expect("the root cell exists");
    let mut nodes = Vec::new();
    walk(&quad, 0, root_cell, &mut nodes);
    let (_, populated_cell) = nodes[1..]
        .iter()
        .copied()
        .find(|&(node, _)| {
            let run = quad.nodes()[node as usize].run();
            run.end > run.start
        })
        .expect("the fixture quadtree has a populated non-root node");
    let coordinate = coordinate_of(populated_cell);
    let nothing = mask_hiding(&atlas, &(0..universe).collect::<Vec<u32>>());
    let expected = TileResponse {
        head: TileHead {
            generation: generation.id().digest(),
            variant: 0,
            coordinate,
            mode: Mode::Delta,
            visible: 0,
            first_bucket: coordinate.z + FIXTURE_LOD.span.get(),
            runs: &[0],
            global: None,
            children: 0,
        },
        delivered: crate::salt::wire::tile::DeliveredSet::Ranges(&[]),
        positions: IdSlice::from_raw(points),
        rows: IdSlice::from_raw(&[]),
        masks: None,
        trailer: None,
    }
    .encode();
    assert_eq!(
        atlas
            .tile(
                &TileRequest {
                    coordinate,
                    query: TileQuery::default(),
                },
                TileLimits::default(),
                Bound::new(&atlas, &nothing, CutOffset::ZERO).view(&atlas),
            )
            .expect("the fully masked tile serves"),
        expected,
        "a fully masked tile is a tile that never had rows",
    );
}

/// The edges path inherits the mask through its endpoints.
///
/// Hiding one node removes exactly the edges incident to it - the delivered sets intersect the
/// proof before edges qualify, so the response is byte-identical to the qualifying computation over
/// the visible row set.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn masked_edges_inherit_endpoint_visibility() {
    let (generation, atlas) = publish("masked-edges").await;
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");

    // Row 5 is an endpoint of the reciprocal fixture pair (edge rows
    // 3 and 4). Hiding it must remove exactly those two edges.
    let hidden = 5_u32;
    let proof = mask_hiding(&atlas, &[hidden]);
    let endpoints: Vec<[u64; 2]> = FIXTURE_EDGES
        .iter()
        .map(|&(_, source, target)| [source, target])
        .collect();
    let delivered: HashSet<u32> = (0..universe).filter(|&row| row != hidden).collect();
    let (sources, targets, rows) = qualifying_columns(&endpoints, &delivered);
    assert_eq!(
        rows.len(),
        FIXTURE_EDGES.len() - 2,
        "two edges hide with row 5"
    );
    let columns = wire_columns(&atlas, &sources, &targets, &rows);

    assert_eq!(
        atlas
            .edges(
                &edges_request(full_grid()),
                EdgesLimits::default(),
                Bound::new(&atlas, &proof, CutOffset::ZERO).view(&atlas),
                UntouchedStore,
            )
            .expect("the masked grid serves"),
        expected_edges_bytes(&generation, true, &columns),
    );
}

/// Translate answers missing for denied, in both identity domains.
///
/// A hidden node's id is an absent key exactly like a nonexistent id; an edge is absent when either
/// endpoint hides (edge visibility derives) and present while both endpoints show.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn translate_answers_missing_for_denied() {
    use crate::serve::translate::{TranslateLimits, TranslateRequest};

    let (_generation, atlas) = publish("masked-translate").await;

    // Row 5 endpoints fixture edge rows 3 and 4; edge row 0 joins
    // rows 0 and 1, untouched by the mask.
    let proof = mask_hiding(&atlas, &[5]);
    let request = TranslateRequest {
        entity_ids: vec![
            entity_string_of(5),             // hidden node: absent
            entity_string_of(6),             // visible node: present
            entity_string_of(EDGE_SEED + 3), // edge with hidden endpoint: absent
            entity_string_of(EDGE_SEED),     // edge with visible endpoints: present
        ],
    };
    let masked = atlas
        .translate(request.clone(), TranslateLimits::default(), &proof)
        .expect("the request is under the cap");
    assert!(!masked.nodes.contains_key(&entity_string_of(5)));
    assert!(masked.nodes.contains_key(&entity_string_of(6)));
    assert!(!masked.edges.contains_key(&entity_string_of(EDGE_SEED + 3)));
    assert!(masked.edges.contains_key(&entity_string_of(EDGE_SEED)));

    // The full proof answers all four, so the absences above come from
    // the mask rather than from the identity tables.
    let full = atlas
        .translate(request, TranslateLimits::default(), &FULL)
        .expect("the request is under the cap");
    assert_eq!(full.nodes.len(), 2);
    assert_eq!(full.edges.len(), 2);
}

/// Locate filters partners under the mask and hides its source like a missing one.
///
/// A hidden source answers the same `UnknownEntity` in both ingress domains; a hidden partner
/// drops with its edges BEFORE the cap selects - `complete` stays `true`, so the response never
/// discloses that the mask withheld anything.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_filters_partners_under_the_mask() {
    let (_generation, atlas) = publish("masked-locate").await;
    let limits = ServeLimits::default();
    let full_bound = Bound::of(&atlas, &FULL);
    let full_view = full_bound.view(&atlas);

    // Ground truth: ego(5) = partner 40 over the reciprocal pair,
    // edge rows 3 and 4.
    let source = atlas
        .resolve_source(&full_view, &entity_string_of(5))
        .expect("row 5 resolves");
    let full = atlas.locate_subgraph(source, limits.locate, &full_view);
    assert_eq!(
        full.rows.as_raw(),
        [NodeRowId::new(5), NodeRowId::new(40)],
        "the source and its one partner"
    );
    assert_eq!(full.edges.len(), 2);

    // Hiding the partner removes it and both its edges: the source stands alone, complete - a
    // masked ego-graph answers exactly like one where the partner never existed.
    let proof = mask_hiding(&atlas, &[40]);
    let masked_bound = Bound::of(&atlas, &proof);
    let masked_view = masked_bound.view(&atlas);
    let masked = atlas.locate_subgraph(source, limits.locate, &masked_view);
    assert_eq!(
        masked.rows.as_raw(),
        [NodeRowId::new(5)],
        "the hidden partner is not delivered"
    );
    assert!(masked.edges.is_empty(), "its edges leave with it");
    assert!(masked.complete, "visibility is not truncation");

    // Hidden partners drop BEFORE selection: under a cap of one, the
    // masked response still answers from visible edges alone.
    let capped = crate::serve::locate::LocateLimits {
        edges: 1,
        ..limits.locate
    };
    let capped_masked = atlas.locate_subgraph(source, capped, &masked_view);
    assert!(capped_masked.complete, "zero visible edges fit any cap");
    assert!(capped_masked.edges.is_empty());

    // A hidden source is a missing source, in both ingress domains.
    let hidden_source = mask_hiding(&atlas, &[0]);
    assert_matches!(
        atlas.locate(
            &locate_request(entity_string_of(0)),
            limits,
            Bound::new(&atlas, &hidden_source, CutOffset::ZERO).view(&atlas),
            UntouchedStore,
        ),
        Err(crate::serve::LocateError::UnknownEntity),
        "the hidden source rejects",
    );
    let node_codec = test_codec(&atlas);
    let by_row = crate::serve::LocateRequest {
        entity_id: None,
        row: Some(node_codec.encode(NodeRowId::new(0))),
        colored_type_ids: Vec::new(),
    };

    assert_matches!(
        atlas.locate(
            &by_row,
            limits,
            Bound::new(&atlas, &hidden_source, CutOffset::ZERO).view(&atlas),
            UntouchedStore,
        ),
        Err(crate::serve::LocateError::UnknownEntity),
        "the hidden source rejects by row too",
    );
}

/// The edges grid withholds a hidden link row though both its endpoints are visible.
///
/// An edge carries its link entity's own authorization, which its endpoints do not imply. The
/// fixture pins the distinction exactly: edge rows 3 and 4 are the reciprocal pair over the same
/// endpoint pair, so hiding row 3 alone must leave an edge over those endpoints delivered. No
/// rule stated over endpoints can answer this response - it must drop both or neither - and a rule
/// that over-drops loses row 4 with it.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn hidden_link_row_is_withheld_from_the_edges_grid() {
    let (generation, atlas) = publish("masked-link-edges").await;
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");
    let hidden_link = 3_u32;
    let proof = mask_hiding_rows(&atlas, &[], &[hidden_link]);

    let endpoints: Vec<[u64; 2]> = FIXTURE_EDGES
        .iter()
        .map(|&(_, source, target)| [source, target])
        .collect();
    let visible: HashSet<u32> = (0..universe).collect();
    let (sources, targets, rows) = qualifying_columns(&endpoints, &visible);
    assert_eq!(
        rows.len(),
        FIXTURE_EDGES.len(),
        "every node is visible, so every edge qualifies on endpoints"
    );

    // The expectation is the qualifying computation over the visible
    // LINK set: every edge but row 3, its reciprocal included.
    let mut kept_sources = Vec::new();
    let mut kept_targets = Vec::new();
    let mut kept_rows = Vec::new();
    for ((&row, &source), &target) in rows.iter().zip(&sources).zip(&targets) {
        if row != hidden_link {
            kept_sources.push(source);
            kept_targets.push(target);
            kept_rows.push(row);
        }
    }
    assert!(
        kept_rows.contains(&4),
        "the reciprocal edge over the same endpoints stays delivered"
    );
    let columns = wire_columns(&atlas, &kept_sources, &kept_targets, &kept_rows);

    assert_eq!(
        atlas
            .edges(
                &edges_request(full_grid()),
                EdgesLimits::default(),
                Bound::new(&atlas, &proof, CutOffset::ZERO).view(&atlas),
                UntouchedStore,
            )
            .expect("the masked grid serves"),
        expected_edges_bytes(&generation, true, &columns),
    );
}

/// A hidden link row leaves the locate ego-graph's partner delivered by its other edge.
///
/// `ego(5)` is the reciprocal pair: partner 40 over edge rows 3 and 4. Hiding link row 3 withholds
/// one direction while row 4 still delivers the partner, so the response keeps both rows and
/// exactly one edge - a shape an endpoint-level rule cannot produce. `complete` stays true:
/// visibility is not truncation.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn hidden_link_row_leaves_the_locate_partner_delivered() {
    let (_generation, atlas) = publish("masked-link-locate").await;
    let limits = ServeLimits::default();
    let full_bound = Bound::of(&atlas, &FULL);
    let full_view = full_bound.view(&atlas);
    let source = atlas
        .resolve_source(&full_view, &entity_string_of(5))
        .expect("row 5 resolves");

    // As a control, both directions deliver under full visibility.
    let full = atlas.locate_subgraph(source, limits.locate, &full_view);
    assert_eq!(full.edges.len(), 2, "the reciprocal pair, both directions");

    let proof = mask_hiding_rows(&atlas, &[], &[3]);
    let masked = viewing(&atlas, &proof, |view| {
        atlas.locate_subgraph(source, limits.locate, view)
    });
    assert_eq!(
        masked.rows.as_raw(),
        [NodeRowId::new(5), NodeRowId::new(40)],
        "the partner stays: its other edge still delivers it"
    );
    assert_eq!(
        masked
            .edges
            .iter()
            .map(|&(edge, _)| narrow_usize(edge.row.get().as_usize()))
            .collect::<Vec<u32>>(),
        [4],
        "exactly the withheld link row leaves"
    );
    assert!(masked.complete, "visibility is not truncation");
}

/// A hidden link row is an absent key in translate, beside a delivered edge on the same endpoints.
///
/// Hidden and nonexistent are the same answer at this ingress, and the reciprocal link row proves
/// the absence is the link row's own: the two edges name the same two entities, and only the hidden
/// one is missing from the response.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn hidden_link_row_is_an_absent_key_in_translate() {
    use crate::serve::translate::{TranslateLimits, TranslateRequest};

    let (_generation, atlas) = publish("masked-link-translate").await;
    let hidden = entity_string_of(EDGE_SEED + 3);
    let reciprocal = entity_string_of(EDGE_SEED + 4);
    let endpoint = entity_string_of(5);
    let ids = vec![hidden.clone(), reciprocal.clone(), endpoint.clone()];

    let translate = |proof: &VisibilityProof| {
        atlas
            .translate(
                TranslateRequest {
                    entity_ids: ids.clone(),
                },
                TranslateLimits::default(),
                proof,
            )
            .expect("the request is under the cap")
    };

    // As a control, under full visibility both link ids resolve, so the
    // absence below is the link mask's.
    let control = translate(&FULL);
    assert!(control.edges.contains_key(&hidden));
    assert!(control.edges.contains_key(&reciprocal));

    let masked = translate(&mask_hiding_rows(&atlas, &[], &[3]));
    assert!(
        !masked.edges.contains_key(&hidden),
        "the hidden link row is an absent key"
    );
    assert!(
        masked.edges.contains_key(&reciprocal),
        "the same endpoints still deliver their other edge"
    );
    assert!(
        masked.nodes.contains_key(&endpoint),
        "the endpoints themselves stay visible"
    );
}

/// The proof's membership algebra is fail-closed at every boundary.
///
/// Rows beyond a mask's domain read hidden in both domains, an edge delivers only with its own link
/// row and both endpoints, and the intersection removes exactly the hidden rows.
#[test]
fn visibility_proof_is_fail_closed() {
    use crate::{identity::EdgeRowId, serve::visibility::VisibleEdge};

    // Node rows 1 and 2 visible of four; link rows 0 and 2 visible of
    // three.
    let proof = VisibilityProof::from_masks(domain_mask(4, &[0, 3]), domain_mask(3, &[1]));

    assert!(!proof.contains(NodeRowId::new(0)));
    assert!(proof.contains(NodeRowId::new(1)));
    assert!(!proof.contains(NodeRowId::new(3)));
    // Beyond the mask's domain: hidden, never a panic.
    assert!(!proof.contains(NodeRowId::new(4)));
    assert!(!proof.contains(NodeRowId::from_u32(u32::MAX)));

    let visible_endpoints = [NodeRowId::new(1), NodeRowId::new(2)];
    let [source, target] = visible_endpoints;
    assert_eq!(
        proof
            .verify_edge(EdgeRowId::new(0), source, target)
            .map(VisibleEdge::get),
        Some(EdgeRowId::new(0)),
        "a visible link row over visible endpoints delivers, and the witness names it"
    );
    assert!(
        proof
            .verify_edge(EdgeRowId::new(1), source, target)
            .is_none(),
        "a hidden link row withholds its edge over visible endpoints"
    );
    assert!(
        proof
            .verify_edge(EdgeRowId::new(0), source, NodeRowId::new(3))
            .is_none(),
        "a hidden target withholds a visible link row"
    );
    assert!(
        proof
            .verify_edge(EdgeRowId::new(0), NodeRowId::new(0), target)
            .is_none(),
        "a hidden source withholds a visible link row"
    );
    assert!(
        proof
            .verify_edge(EdgeRowId::new(3), source, target)
            .is_none(),
        "a link row beyond the mask's domain is hidden, never a panic"
    );

    let mut set = hashql_core::id::bit_vec::DenseBitSet::new_filled(6);
    proof.intersect(&mut set);
    assert_eq!(
        set.iter().collect::<Vec<_>>(),
        [1, 2].map(NodeRowId::new),
        "the intersection removes exactly the hidden rows"
    );

    assert_eq!(proof.visible_below(4), 2);
    assert_eq!(FULL.visible_below(48), 48);
    assert!(FULL.contains(NodeRowId::from_u32(u32::MAX)));
}

/// Masking commutes with delivery on every endpoint.
///
/// Exactness is per endpoint, because each one derives its rows differently. Tiles deliver the
/// scope cascade over exactly the visible rows, so a visible row may claim a shallower cell than it
/// held under the corpus schedule. Edges, translate, and locate equal the unmasked response with
/// the hidden rows' entries removed, so the mask never leaks and never over-drops. The fixture
/// serves without capacity pressure on the non-tile endpoints, so their filtered-full comparison is
/// the law verbatim. Locate's ground truth is the fixture edge list itself, the visible ego-graph
/// derived edge by edge.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn composition_law_holds_under_random_masks() {
    let (generation, atlas) = publish("composition-sweep").await;
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0x51CA);

    for _ in 0..8 {
        let hidden: Vec<u32> = (0..universe).filter(|_| rng.random_ratio(1, 4)).collect();
        let proof = mask_hiding(&atlas, &hidden);

        assert_tiles_mask_by_intersection(&atlas, &proof, &hidden);
        assert_edges_mask_by_intersection(&generation, &atlas, &proof, &hidden);
        assert_translate_masks_by_visibility(&atlas, &proof, &hidden);
        assert_locate_delivers_the_visible_ego_graph(&atlas, &proof, &hidden);
    }
}

/// The masked rows are the scope cascade's rows at every tile coordinate in both modes.
///
/// The delivered set, its order, and the run recounts equal the independent reference over
/// exactly the visible rows, and no hidden row shows up - the intersection with the corpus
/// schedule is not the law, because a visible row may claim a shallower cell once its hidden
/// competitor is out of its view.
fn assert_tiles_mask_by_intersection(atlas: &Atlas, proof: &VisibilityProof, hidden: &[u32]) {
    let node_codec = test_codec(atlas);
    let hidden_wire: HashSet<u32> = hidden
        .iter()
        .map(|&row| node_codec.encode(NodeRowId::from_u32(row)).get())
        .collect();
    let position_of: HashMap<NodeRowId, u32> = atlas
        .row_ids()
        .iter()
        .enumerate()
        .map(|(position, &row)| (row, u32::try_from(position).expect("positions fit u32")))
        .collect();

    let schedule = super::schedule::reference::Schedule::new(
        super::schedule::reference::rows(atlas, proof),
        FIXTURE_LOD.span.get(),
        FIXTURE_LOD.max_tile_depth,
        0,
    );

    for z in 0..=FIXTURE_LOD.max_tile_depth {
        let cells = 1_u32 << z;
        for (x, y) in (0..cells).flat_map(|x| (0..cells).map(move |y| (x, y))) {
            let cell = MortonCell::new(Depth::new(z).expect("zooms are depths"), x, y)
                .expect("the sweep stays on each zoom's grid");

            for mode in [Mode::Delta, Mode::Total] {
                let at = format!("the {mode:?} tile {z}/{x}/{y}");
                let masked_bytes = atlas
                    .tile(
                        &request(z, x, y, mode),
                        TileLimits::default(),
                        Bound::new(atlas, proof, CutOffset::ZERO).view(atlas),
                    )
                    .expect("the masked tile serves");
                let masked_rows =
                    decode_rows(section(&masked_bytes, ROW_IDS).expect("ROW_IDS is present"));

                for wire in &masked_rows {
                    assert!(!hidden_wire.contains(wire), "{at} keeps hidden rows hidden");
                }

                let positions: Vec<u32> = masked_rows
                    .iter()
                    .map(|&wire| {
                        let row = node_codec
                            .decode(codec::WireRow::pinned(wire))
                            .expect("delivered wire ids decode");
                        position_of[&row]
                    })
                    .collect();
                assert_eq!(
                    positions,
                    schedule.delivery(z, cell, mode).positions,
                    "{at} delivers the scope cascade's rows in order",
                );
            }
        }
    }
}

/// Returns whether `part` occurs in `whole` in order.
fn is_subsequence(part: &[u32], whole: &[u32]) -> bool {
    let mut candidates = whole.iter();
    part.iter()
        .all(|target| candidates.any(|candidate| candidate == target))
}

/// The masked grid answers the qualifying computation over the visible row set, byte for byte.
fn assert_edges_mask_by_intersection(
    generation: &Generation,
    atlas: &Atlas,
    proof: &VisibilityProof,
    hidden: &[u32],
) {
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");
    let endpoints: Vec<[u64; 2]> = FIXTURE_EDGES
        .iter()
        .map(|&(_, source, target)| [source, target])
        .collect();
    let delivered: HashSet<u32> = (0..universe).filter(|row| !hidden.contains(row)).collect();
    let (sources, targets, rows) = qualifying_columns(&endpoints, &delivered);
    let columns = wire_columns(atlas, &sources, &targets, &rows);
    assert_eq!(
        atlas
            .edges(
                &edges_request(full_grid()),
                EdgesLimits::default(),
                Bound::new(atlas, proof, CutOffset::ZERO).view(atlas),
                UntouchedStore,
            )
            .expect("the masked grid serves"),
        expected_edges_bytes(generation, true, &columns),
    );
}

/// Every fixture identity translates exactly when visible (nodes) or when both endpoints are
/// (edges).
fn assert_translate_masks_by_visibility(atlas: &Atlas, proof: &VisibilityProof, hidden: &[u32]) {
    use crate::serve::translate::{TranslateLimits, TranslateRequest};

    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");
    let every_identity: Vec<String> = (0..universe)
        .map(|row| entity_string_of(u8::try_from(row).expect("fixture rows fit u8")))
        .chain((0..FIXTURE_EDGES.len()).map(|row| {
            entity_string_of(EDGE_SEED + u8::try_from(row).expect("fixture edge rows fit u8"))
        }))
        .collect();
    let translated = atlas
        .translate(
            TranslateRequest {
                entity_ids: every_identity,
            },
            TranslateLimits::default(),
            proof,
        )
        .expect("the request is under the cap");
    for row in 0..universe {
        let id = entity_string_of(u8::try_from(row).expect("fixture rows fit u8"));
        assert_eq!(
            translated.nodes.contains_key(&id),
            !hidden.contains(&row),
            "node {row} translates exactly when visible"
        );
    }
    for (row, &(_, source, target)) in FIXTURE_EDGES.iter().enumerate() {
        let id = entity_string_of(EDGE_SEED + u8::try_from(row).expect("edge rows fit u8"));
        let visible = !hidden.contains(&u32::try_from(source).expect("fixture rows fit u32"))
            && !hidden.contains(&u32::try_from(target).expect("fixture rows fit u32"));
        assert_eq!(
            translated.edges.contains_key(&id),
            visible,
            "edge {row} translates exactly when both endpoints show"
        );
    }
}

/// Every visible source's masked ego-graph is the fixture edge list filtered to visible partners.
///
/// Edges ascend by link-entity identity bytes (for the fixture, edge row), partners derive from
/// the delivered edges ascending wire row id, and `complete` stays `true` because visibility is not
/// truncation. Wherever the mask shrinks a source's incident set, a second probe caps the query at
/// exactly the visible cardinality. Hidden partners drop before selection, so the tight cap
/// truncates nothing and delivers the whole visible set, complete and independent of the truncation
/// key. Selecting first and masking after would come up short in exactly these configurations.
fn assert_locate_delivers_the_visible_ego_graph(
    atlas: &Atlas,
    proof: &VisibilityProof,
    hidden: &[u32],
) {
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");
    let limits = ServeLimits::default();
    let node_codec = test_codec(atlas);
    let bound = Bound::of(atlas, proof);
    let view = bound.view(atlas);

    for source_row in (0..universe).filter(|row| !hidden.contains(row)) {
        let source_id = entity_string_of(u8::try_from(source_row).expect("fixture rows fit u8"));
        let masked = atlas.locate_subgraph(
            atlas
                .resolve_source(&view, &source_id)
                .expect("a visible source resolves under the mask"),
            limits.locate,
            &view,
        );
        assert!(masked.complete, "visibility is not truncation");

        // Ground truth off the fixture edge list, one entry per edge
        // incident to the source whose partner is visible.
        let mut expected_edges: Vec<u32> = FIXTURE_EDGES
            .iter()
            .enumerate()
            .filter(|&(_, &(_, edge_source, edge_target))| {
                let incident =
                    edge_source == u64::from(source_row) || edge_target == u64::from(source_row);
                let partner = if edge_source == u64::from(source_row) {
                    edge_target
                } else {
                    edge_source
                };
                incident && !hidden.contains(&u32::try_from(partner).expect("fixture rows fit u32"))
            })
            .map(|(row, _)| narrow_usize(row))
            .collect();
        expected_edges.sort_unstable();
        let delivered: Vec<u32> = masked
            .edges
            .iter()
            .map(|&(edge, _)| narrow_usize(edge.row.get().as_usize()))
            .collect();
        assert_eq!(delivered, expected_edges, "ego({source_row}) edges");

        let mut partner_keys: Vec<(u32, u32)> = expected_edges
            .iter()
            .flat_map(|&row| {
                let (_, edge_source, edge_target) = FIXTURE_EDGES[row as usize];
                [
                    u32::try_from(edge_source).expect("fixture rows fit u32"),
                    u32::try_from(edge_target).expect("fixture rows fit u32"),
                ]
            })
            .filter(|&row| row != source_row)
            .map(|row| (node_codec.encode(NodeRowId::from_u32(row)).get(), row))
            .collect();
        partner_keys.sort_unstable();
        partner_keys.dedup();
        let mut expected_rows = vec![source_row];
        expected_rows.extend(partner_keys.iter().map(|&(_, row)| row));
        let delivered_rows: Vec<u32> = masked
            .rows
            .iter()
            .map(|row| narrow_usize(row.as_usize()))
            .collect();
        assert_eq!(delivered_rows, expected_rows, "ego({source_row}) rows");
        for row in &delivered_rows {
            assert!(!hidden.contains(row), "every delivered row is visible");
        }

        // Drop-before-cap, key-independent: whenever the mask shrank
        // this source's incident set, a cap of exactly the visible
        // cardinality still delivers every visible edge.
        let incident = FIXTURE_EDGES
            .iter()
            .filter(|&&(_, edge_source, edge_target)| {
                edge_source == u64::from(source_row) || edge_target == u64::from(source_row)
            })
            .count();
        if !expected_edges.is_empty() && expected_edges.len() < incident {
            let tight = crate::serve::locate::LocateLimits {
                edges: u32::try_from(expected_edges.len()).expect("the fixture edge count fits"),
                ..limits.locate
            };
            let capped = atlas.locate_subgraph(
                atlas
                    .resolve_source(&view, &source_id)
                    .expect("a visible source resolves under the mask"),
                tight,
                &view,
            );
            assert!(
                capped.complete,
                "a cap at the visible cardinality truncates nothing"
            );
            let capped_edges: Vec<u32> = capped
                .edges
                .iter()
                .map(|&(edge, _)| narrow_usize(edge.row.get().as_usize()))
                .collect();
            assert_eq!(
                capped_edges, expected_edges,
                "ego({source_row}) under the tight cap"
            );
        }
    }
}

/// Hidden and nonexistent answer identically at every id-bearing ingress, under any mask.
///
/// The sweep drives eight seeded random proofs over every hidden row, through each of the three
/// ingresses that accept an identifier. Those are locate by entity id, locate by wire row id, and
/// translate. The case compares each denied request with the same request naming something that
/// never existed - an unknown entity seed, a wire value outside the codec's image - and the answers
/// are equal values at the seam. The renderers downstream are deterministic functions of those
/// values, so equal values are equal response bytes: the collapse law, swept rather than sampled.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn hidden_and_nonexistent_collapse_at_every_id_bearing_ingress() {
    use crate::serve::translate::{TranslateLimits, TranslateRequest};

    let (_generation, atlas) = publish("p8-collapse").await;
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");
    let node_codec = test_codec(&atlas);
    let limits = ServeLimits::default();

    // Identifiers that never existed: an entity seed no fixture row
    // or edge carries, and the first wire value outside the image.
    let ghost_id = entity_string_of(203);
    let ghost_wire = (0..=u32::MAX)
        .find(|&wire| atlas.resolve(&FULL, codec::WireRow::pinned(wire)).is_none())
        .expect("the image has forty-eight values; almost everything is outside it");
    let by_row = |wire: u32| crate::serve::LocateRequest {
        entity_id: None,
        row: Some(codec::WireRow::pinned(wire)),
        colored_type_ids: Vec::new(),
    };
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0x9A08);

    for _ in 0..8 {
        let hidden: Vec<u32> = (0..universe).filter(|_| rng.random_ratio(1, 4)).collect();
        assert!(!hidden.is_empty(), "the seeded masks hide at least one row");
        let proof = mask_hiding(&atlas, &hidden);

        // The nonexistent baselines, once per proof: both ingress
        // domains answer unknown-entity for ids that never existed.
        assert_matches!(
            atlas.locate(
                &locate_request(ghost_id.clone()),
                limits,
                Bound::new(&atlas, &proof, CutOffset::ZERO).view(&atlas),
                UntouchedStore,
            ),
            Err(crate::serve::LocateError::UnknownEntity),
            "an unknown entity rejects",
        );
        assert_matches!(
            atlas.locate(
                &by_row(ghost_wire),
                limits,
                Bound::new(&atlas, &proof, CutOffset::ZERO).view(&atlas),
                UntouchedStore,
            ),
            Err(crate::serve::LocateError::UnknownEntity),
            "an out-of-image wire value rejects",
        );
        let missing_translated = atlas
            .translate(
                TranslateRequest {
                    entity_ids: vec![ghost_id.clone()],
                },
                TranslateLimits::default(),
                &proof,
            )
            .expect("the request is under the cap");

        for &row in &hidden {
            let id = entity_string_of(u8::try_from(row).expect("fixture rows fit u8"));

            // Denied and missing are one error: a hidden source
            // answers exactly the variant the ghost baselines did,
            // in both ingress domains.
            assert_matches!(
                atlas.locate(
                    &locate_request(id.clone()),
                    limits,
                    Bound::new(&atlas, &proof, CutOffset::ZERO).view(&atlas),
                    UntouchedStore,
                ),
                Err(crate::serve::LocateError::UnknownEntity),
                "a hidden source rejects",
            );
            assert_matches!(
                atlas.locate(
                    &by_row(node_codec.encode(NodeRowId::from_u32(row)).get()),
                    limits,
                    Bound::new(&atlas, &proof, CutOffset::ZERO).view(&atlas),
                    UntouchedStore,
                ),
                Err(crate::serve::LocateError::UnknownEntity),
                "the row ingress collapses the same way",
            );

            let denied = atlas
                .translate(
                    TranslateRequest {
                        entity_ids: vec![id],
                    },
                    TranslateLimits::default(),
                    &proof,
                )
                .expect("the request is under the cap");
            assert_eq!(
                denied, missing_translated,
                "a denied id translates exactly like one that never existed"
            );
        }
    }
}

/// The masked root publishes the visible view's own census, not the generation's.
///
/// The root tile's global map carries three corpus-wide aggregates, and each one resolves once
/// per scope rather than per request. This pins all three against an independent derivation over
/// the generation's own columns, under a mask chosen so that a census read off the artifacts
/// instead of off the view fails on every one of them:
///
/// The hidden set is exactly the rows attaining an extreme coordinate, so the visible extent is
/// strictly inside the generation's extent on all four edges - the fixture asserts that strictness
/// rather than assuming it, because a mask that vacates no edge could not fail on the defect.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn masked_root_publishes_the_visible_views_own_census() {
    let (generation, atlas) = publish("masked-census").await;
    let Artifacts {
        coordinates, rows, ..
    } = open_artifacts(&generation);
    let points = coordinates.points().expect("wire coordinates are points");
    let row_ids = fixture_row_ids(&rows);

    let (corpus, hidden) = extremes(points, &row_ids);
    assert!(
        !hidden.is_empty() && hidden.len() < points.len(),
        "the mask hides the extremes and leaves a non-empty view"
    );

    let proof = mask_hiding(&atlas, &hidden);
    let visible = |position: usize| !hidden.contains(&row_ids[position]);

    // The expectations come from the columns rather than the serve path, and they are the rows of
    // the view's own cascade at or below the root cut, the tight extent of the whole visible set,
    // and the deepest occupied scope bucket.
    let (expected_visible, expected_deepest) = super::schedule::reference::Schedule::new(
        super::schedule::reference::rows(&atlas, &proof),
        FIXTURE_LOD.span.get(),
        FIXTURE_LOD.max_tile_depth,
        0,
    )
    .global();
    let expected_extent = Bounds2::from_points(
        (0..points.len())
            .filter(|&position| visible(position))
            .map(|position| points[position]),
    )
    .expect("the masked view holds points");

    let edges = |bounds: &Bounds2| {
        [
            bounds.min().x(),
            bounds.min().y(),
            bounds.max().x(),
            bounds.max().y(),
        ]
    };

    // The witness must be able to fail on the defect it names: every edge of the visible extent
    // moved inward, so publishing the generation's extent here is a detectable answer.
    assert!(
        expected_extent.min().x() > corpus.min().x()
            && expected_extent.min().y() > corpus.min().y()
            && expected_extent.max().x() < corpus.max().x()
            && expected_extent.max().y() < corpus.max().y(),
        "the mask vacates all four extremes, so the view's extent is strictly inside the corpus's"
    );

    let masked_bytes = atlas
        .tile(
            &request(0, 0, 0, Mode::Delta),
            TileLimits::default(),
            Bound::new(&atlas, &proof, CutOffset::ZERO).view(&atlas),
        )
        .expect("the masked root serves");
    let (visible_count, extent, min_resolution) =
        head_global(section(&masked_bytes, HEAD).expect("HEAD is present"))
            .expect("the root publishes its global map");

    assert_eq!(
        visible_count, expected_visible,
        "the published count is the root schedule of the view's own cascade"
    );
    assert_eq!(
        extent,
        Some(edges(&expected_extent)),
        "the published extent is the visible set's own"
    );
    assert_eq!(
        min_resolution, expected_deepest,
        "the published depth is the deepest occupied scope bucket"
    );

    // And the unmasked root over the same generation publishes the corpus's own numbers, so the
    // three assertions above distinguish the view from the artifacts rather than restating them.
    let full_bytes = atlas
        .tile(
            &request(0, 0, 0, Mode::Delta),
            TileLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
        )
        .expect("the unmasked root serves");
    let (full_count, full_extent, _) =
        head_global(section(&full_bytes, HEAD).expect("HEAD is present"))
            .expect("the root publishes its global map");

    assert_eq!(
        full_extent,
        Some(edges(&corpus)),
        "the unmasked root publishes the generation's extent"
    );
    assert_ne!(extent, full_extent, "the census follows the view");
    assert!(
        visible_count < full_count,
        "the mask removed delivered points from the root's schedule"
    );
}

/// The census's unmasked fast path answers exactly what the walk answers.
///
/// [`Atlas::census`] reads the artifacts for a proof built as the full-visibility value and walks
/// the base column for a mask. A mask admitting *every* row of the generation is the one input both
/// regimes must agree on. It therefore pins the fast path against the general one. Both
/// constructors carry different digests by design, and their censuses may not differ at all.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn unmasked_census_agrees_with_the_walked_one() {
    let (_generation, atlas) = publish("census-regimes").await;

    let admits_everything = mask_hiding(&atlas, &[]);
    assert_ne!(
        FULL, admits_everything,
        "the two proofs are distinct values, so the agreement below is not an identity"
    );
    assert_eq!(
        atlas.census(&FULL),
        atlas.census(&admits_everything),
        "the artifact-read census and the walked census answer the same view"
    );
}

/// The masked root publishes the view's own depth, not the generation's.
///
/// This case accompanies the census witness above, which cannot fail on this clause. Hiding the
/// extreme coordinates leaves the deepest occupied bucket populated, so the visible depth and the
/// corpus depth coincide there and a census ignoring the mask would answer correctly by accident.
/// This case hides exactly the deepest bucket's rows, so the two must part.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn masked_root_publishes_the_views_own_depth() {
    let (generation, atlas) = publish("masked-depth").await;
    let Artifacts { morton, rows, .. } = open_artifacts(&generation);
    let row_ids = fixture_row_ids(&rows);
    let lengths = morton.fenceposts().lengths();

    // The generation's deepest occupied bucket, and the positions inside it.
    let (deepest, _) = lengths
        .iter()
        .enumerate()
        .rfind(|&(_, &length)| length > 0)
        .expect("the fixture occupies a bucket");
    let start: u64 = lengths[..deepest].iter().sum();
    let start = usize::try_from(start).expect("fixture counts fit usize");
    let end = start + usize::try_from(lengths[deepest]).expect("fixture counts fit usize");

    let mut hidden: Vec<u32> = (start..end).map(|position| row_ids[position]).collect();
    hidden.sort_unstable();
    hidden.dedup();

    // The next occupied bucket below is where the view's depth must land.
    let expected = lengths[..deepest]
        .iter()
        .enumerate()
        .rfind(|&(_, &length)| length > 0)
        .map_or(0, |(bucket, _)| bucket as u64);
    assert!(
        expected < deepest as u64,
        "the witness must be able to fail: the mask has to vacate the deepest bucket"
    );

    let bytes = atlas
        .tile(
            &request(0, 0, 0, Mode::Delta),
            TileLimits::default(),
            Bound::new(&atlas, &mask_hiding(&atlas, &hidden), CutOffset::ZERO).view(&atlas),
        )
        .expect("the masked root serves");
    let (_, _, min_resolution) = head_global(section(&bytes, HEAD).expect("HEAD is present"))
        .expect("the root publishes its global map");

    assert_eq!(
        min_resolution, expected,
        "the published depth is the deepest bucket holding a VISIBLE point"
    );
}
