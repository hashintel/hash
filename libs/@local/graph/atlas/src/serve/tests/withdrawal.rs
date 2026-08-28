//! Admission-subtraction witnesses: the ingress snapshot's withdrawn rows leave served tiles.
//!
//! Every case runs the served assembly path with a real published snapshot, folded from feed
//! events exactly as the consumer folds them, so the witnesses cover the crossing from feed
//! events to served bytes rather than the subtraction walk alone. The corpus-proof case is the
//! exposure the register exists to close, because `full_visibility` builds no masks and nothing
//! else subtracts on that path. Each case carries a same-path negative control, which repeats the
//! request and the walk under a snapshot whose withdrawals touch nothing the tile delivers.
//!
//! The fold cases pin the law's resolution-time form. A folded scoped proof and the admission
//! walk hide the same withdrawn rows, a corpus proof declines the fold whole, and the root's
//! global aggregates follow the folded view. The split's other half - the issuance's occupancy
//! input ignoring the fold - is the cache entry's own contract, witnessed beside its type.

use hashql_core::{
    collections::fast_hash_set,
    id::{Id as _, IdSlice},
};

use super::{
    Artifacts, Atlas, Bound, EdgesLimits, FIXTURE_LOD, FULL, HEAD, HashSet, Mode, ROW_IDS,
    TileHead, TileLimits, TileResponse, UntouchedStore, coordinate_of, edges_request,
    expected_edges_bytes, extremes_vacating_a_root_cell, fixture_row_ids, head_global, mask_hiding,
    open_artifacts, open_edge_artifacts, publish, qualifying_columns, request, section, test_codec,
    walk, wire_columns, withdrawing,
};
use crate::{
    bitset::CompressedBitSet,
    identity::{BasePosition, EdgeRowId, NodeRowId},
    math::{Bounds2, Vec2},
    morton::{Depth, MortonCell},
    salt::wire::tile::{DeliveredSet, GlobalHead, TileCoordinate},
    serve::{
        VisibilityProof,
        delta::{DeltaSnapshot, PlacementCohort},
        walk::full::occupied_children,
    },
};

/// Serves one tile under `proof` with `delta` as the request's ingress capture.
fn tile_with(
    atlas: &Atlas,
    proof: &crate::serve::VisibilityProof,
    delta: Option<&DeltaSnapshot>,
    tile: &crate::serve::TileRequest,
) -> Vec<u8> {
    let mut bound = Bound::of(atlas, proof);
    if let Some(delta) = delta {
        bound = bound.withdrawing(delta);
    }

    atlas
        .tile(tile, TileLimits::default(), bound.view(atlas))
        .expect("the fixture tile serves")
}

