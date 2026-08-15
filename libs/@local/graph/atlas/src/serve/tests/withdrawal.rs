//! Admission-subtraction witnesses: the ingress snapshot's withdrawn rows leave served tiles.
//!
//! Every case runs the served assembly path with a real published snapshot, folded from feed
//! events exactly as the consumer folds them, so the witnesses cover the seam rather than the
//! subtraction walk alone. The corpus-proof case is the exposure the register exists to close,
//! because `full_visibility` builds no masks and nothing else subtracts on that path. Each case
//! carries a same-path negative control, which repeats the request and the walk under a snapshot
//! whose withdrawals touch nothing the tile delivers.

use hash_graph_postgres_store::store::{EntityEnd, EntityEvent};
use hash_graph_temporal_versioning::Timestamp;
use hashql_core::id::{Id as _, IdSlice};
use type_system::knowledge::entity::{EntityId, id::EntityUuid};
use uuid::Uuid;

use super::{
    Artifacts, Atlas, Bound, EdgesLimits, FIXTURE_LOD, FULL, HashSet, Mode, ROW_IDS, TileHead,
    TileLimits, TileResponse, UntouchedStore, coordinate_of, edges_request, expected_edges_bytes,
    fixture_row_ids, mask_hiding, open_artifacts, open_edge_artifacts, publish, qualifying_columns,
    request, section, test_codec, walk, wire_columns,
};
use crate::{
    identity::{BasePosition, NodeRowId},
    math::{Bounds2, Vec2},
    morton::{Depth, MortonCell},
    salt::wire::tile::{DeliveredSet, GlobalHead, TileCoordinate},
    serve::{
        delta::{DeltaEvent, DeltaRegister, DeltaRevision, DeltaSnapshot, PlacementCohort},
        walk::full::occupied_children,
    },
};

/// Folds one `Ended` feed event per seed into a published snapshot over `atlas`.
///
/// The events travel the consumer's own conversion, so the snapshot is the one publication
/// serving would read rather than a hand-assembled equivalent. Fixture node row `r` owns seed
/// `r`, so withdrawing a row is withdrawing its seed.
fn withdrawing(atlas: &Atlas, seeds: &[u8]) -> DeltaSnapshot {
    let mut register = DeltaRegister::new(atlas.universe());
    for &seed in seeds {
        let event = EntityEvent::Ended(EntityEnd {
            entity: EntityId {
                web_id: type_system::principal::actor_group::WebId::new(Uuid::from_bytes(
                    [seed; 16],
                )),
                entity_uuid: EntityUuid::new(Uuid::from_bytes([seed ^ 0xFF; 16])),
                draft_id: None,
            },
            ended_at: Timestamp::from_unix_timestamp(1),
        });
        register.apply(DeltaEvent::from(&event));
    }

    register.snapshot(
        atlas,
        DeltaRevision::FIRST,
        Timestamp::from_unix_timestamp(1),
    )
}

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
async fn corpus_root_subtracts_a_withdrawn_row_and_splits_its_range() {
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
        .map(|&row| node_codec.encode(NodeRowId::from_u32(row), atlas.universe()))
        .collect();
    let expected = TileResponse {
        head: TileHead {
            generation: atlas.generation().digest(),
            variant: 0,
            coordinate: TileCoordinate { z: 0, x: 0, y: 0 },
            mode: Mode::Delta,
            first_bucket: 0,
            runs: &runs,
            // The aggregates stay generation-computed. A withdrawn extreme point keeps
            // stretching the reported extent until refit, and the census never subtracts.
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
async fn scoped_delivery_drops_the_withdrawn_point_alone() {
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
        .encode(NodeRowId::from_u32(withdrawn), atlas.universe())
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
async fn an_all_withdrawn_tile_serves_the_empty_shape() {
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
async fn locate_refuses_withdrawn_sources_and_drops_withdrawn_partners() {
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
        atlas.universe(),
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

/// Translate answers a withdrawn identity as an absent key in either domain.
///
/// The identity-domain check runs right after parse, before any row resolution, and the witness
/// runs under full visibility, the path with no mask width to refuse a row, so cohort and
/// snapshot discipline are its only boundary. The control withdraws an identity the request
/// never names and must leave the response equal.
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

    // A withdrawn node identity leaves the nodes map, the edge untouched.
    let node_gone = translate(Some(&withdrawing(&atlas, &[0])));
    assert!(!node_gone.nodes.contains_key(&node_id), "an absent key");
    assert_eq!(node_gone.edges, baseline.edges, "the edge still resolves");

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