/// The corpus-proof root subtracts a withdrawn row, splitting its delivered range.
///
/// Byte-exact against the encoder. The withdrawn position leaves the range and the owning run
/// decrements, while the root's global aggregates stay generation-computed. A control snapshot
/// withdrawing a fitted row the root does not deliver walks the same subtraction to identical
/// bytes, and one withdrawing an unfitted identity skips the walk whole.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn corpus_subtract_splits_range() {
    let (generation, atlas) = publish("withdrawal-root").await;
    let Artifacts {
        quad,
        morton,
        coordinates,
        rows,
    } = open_artifacts(&generation);
    let points = coordinates.points().expect("wire coordinates are points");
    let row_ids = fixture_row_ids(&rows);

    // The root delta delivers buckets `0..=span` as one contiguous range.
    let lengths = &morton.fenceposts().lengths()[..=usize::from(FIXTURE_LOD.span.get())];
    let delivered: u64 = lengths.iter().sum();
    let end = u32::try_from(delivered).expect("fixture counts fit u32");
    assert!(delivered > 2, "the witness needs an interior position");

    // Withdraw the row at base position 1, an interior position of the root's range, so the
    // subtraction must split rather than trim.
    let withdrawn_position = 1_usize;
    let seed = u8::try_from(row_ids[withdrawn_position]).expect("fixture rows fit u8");
    let snapshot = withdrawing(&atlas, &[seed]);
    assert!(snapshot.withdraws_any_node(), "the fold resolved the row");

    let tile = request(0, 0, 0, Mode::Delta);
    let bytes = tile_with(&atlas, &FULL, Some(&snapshot), &tile);

    // Position 1's owning run is bucket 0 when that bucket holds more than one point, and the
    // next occupied bucket otherwise.
    let mut runs: Vec<u32> = lengths
        .iter()
        .map(|&length| u32::try_from(length).expect("fixture counts fit u32"))
        .collect();
    let mut consumed = 0_u32;
    let owner = runs
        .iter()
        .position(|&run| {
            consumed += run;
            consumed > 1
        })
        .expect("the root delivers past position 1");
    runs[owner] -= 1;

    let node_codec = test_codec(&atlas);
    let wire_rows: Vec<_> = row_ids
        .iter()
        .map(|&row| node_codec.encode(NodeRowId::from_u32(row), atlas.node_universe()))
        .collect();
    let expected = TileResponse {
        head: TileHead {
            generation: atlas.generation().digest(),
            variant: 0,
            coordinate: TileCoordinate { z: 0, x: 0, y: 0 },
            mode: Mode::Delta,
            first_bucket: 0,
            runs: &runs,
            // The corpus aggregates stay generation-computed. A withdrawn extreme point keeps
            // stretching the reported extent until refit, and the corpus census never subtracts.
            global: Some(GlobalHead {
                visible: delivered,
                bounds: Some(
                    Bounds2::new(Vec2::new(-1.0, -1.0), Vec2::new(1.0, 1.0))
                        .expect("the wire square is a valid extent"),
                ),
                min_resolution: morton
                    .fenceposts()
                    .lengths()
                    .iter()
                    .rposition(|&length| length > 0)
                    .map_or(0, |bucket| bucket as u64),
            }),
            children: (0..4).fold(0_u8, |bits, quadrant| {
                bits | (u8::from(quad.nodes()[0].child(quadrant).is_some()) << quadrant)
            }),
        },
        delivered: DeliveredSet::Ranges(&[
            BasePosition::from_u32(0)..BasePosition::from_u32(1),
            BasePosition::from_u32(2)..BasePosition::from_u32(end),
        ]),
        positions: IdSlice::from_raw(points),
        rows: IdSlice::from_raw(&wire_rows),
        arrivals: IdSlice::from_raw(&[]),
        masks: None,
        trailer: None,
    }
    .encode();
    assert_eq!(bytes, expected, "the split subtraction is byte-exact");

    // Same-path control: a fitted row past the root's cut walks the same subtraction and
    // changes nothing this tile serves.
    let baseline = tile_with(&atlas, &FULL, None, &tile);
    let undelivered = u8::try_from(row_ids[usize::try_from(delivered).expect("counts fit usize")])
        .expect("fixture rows fit u8");
    let deeper = withdrawing(&atlas, &[undelivered]);
    assert!(deeper.withdraws_any_node(), "the control resolves a row");
    assert_eq!(
        tile_with(&atlas, &FULL, Some(&deeper), &tile),
        baseline,
        "withdrawing an undelivered row moves no byte",
    );

    // Skip-path control: an unfitted identity resolves into no row bitset, so the walk skips.
    let unfitted = withdrawing(&atlas, &[0xC8]);
    assert!(!unfitted.withdraws_any_node(), "nothing resolved to a row");
    assert_eq!(
        tile_with(&atlas, &FULL, Some(&unfitted), &tile),
        baseline,
        "an empty withdrawn projection serves the baseline bytes",
    );
}

/// A scoped view's gathered delivery drops the withdrawn point and only that point.
///
/// The scoped root gathers positions from the scope cascade, the list-shaped delivered set. The
/// witness reads the served columns. The withdrawn wire id leaves `ROW_IDS` while the count
/// drops by exactly one, and the encoder's `sum(runs) == delivered` assertion has already
/// vouched for the head. The negative control withdraws a row the mask already hides, through
/// the same path.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn scoped_drops_withdrawn_only() {
    let (generation, atlas) = publish("withdrawal-scoped").await;
    let Artifacts { rows, .. } = open_artifacts(&generation);
    let row_ids = fixture_row_ids(&rows);

    // A masked proof, so the view serves its own cascade in the gathered shape.
    let hidden = 0_u32;
    let proof = mask_hiding(&atlas, &[hidden]);
    let withdrawn = row_ids[1];
    assert_ne!(withdrawn, hidden, "the witness row must stay visible");
    let seed = u8::try_from(withdrawn).expect("fixture rows fit u8");

    let tile = request(0, 0, 0, Mode::Delta);
    let baseline = tile_with(&atlas, &proof, None, &tile);
    let subtracted = tile_with(&atlas, &proof, Some(&withdrawing(&atlas, &[seed])), &tile);

    let decode = |bytes: &[u8]| -> Vec<u32> {
        let (chunks, remainder) = section(bytes, ROW_IDS)
            .expect("ROW_IDS is present")
            .as_chunks::<4>();
        assert!(remainder.is_empty(), "row sections are whole u32 columns");
        chunks.iter().copied().map(u32::from_le_bytes).collect()
    };

    let node_codec = test_codec(&atlas);
    let wire = node_codec
        .encode(NodeRowId::from_u32(withdrawn), atlas.node_universe())
        .get();
    let before = decode(&baseline);
    let after = decode(&subtracted);
    assert!(before.contains(&wire), "the baseline delivers the row");
    assert!(!after.contains(&wire), "the withdrawn row leaves the wire");
    assert_eq!(after.len(), before.len() - 1, "only that point leaves");

    // Same-path control: withdrawing the row the mask already hides subtracts nothing, because
    // the cascade never delivered it. Fixture node row `r` owns seed `r`, so the hidden row's
    // identity is its own row id.
    let masked_seed = u8::try_from(hidden).expect("fixture rows fit u8");
    assert_eq!(
        tile_with(
            &atlas,
            &proof,
            Some(&withdrawing(&atlas, &[masked_seed])),
            &tile
        ),
        baseline,
        "a hidden row's withdrawal moves no byte",
    );
}

/// A tile whose whole delivered set withdraws serves the existing empty shape.
///
/// The run keeps its positional slot at zero, the range list empties, and the head's
/// generation-computed structure (`children` included) stays what the artifacts say, exactly as
/// the wire's zero-length-entry law reads. The negative control is the baseline: the same cell
/// with no snapshot serves its full run.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn all_withdrawn_empty_shape() {
    let (generation, atlas) = publish("withdrawal-empty").await;
    let Artifacts {
        quad,
        morton: _,
        coordinates,
        rows,
    } = open_artifacts(&generation);
    let points = coordinates.points().expect("wire coordinates are points");
    let row_ids = fixture_row_ids(&rows);

    // A populated non-root cell, whose delta delivery is the node's own run.
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("the root cell exists");
    let mut nodes = Vec::new();
    walk(&quad, 0, root, &mut nodes);
    let (node, cell) = nodes[1..]
        .iter()
        .copied()
        .find(|&(node, _)| {
            let run = quad.nodes()[node as usize].run();
            run.end > run.start
        })
        .expect("the fixture quadtree has a populated non-root node");
    let run = quad.nodes()[node as usize].run();
    let coordinate = coordinate_of(cell);

    let seeds: Vec<u8> = run
        .map(|position| {
            u8::try_from(row_ids[usize::try_from(position).expect("fixture positions fit usize")])
                .expect("fixture rows fit u8")
        })
        .collect();
    let snapshot = withdrawing(&atlas, &seeds);

    let tile = request(coordinate.z, coordinate.x, coordinate.y, Mode::Delta);
    let bytes = tile_with(&atlas, &FULL, Some(&snapshot), &tile);

    let expected = TileResponse {
        head: TileHead {
            generation: atlas.generation().digest(),
            variant: 0,
            coordinate,
            mode: Mode::Delta,
            first_bucket: coordinate.z + FIXTURE_LOD.span.get(),
            runs: &[0],
            global: None,
            children: occupied_children(&quad.nodes()[node as usize]),
        },
        delivered: DeliveredSet::Ranges(&[]),
        positions: IdSlice::from_raw(points),
        rows: IdSlice::from_raw(&[]),
        arrivals: IdSlice::from_raw(&[]),
        masks: None,
        trailer: None,
    }
    .encode();
    assert_eq!(bytes, expected, "the empty shape is the existing one");

    let baseline = tile_with(&atlas, &FULL, None, &tile);
    assert_ne!(baseline, bytes, "the baseline still serves the run");
}

/// Edges subtract withdrawn endpoints from the bounding set and withdrawn links at the rule site.
///
/// Byte-exact against the independent derivation the existing edges witnesses use. A withdrawn
/// endpoint kills every edge at it, a withdrawn link dies while both endpoints keep serving, and
/// the control snapshot withdrawing an unfitted identity leaves the baseline bytes.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn edges_subtract_withdrawn_endpoints_and_links() {
    let (generation, atlas) = publish("withdrawal-edges").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = fixture_row_ids(&artifacts.rows);
    let edge_artifacts = open_edge_artifacts(&generation);
    let endpoints = edge_artifacts
        .endpoints
        .u64_le_pairs()
        .expect("the endpoint column is little-endian u64 pairs");
    let endpoints: Vec<[u64; 2]> = endpoints
        .iter()
        .map(|pair| pair.map(zerocopy::U64::get))
        .collect();
    let endpoints = endpoints.as_slice();

    // The root delivers buckets 0..=m, the head of the base order.
    let head: u64 = artifacts.morton.fenceposts().lengths()[..=usize::from(FIXTURE_LOD.span.get())]
        .iter()
        .sum();
    let head = usize::try_from(head).expect("fixture counts fit usize");
    let delivered: HashSet<u32> = row_ids[..head].iter().copied().collect();

    let root = TileCoordinate { z: 0, x: 0, y: 0 };
    let serve = |delta: Option<&DeltaSnapshot>| -> Vec<u8> {
        let mut bound = Bound::of(&atlas, &FULL);
        if let Some(delta) = delta {
            bound = bound.withdrawing(delta);
        }

        atlas
            .edges(
                &edges_request(vec![root]),
                EdgesLimits::default(),
                bound.view(&atlas),
                UntouchedStore,
            )
            .expect("the fixture edges serve")
    };

    let baseline = serve(None);
    let (sources, targets, edge_rows) = qualifying_columns(endpoints, &delivered);
    assert!(!edge_rows.is_empty(), "the witness needs a delivered edge");
    assert_eq!(
        baseline,
        expected_edges_bytes(
            &generation,
            true,
            &wire_columns(&atlas, &sources, &targets, &edge_rows),
        ),
        "the baseline anchors the derivation",
    );

    // A withdrawn endpoint leaves the bounding set, killing every edge at it.
    let endpoint = sources[0];
    let survivors: HashSet<u32> = delivered
        .iter()
        .copied()
        .filter(|&row| row != endpoint)
        .collect();
    let (sources_after, targets_after, rows_after) = qualifying_columns(endpoints, &survivors);
    assert!(
        rows_after.len() < edge_rows.len(),
        "the withdrawn endpoint carried at least one edge",
    );
    let node_seed = u8::try_from(endpoint).expect("fixture rows fit u8");
    assert_eq!(
        serve(Some(&withdrawing(&atlas, &[node_seed]))),
        expected_edges_bytes(
            &generation,
            true,
            &wire_columns(&atlas, &sources_after, &targets_after, &rows_after),
        ),
        "an endpoint withdrawal kills its edges",
    );

    // A withdrawn link dies as a tombstone while both endpoints keep serving.
    let tombstone = edge_rows[0];
    let mut sources_kept = Vec::new();
    let mut targets_kept = Vec::new();
    let mut rows_kept = Vec::new();
    for ((&source, &target), &row) in sources.iter().zip(&targets).zip(&edge_rows) {
        if row != tombstone {
            sources_kept.push(source);
            targets_kept.push(target);
            rows_kept.push(row);
        }
    }
    let link_seed = super::EDGE_SEED + u8::try_from(tombstone).expect("fixture edge rows fit u8");
    assert_eq!(
        serve(Some(&withdrawing(&atlas, &[link_seed]))),
        expected_edges_bytes(
            &generation,
            true,
            &wire_columns(&atlas, &sources_kept, &targets_kept, &rows_kept),
        ),
        "a link tombstone dies while its endpoints survive",
    );

    // Same-path control: an unfitted identity resolves to no row and moves no byte.
    assert_eq!(
        serve(Some(&withdrawing(&atlas, &[0xC8]))),
        baseline,
        "an unresolved withdrawal serves the baseline bytes",
    );
}

/// Locate answers a withdrawn source as nonexistent and drops a withdrawn partner's edges.
///
/// Both ingress paths converge on the source check, and the incident walk reaches candidates
/// through the one edge-rule site, so a partner's withdrawal kills its edge with no second
/// mechanism. The control withdraws an identity the subgraph never touches.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_withdrawn_refusal() {
    let (_generation, atlas) = publish("withdrawal-locate").await;

    // Fixture node row 3 carries exactly one edge, to node row 7.
    let source_seed = 3_u8;
    let partner_seed = 7_u8;
    let source_id = super::entity_string_of(source_seed);
    let limits = crate::serve::LocateLimits::default();

    let baseline_bound = Bound::of(&atlas, &FULL);
    let baseline_view = baseline_bound.view(&atlas);
    let source = atlas
        .resolve_source(&baseline_view, &source_id)
        .expect("the fixture source resolves");
    let baseline = atlas.locate_subgraph(source, limits, &baseline_view);
    assert_eq!(baseline.edges.len(), 1, "row 3 carries exactly one edge");

    // A withdrawn source answers as nonexistent on both ingress paths.
    let source_gone = withdrawing(&atlas, &[source_seed]);
    let bound = Bound::of(&atlas, &FULL).withdrawing(&source_gone);
    let view = bound.view(&atlas);
    assert!(
        atlas.resolve_source(&view, &source_id).is_none(),
        "a withdrawn source is unknown",
    );
    let wire = test_codec(&atlas).encode(
        NodeRowId::from_u32(u32::from(source_seed)),
        atlas.node_universe(),
    );
    assert!(
        atlas.resolve_wire_source(&view, wire).is_none(),
        "the wire-keyed path refuses the same way",
    );

    // A withdrawn partner's edge leaves the incident set through the edge-rule site.
    let partner_gone = withdrawing(&atlas, &[partner_seed]);
    let bound = Bound::of(&atlas, &FULL).withdrawing(&partner_gone);
    let view = bound.view(&atlas);
    let source = atlas
        .resolve_source(&view, &source_id)
        .expect("the source itself stays resolvable");
    let subgraph = atlas.locate_subgraph(source, limits, &view);
    assert!(
        subgraph.edges.is_empty(),
        "the withdrawn partner's edge leaves the ego graph",
    );

    // Same-path control: withdrawing an identity outside the subgraph moves nothing.
    let unrelated = withdrawing(&atlas, &[9]);
    let bound = Bound::of(&atlas, &FULL).withdrawing(&unrelated);
    let view = bound.view(&atlas);
    let source = atlas
        .resolve_source(&view, &source_id)
        .expect("the control leaves the source resolvable");
    let control = atlas.locate_subgraph(source, limits, &view);
    assert_eq!(control.edges, baseline.edges, "the ego graph is untouched");
    assert_eq!(
        control.delivered, baseline.delivered,
        "the partners are untouched"
    );
}

/// Translate answers a withdrawn identity as an absent key in either domain, and a fitted
/// edge dies with its withdrawn endpoints.
///
/// The identity-domain check runs right after parse, before any row resolution, and the witness
/// runs under full visibility, the path with no mask width to refuse a row, so cohort and
/// snapshot discipline are its only boundary. The fixture edge is edge row 0, endpoints node
/// rows 0 and 1, so withdrawing seed 0 kills it at its source and seed 1 at its target - the
/// next-request death law the neighbourhood read applies. The control withdraws an identity
/// the request never names, no endpoint among them, and must leave the response equal.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn translate_answers_withdrawn_identities_as_absent_keys() {
    use crate::serve::translate::{TranslateLimits, TranslateRequest};

    let (_generation, atlas) = publish("withdrawal-translate").await;
    let node_id = super::entity_string_of(0);
    let edge_id = super::entity_string_of(super::EDGE_SEED);
    let ask = || TranslateRequest {
        entity_ids: vec![node_id.clone(), edge_id.clone()],
    };
    let translate = |delta: Option<&DeltaSnapshot>| {
        atlas
            .translate(
                ask(),
                TranslateLimits::default(),
                &FULL,
                delta,
                PlacementCohort::EMPTY,
            )
            .expect("the request is under the cap")
    };

    let baseline = translate(None);
    assert!(baseline.nodes.contains_key(&node_id), "the node resolves");
    assert!(baseline.edges.contains_key(&edge_id), "the edge resolves");

    // A withdrawn node identity leaves the nodes map and kills the fitted edge at its
    // source endpoint in the same request.
    let node_gone = translate(Some(&withdrawing(&atlas, &[0])));
    assert!(!node_gone.nodes.contains_key(&node_id), "an absent key");
    assert!(
        !node_gone.edges.contains_key(&edge_id),
        "the edge dies with its withdrawn source endpoint"
    );

    // The target endpoint kills it the same way, while the un-withdrawn node keeps resolving.
    let target_gone = translate(Some(&withdrawing(&atlas, &[1])));
    assert!(
        !target_gone.edges.contains_key(&edge_id),
        "the edge dies with its withdrawn target endpoint"
    );
    assert_eq!(target_gone.nodes, baseline.nodes, "the node still resolves");

    // A withdrawn link identity leaves the edges map, the node untouched.
    let edge_gone = translate(Some(&withdrawing(&atlas, &[super::EDGE_SEED])));
    assert!(!edge_gone.edges.contains_key(&edge_id), "an absent key");
    assert_eq!(edge_gone.nodes, baseline.nodes, "the node still resolves");

    // Same-path control: a withdrawal the request never names moves nothing.
    assert_eq!(
        translate(Some(&withdrawing(&atlas, &[9]))),
        baseline,
        "an unrelated withdrawal leaves the response equal",
    );
}

/// A folded scoped proof delivers the subtracted rows, and subtracting over it moves no byte.
///
/// The claims split by width on purpose. Subtracting the snapshot a proof already folded is
/// byte-exact vacuous, because no delivered set holds a folded row - the identity the skip
/// rests on. Across the fold boundary itself the withdrawn row is absent either way, and the
/// folded cascade may deliver more: the schedule re-levels over the visible rows, promoting a
/// row into the slot the withdrawal freed where the subtracted document keeps the gap - the
/// same refresh-boundary semantics arrivals already have. The control folds a snapshot whose
/// one withdrawal the mask already hides, which must move no byte.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn a_folded_proof_delivers_the_subtracted_rows_with_nothing_to_subtract() {
    let (_generation, atlas) = publish("withdrawal-fold").await;

    // The withdrawn row sits at base position 1, inside the head the root delivers. Fixture
    // node row `r` owns seed `r`, so its identity withdraws as its own row id.
    let hidden = 0_u8;
    let withdrawn = atlas.rows.view()[BasePosition::from_u32(1)].as_u32();
    assert_ne!(
        withdrawn,
        u32::from(hidden),
        "the witness row must stay visible"
    );
    let seed = u8::try_from(withdrawn).expect("fixture rows fit u8");

    let proof = mask_hiding(&atlas, &[u32::from(hidden)]);
    let snapshot = withdrawing(&atlas, &[seed]);
    let tile = request(0, 0, 0, Mode::Delta);

    let mut folded = proof.clone();
    folded.fold_withdrawn(&snapshot);

    let baseline = tile_with(&atlas, &proof, None, &tile);
    let served = tile_with(&atlas, &folded, None, &tile);
    assert_eq!(
        served,
        tile_with(&atlas, &folded, Some(&snapshot), &tile),
        "subtracting the folded snapshot moves no byte",
    );
    assert_ne!(served, baseline, "the folded withdrawal bites");

    let rows_of = |bytes: &[u8]| -> Vec<u32> {
        let (chunks, remainder) = section(bytes, ROW_IDS)
            .expect("ROW_IDS is present")
            .as_chunks::<4>();
        assert!(remainder.is_empty(), "row sections are whole u32 columns");
        chunks.iter().copied().map(u32::from_le_bytes).collect()
    };
    let wire = test_codec(&atlas)
        .encode(NodeRowId::from_u32(withdrawn), atlas.node_universe())
        .get();
    let folded_rows = rows_of(&served);
    let subtracted_rows = rows_of(&tile_with(&atlas, &proof, Some(&snapshot), &tile));
    assert!(
        !folded_rows.contains(&wire) && !subtracted_rows.contains(&wire),
        "the withdrawn row leaves both routes' wires",
    );
    assert!(
        subtracted_rows.iter().all(|row| folded_rows.contains(row)),
        "the folded cascade delivers every subtracted survivor, backfill aside",
    );

    // Same-path control: folding a withdrawal of the row the mask already hides is the vacuous
    // fold, because the mask never admitted it.
    let mut vacuous = proof;
    vacuous.fold_withdrawn(&withdrawing(&atlas, &[hidden]));
    assert_eq!(
        tile_with(&atlas, &vacuous, None, &tile),
        baseline,
        "a fold of hidden rows moves no byte",
    );
}

/// The withdrawal seeds that part every root aggregate from the unfolded view's.
///
/// The set withdraws the rows attaining the extent's four extremes, the rest of one root cell,
/// and every row of the deepest occupied bucket, so the extent, the count, and the depth all
/// part from the unfolded view's, and an aggregate that fails to follow the fold is a detectable
/// answer on each axis. The root cell is what parts the count on any layout, because a cell
/// keeping one surviving row keeps its representative and delivers the same number of rows as
/// before. Returns the corpus extent and the withdrawn rows beside their seeds.
fn aggregate_parting_seeds(
    atlas: &Atlas,
    points: &[Vec2],
    row_ids: &[u32],
    morton: &super::MortonFile,
) -> (Bounds2, Vec<u32>, Vec<u8>) {
    let (corpus, mut withdrawn) = extremes_vacating_a_root_cell(atlas, points, row_ids);
    let lengths = morton.fenceposts().lengths();
    let (deepest, _) = lengths
        .iter()
        .enumerate()
        .rfind(|&(_, &length)| length > 0)
        .expect("the fixture occupies a bucket");
    let start: u64 = lengths[..deepest].iter().sum();
    let start = usize::try_from(start).expect("fixture counts fit usize");
    let end = start + usize::try_from(lengths[deepest]).expect("fixture counts fit usize");
    withdrawn.extend((start..end).map(|position| row_ids[position]));
    withdrawn.sort_unstable();
    withdrawn.dedup();
    assert!(
        !withdrawn.is_empty() && withdrawn.len() < points.len(),
        "the snapshot withdraws the extremes and the deepest bucket and leaves a non-empty view"
    );
    let seeds: Vec<u8> = withdrawn
        .iter()
        .map(|&row| u8::try_from(row).expect("fixture rows fit u8"))
        .collect();
    (corpus, withdrawn, seeds)
}

/// The scoped root's aggregates follow the fold.
///
/// The fold rewrites the proof's masks, so the scoped census and cascade - the root's global
/// map, extent included - describe the surviving rows rather than the resolution's. A withdrawn
/// row aggregates exactly as a hidden row does: the scoped cascade is visible-only, and the
/// aggregates follow the view. The same view unfolded publishes the resolution's own numbers on
/// every axis, so each equality distinguishes the folded view rather than restating it. The
/// owner ruled the aggregate split at the fold's landing, so the witness pins settled law.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn the_folded_scoped_root_publishes_the_folded_views_aggregates() {
    let (generation, atlas) = publish("withdrawal-fold-aggregates").await;
    let Artifacts {
        coordinates,
        rows,
        morton,
        ..
    } = open_artifacts(&generation);
    let points = coordinates.points().expect("wire coordinates are points");
    let row_ids = fixture_row_ids(&rows);

    let (corpus, withdrawn, seeds) = aggregate_parting_seeds(&atlas, points, &row_ids, &morton);
    let snapshot = withdrawing(&atlas, &seeds);
    assert!(snapshot.withdraws_any_node(), "the fold resolved the rows");

    let proof = mask_hiding(&atlas, &[]);
    let mut folded = proof.clone();
    folded.fold_withdrawn(&snapshot);

    // The expectations come from the columns and the schedule reference over the folded view:
    // the rows of its cascade at or below the root cut, the tight extent of the surviving set,
    // and the deepest occupied scope bucket.
    let survives = |position: usize| !withdrawn.contains(&row_ids[position]);
    let expected_extent = Bounds2::from_points(
        (0..points.len())
            .filter(|&position| survives(position))
            .map(|position| points[position]),
    )
    .expect("the folded view holds points");
    assert!(
        expected_extent.min().x() > corpus.min().x()
            && expected_extent.min().y() > corpus.min().y()
            && expected_extent.max().x() < corpus.max().x()
            && expected_extent.max().y() < corpus.max().y(),
        "the withdrawal vacates all four extremes, so the folded extent is strictly inside"
    );
    let (expected_visible, expected_deepest) = super::schedule::reference::Schedule::new(
        super::schedule::reference::rows(&atlas, &folded),
        FIXTURE_LOD.span.get(),
        FIXTURE_LOD.max_tile_depth,
        0,
    )
    .global();

    let tile = request(0, 0, 0, Mode::Delta);
    let (visible, extent, min_resolution) = head_global(
        section(&tile_with(&atlas, &folded, None, &tile), HEAD).expect("HEAD is present"),
    )
    .expect("the root publishes its global map");

    assert_eq!(
        visible, expected_visible,
        "the published count is the root schedule of the folded view's own cascade"
    );
    assert_eq!(
        extent,
        Some([
            expected_extent.min().x(),
            expected_extent.min().y(),
            expected_extent.max().x(),
            expected_extent.max().y(),
        ]),
        "the published extent is the folded view's own"
    );
    assert_eq!(
        min_resolution, expected_deepest,
        "the published depth is the folded view's deepest occupied scope bucket"
    );

    // And the same view unfolded publishes the resolution's own numbers, so the assertions
    // above distinguish the folded view from the unfolded one rather than restating it. A
    // failure here is fixture drift - the withdrawal set no longer moves the aggregate - not a
    // defect in the fold.
    let (bare_visible, bare_extent, bare_depth) = head_global(
        section(&tile_with(&atlas, &proof, None, &tile), HEAD).expect("HEAD is present"),
    )
    .expect("the root publishes its global map");
    assert_ne!(
        extent, bare_extent,
        "fixture drift: the withdrawal set no longer moves the root extent, so the folded-extent \
         equality above has lost its teeth"
    );
    assert!(
        visible < bare_visible,
        "fixture drift: the withdrawal set no longer removes delivered points, so the \
         folded-count equality above has lost its teeth"
    );
    assert!(
        min_resolution < bare_depth,
        "fixture drift: the withdrawal set no longer vacates the deepest occupied bucket, so the \
         folded-depth equality above has lost its teeth"
    );
}

/// The corpus root's aggregates stay generation-computed under the same withdrawal.
///
/// The corpus arm serves the withdrawal as an ingress subtraction: full domains decline the
/// fold and the unmasked census reads the artifacts, so a withdrawn extreme point keeps
/// stretching the corpus extent until refit. One snapshot therefore pins both regimes against
/// the scoped witness above, recording the split the owner ruled at the fold's landing.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn corpus_root_aggregates_ignore_fold() {
    let (generation, atlas) = publish("withdrawal-fold-corpus-aggregates").await;
    let Artifacts {
        coordinates,
        rows,
        morton,
        ..
    } = open_artifacts(&generation);
    let points = coordinates.points().expect("wire coordinates are points");
    let row_ids = fixture_row_ids(&rows);

    let (_, _, seeds) = aggregate_parting_seeds(&atlas, points, &row_ids, &morton);
    let snapshot = withdrawing(&atlas, &seeds);
    assert!(snapshot.withdraws_any_node(), "the fold resolved the rows");

    let tile = request(0, 0, 0, Mode::Delta);
    let full_baseline = head_global(
        section(&tile_with(&atlas, &FULL, None, &tile), HEAD).expect("HEAD is present"),
    );
    assert_eq!(
        head_global(
            section(&tile_with(&atlas, &FULL, Some(&snapshot), &tile), HEAD)
                .expect("HEAD is present"),
        ),
        full_baseline,
        "the corpus aggregates stay generation-computed under the same withdrawal"
    );
}

/// The fold leaves a corpus proof admitting everything.
///
/// Full domains carry no mask to fold, and narrowing one would turn the operator's declared
/// authority into a scope. The admission walk stays that proof's whole withdrawal authority,
/// which the corpus-proof subtraction witnesses above already pin.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn the_fold_leaves_a_corpus_proof_admitting_everything() {
    let (_generation, atlas) = publish("withdrawal-fold-corpus").await;

    let mut folded = FULL.clone();
    folded.fold_withdrawn(&withdrawing(&atlas, &[1]));

    assert_eq!(folded, FULL, "full domains stay full through the fold");
}

/// The fold removes a link tombstone's row and a withdrawn admitted delta identity.
///
/// The tombstone's endpoints keep serving, because a link carries authorization its endpoints do
/// not imply and a withdrawal runs the same domains in reverse. The admitted delta-link set drops
/// exactly the withdrawn identity, and its sibling stays.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn the_fold_removes_link_tombstones_and_withdrawn_delta_identities() {
    let (_generation, atlas) = publish("withdrawal-fold-links").await;

    // In the edge domain, the tombstone's row leaves the folded mask and its endpoints stay.
    let edge = EdgeRowId::from_u32(0);
    let [source, target] = atlas.endpoint_pairs()[edge];
    let mut folded = mask_hiding(&atlas, &[]);
    assert!(
        folded.verify_edge(edge, source, target).is_some(),
        "the mask admits the link before the fold",
    );

    folded.fold_withdrawn(&withdrawing(&atlas, &[super::EDGE_SEED]));
    assert!(
        folded.verify_edge(edge, source, target).is_none(),
        "the folded mask refuses the tombstone's row",
    );
    assert!(
        folded.verify(source).is_some() && folded.verify(target).is_some(),
        "a link tombstone leaves its endpoints serving",
    );

    // An unfitted withdrawal leaves the admitted delta-link identity set.
    let withdrawn = super::entity_id_of(0xC8);
    let retained = super::entity_id_of(0xC9);
    let mut links = fast_hash_set();
    links.insert(withdrawn);
    links.insert(retained);

    let mut proof =
        VisibilityProof::from_masks(CompressedBitSet::new(), CompressedBitSet::new(), links);
    proof.fold_withdrawn(&withdrawing(&atlas, &[0xC8]));
    assert!(
        !proof.admits_delta_link(withdrawn),
        "a withdrawn identity leaves the admitted set",
    );
    assert!(proof.admits_delta_link(retained), "its sibling stays");
}

/// A withdrawal published after the entry's fold subtracts as the residue.
///
/// The folded proof carries the earlier publication's row and the request's capture carries the
/// later one's, so the served tile hides both. The residue is idempotent over the fold: the
/// capture re-names the folded row, and subtracting it edits nothing because no delivered set
/// holds it.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn a_withdrawal_after_the_fold_subtracts_as_the_residue() {
    let (_generation, atlas) = publish("withdrawal-fold-residue").await;

    // Rows the root delivers, taken at base positions 1 and 2. Fixture node row `r` owns
    // seed `r`.
    let row_ids = atlas.rows.view();
    let earlier = row_ids[BasePosition::from_u32(1)].as_u32();
    let later = row_ids[BasePosition::from_u32(2)].as_u32();
    let seed_of = |row: u32| u8::try_from(row).expect("fixture rows fit u8");

    let mut folded = mask_hiding(&atlas, &[]);
    folded.fold_withdrawn(&withdrawing(&atlas, &[seed_of(earlier)]));

    let capture = withdrawing(&atlas, &[seed_of(earlier), seed_of(later)]);
    let tile = request(0, 0, 0, Mode::Delta);
    let served = tile_with(&atlas, &folded, Some(&capture), &tile);

    let rows_of = |bytes: &[u8]| -> Vec<u32> {
        let (chunks, remainder) = section(bytes, ROW_IDS)
            .expect("ROW_IDS is present")
            .as_chunks::<4>();
        assert!(remainder.is_empty(), "row sections are whole u32 columns");
        chunks.iter().copied().map(u32::from_le_bytes).collect()
    };
    let codec = test_codec(&atlas);
    let wire_of = |row: u32| {
        codec
            .encode(NodeRowId::from_u32(row), atlas.node_universe())
            .get()
    };

    let delivered = rows_of(&served);
    assert!(
        !delivered.contains(&wire_of(earlier)) && !delivered.contains(&wire_of(later)),
        "the folded row and the residue row both leave the wire",
    );
    assert!(
        rows_of(&tile_with(&atlas, &folded, None, &tile)).contains(&wire_of(later)),
        "without the capture the later withdrawal still serves, so the residue has teeth",
    );
}
