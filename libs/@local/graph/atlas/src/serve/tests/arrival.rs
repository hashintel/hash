//! Cohort-serving witnesses: placed arrivals answer through the entry's retained cohort.
//!
//! Every case runs the served translate path with a real published snapshot, folded, classified,
//! and placed exactly as the consumer records them, so the witnesses cover the served path rather
//! than the map lookups alone. Translate is the first arrival-sensitive read. It resolves
//! identities against the cohort and encodes slots under the cohort's universe, and the ingress
//! capture's withdrawn identity set filters what the cohort retains. Each case carries a same-path
//! control whose delta touches nothing the request names.

#![expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]

use alloc::sync::Arc;

use hash_graph_postgres_store::store::{EntityEnd, EntityEvent, EntityUpdate};
use hash_graph_temporal_versioning::Timestamp;
use hashql_core::{
    collections::fast_hash_set,
    id::{Id as _, IdSlice, IdVec, bit_vec::DenseBitSet},
};
use type_system::knowledge::entity::{
    EntityId,
    id::{EntityEditionId, EntityUuid},
};
use uuid::Uuid;

use super::{
    Atlas, Bound, CutOffset, FIXTURE_LOD, FULL, HEAD, ServeLimits, TileLimits, UntouchedStore,
    coordinate_of, edges_request, entity_string_of, full_grid, head_global, locate_request,
    mask_hiding, publish, request, section, test_codec,
};
use crate::{
    bitset::{CompressedBitSet, DenseBitSlice},
    dataset::auxiliary::{Icon, Label, OwnedIcon, OwnedLabel, OwnedLegend},
    identity::{BasePosition, EdgeRowId, NodeRowId, OntologyRowId},
    math::Vec2,
    morton::{Depth, MortonKey},
    postgres::{
        Classification,
        id::{ArchivedEntityId, ArchivedEntityUuid, ArchivedOntologyTypeUuid},
    },
    salt::{
        lod::stage::WIRE_FRAME,
        wire::{
            Mode,
            locate::{LocateResponse, LocateTrailer, PropertyMap},
            tile::{DeliveredSet, TileCoordinate, TileHead, TileResponse, TileTrailer},
        },
    },
    serve::{
        EdgesLimits, LocateRequest, ViewCensus, VisibilityProof,
        delta::{
            DeltaEvent, DeltaRegister, DeltaRevision, DeltaSnapshot, PlacementCohort,
            ProjectedArrival,
        },
        hydrate::{
            DetailError, LocateHydration, LocateLinkHydration, LocateNodeHydration, LocateOrder,
            LocateStore,
        },
        locate::SourceSubject,
        neighbourhood::EdgeColumns,
        schedule::{
            ArrivalIndex, ArrivalOverlay, ArrivalRow, ScopeSchedule, Splice, ViewRow, ViewSchedule,
        },
        tile::TileDetail,
        translate::{TranslateLimits, TranslateRequest},
    },
};

/// The arrival's seed, past every node and edge seed the fixture generation fits.
const ARRIVAL_SEED: u8 = 0xA0;

/// The store-form entity id the seeding rule gives `seed`.
fn store_id(seed: u8) -> EntityId {
    EntityId {
        web_id: type_system::principal::actor_group::WebId::new(Uuid::from_bytes([seed; 16])),
        entity_uuid: EntityUuid::new(Uuid::from_bytes([seed ^ 0xFF; 16])),
        draft_id: None,
    }
}

/// The identity-table key the seeding rule gives `seed`.
fn archived_id(seed: u8) -> ArchivedEntityId {
    ArchivedEntityId {
        web_id: Uuid::from_bytes([seed; 16]).into(),
        entity_uuid: ArchivedEntityUuid::from_bytes(
            Uuid::from_bytes([seed ^ 0xFF; 16]).into_bytes(),
        ),
    }
}

/// Folds, classifies, and places live arrivals, publishing the snapshot a resolution reads.
///
/// The events travel the consumer's own conversion, and each placement takes the register's own
/// slot allocation with slots ascending in the given order, so the snapshot is the publication a
/// scope resolution would bind rather than a hand-assembled equivalent.
/// The fixture arrival's representative type, unknown to the generation, so the register's own
/// extension allocates its ontology row at the baked bound.
fn arrival_type() -> ArchivedOntologyTypeUuid {
    ArchivedOntologyTypeUuid::from(Uuid::from_u128(0xA771))
}

/// The legend the fixture arrival publishes: the extension's first ontology row.
fn arrival_legend(atlas: &Atlas) -> OwnedLegend {
    OwnedLegend::new(
        OntologyRowId::from_usize(atlas.ontology_universe().size()),
        Label::new("arrival"),
    )
}

fn arriving_all(atlas: &Atlas, arrivals: &[(u8, Vec2)]) -> DeltaSnapshot {
    let mut register = DeltaRegister::new(
        atlas.node_universe(),
        atlas.edge_universe(),
        atlas.ontology_universe(),
    );
    for &(seed, wire) in arrivals {
        let event = EntityEvent::Updated(EntityUpdate {
            entity: store_id(seed),
            edition: EntityEditionId::new(Uuid::from_u128(u128::from(seed))),
            archived: false,
            changed_at: Timestamp::from_unix_timestamp(1),
        });
        register.apply(DeltaEvent::from(&event));
        register
            .classify(archived_id(seed), Classification::Node)
            .expect("the fixture stays inside the edge universe");
        register
            .place(
                archived_id(seed),
                &ProjectedArrival {
                    edition: EntityEditionId::new(Uuid::from_u128(u128::from(seed))),
                    position: wire,
                    label: OwnedLabel::from("arrival"),
                    icon: OwnedIcon::from("arrival-icon"),
                    representative: arrival_type(),
                },
                atlas,
            )
            .expect("the fixture universe is far from the wire's row domain");
    }

    register.snapshot(
        atlas,
        DeltaRevision::FIRST,
        Timestamp::from_unix_timestamp(1),
    )
}

/// Folds, classifies, and places one live arrival, publishing the snapshot a resolution reads.
fn arriving(atlas: &Atlas, wire: Vec2) -> DeltaSnapshot {
    arriving_all(atlas, &[(ARRIVAL_SEED, wire)])
}

/// Folds one `Ended` event per seed into an ingress snapshot withdrawing those identities.
fn withdrawing(atlas: &Atlas, seeds: &[u8]) -> DeltaSnapshot {
    let mut register = DeltaRegister::new(
        atlas.node_universe(),
        atlas.edge_universe(),
        atlas.ontology_universe(),
    );
    for &seed in seeds {
        let event = EntityEvent::Ended(EntityEnd {
            entity: store_id(seed),
            ended_at: Timestamp::from_unix_timestamp(2),
        });
        register.apply(DeltaEvent::from(&event));
    }

    register.snapshot(
        atlas,
        DeltaRevision::FIRST,
        Timestamp::from_unix_timestamp(2),
    )
}

/// A scoped proof admitting every fitted row outside `hidden`, plus the cohort slots.
///
/// The shape the mask builder produces for a scope whose store resolution admitted the
/// arrivals: the fitted mask with the slots widened in. Hiding a fitted row keeps the proof
/// off the saturated-memo arm, and an empty `hidden` is the saturated shape, which reads the
/// shared cascade with the arrivals as its overlay.
fn widened(atlas: &Atlas, hidden: &[u32], slots: &[NodeRowId]) -> VisibilityProof {
    let rows = u32::try_from(atlas.row_ids().len()).expect("fixture domains fit u32");
    let edges = u32::try_from(atlas.endpoints.view().len()).expect("fixture domains fit u32");

    VisibilityProof::from_masks(
        CompressedBitSet::from_rows(
            (0..rows)
                .filter(|row| !hidden.contains(row))
                .map(NodeRowId::from_u32)
                .chain(slots.iter().copied()),
        ),
        CompressedBitSet::from_rows((0..edges).map(EdgeRowId::from_u32)),
        fast_hash_set(),
    )
}

/// A wire coordinate whose deepest-zoom cell holds no fitted row, with that cell's tile address.
///
/// The candidates sweep distinct quadrants of the wire square, so one of them lands apart from
/// the fixture's handful of points and the tile witnesses the arrival alone.
pub(super) fn vacant_cell(atlas: &Atlas) -> (Vec2, TileCoordinate) {
    let depth = Depth::new(FIXTURE_LOD.max_tile_depth).expect("the fixture depth is a depth");

    'candidates: for candidate in [
        Vec2::new(0.25, -0.5),
        Vec2::new(-0.75, 0.75),
        Vec2::new(0.8, 0.8),
        Vec2::new(-0.3, -0.9),
        Vec2::new(0.05, 0.6),
        Vec2::new(-0.9, 0.1),
    ] {
        let [x, y] = WIRE_FRAME.quantize(candidate);
        let cell = MortonKey::new(x, y).cell(depth);
        for position in 0..atlas.row_ids().len() {
            let position = BasePosition::from_usize(position);
            if cell.contains(atlas.morton.code(position)) {
                continue 'candidates;
            }
        }

        return (candidate, coordinate_of(cell));
    }

    unreachable!("every candidate cell holds a fixture point")
}

/// The arrival's natural bucket under `proof`, clamped into `deepest`, by the quadratic law.
fn expected_bucket(atlas: &Atlas, proof: &VisibilityProof, wire: Vec2, deepest: u8) -> u8 {
    let [x, y] = WIRE_FRAME.quantize(wire);
    let key = MortonKey::new(x, y);

    let shared_depth = |left: MortonKey, right: MortonKey| {
        (0..=Depth::MAX.get())
            .rev()
            .find(|&at| {
                let at = Depth::new(at).expect("the sweep stays on the documented domain");
                left.prefix(at) == right.prefix(at)
            })
            .expect("depth zero prefixes are always equal")
    };

    let mut deepest_shared: Option<u8> = None;
    for (position, &row) in atlas.row_ids().iter_enumerated() {
        if proof.contains(row) {
            let shared = shared_depth(key, atlas.morton.code(position));
            deepest_shared = Some(deepest_shared.map_or(shared, |held| held.max(shared)));
        }
    }

    deepest_shared.map_or(0, |shared| (shared + 1).min(deepest))
}

/// A scoped tile serves a placed arrival byte-exact against the directly built wire document:
/// the wire id and projected coordinate in the columns, the captured display in the trailer.
///
/// The arrival's cell holds no fitted row, so every column of the response is the arrival's
/// alone and the expected envelope derives whole from the placement's own values. A second
/// resolution must produce identical bytes, which pins delivery against the cohort map's
/// iteration order.
#[tokio::test]
async fn scoped_tile_serves_placed_arrival_with_captured_display() {
    let (_generation, atlas) = publish("arrival-tile").await;
    let (wire, coordinate) = vacant_cell(&atlas);
    let snapshot = arriving(&atlas, wire);
    let slot = NodeRowId::from_usize(atlas.node_universe().size());
    let cohort = PlacementCohort::of(Some(&snapshot));
    let proof = widened(&atlas, &[0], &[slot]);

    let mut request = request(coordinate.z, coordinate.x, coordinate.y, Mode::Total);
    request.query.detail = TileDetail::Auxiliary;

    let assemble = || {
        let bound = Bound::resolved(&atlas, &proof, cohort, CutOffset::ZERO);
        atlas
            .tile(&request, TileLimits::default(), bound.view(&atlas))
            .expect("the tile request is on the served grid")
    };
    let bytes = assemble();
    assert_eq!(bytes, assemble(), "two resolutions serve identical bytes");

    // d(z) at the deepest zoom is the catch-all, so the cut delivers buckets 0..=deepest and
    // the children mask reads zero. The arrival's run sits at its natural bucket.
    let deepest = FIXTURE_LOD.max_tile_depth + FIXTURE_LOD.span.get();
    let bucket = expected_bucket(&atlas, &proof, wire, deepest);
    let runs: Vec<u32> = (0..=deepest).map(|at| u32::from(at == bucket)).collect();

    let arrival_row = ArrivalRow {
        identity: archived_id(ARRIVAL_SEED),
        position: wire,
        wire: test_codec(&atlas).encode(slot, snapshot.universe()),
        legend: arrival_legend(&atlas),
    };
    let expected = TileResponse {
        head: TileHead {
            generation: atlas.generation().digest(),
            variant: 0,
            coordinate,
            mode: Mode::Total,
            first_bucket: 0,
            runs: &runs,
            global: None,
            children: 0,
        },
        delivered: DeliveredSet::Positions(&[ViewRow::Arrival(ArrivalIndex::from_u32(0))]),
        positions: atlas.positions(),
        rows: atlas.wire_rows(),
        arrivals: IdSlice::from_raw(core::slice::from_ref(&arrival_row)),
        masks: None,
        trailer: Some(TileTrailer {
            labels: &[Label::new("arrival")],
            icons: &[Icon::new("arrival-icon")],
        }),
    }
    .encode();
    assert_eq!(bytes, expected, "the arrival tile is byte-exact");
}

/// An ingress withdrawal subtracts a retained arrival from tiles, leaving exactly the bytes a
/// view that never held it serves.
///
/// The control withdraws an identity the cell never delivers and must leave the baseline bytes
/// untouched.
#[tokio::test]
async fn ingress_withdrawal_subtracts_retained_arrival_from_tiles() {
    let (_generation, atlas) = publish("arrival-tile-withdrawn").await;
    let (wire, coordinate) = vacant_cell(&atlas);
    let snapshot = arriving(&atlas, wire);
    let slot = NodeRowId::from_usize(atlas.node_universe().size());
    let cohort = PlacementCohort::of(Some(&snapshot));
    let proof = widened(&atlas, &[0], &[slot]);
    let request = request(coordinate.z, coordinate.x, coordinate.y, Mode::Total);

    let assemble = |delta: Option<&DeltaSnapshot>| {
        let mut bound = Bound::resolved(&atlas, &proof, cohort, CutOffset::ZERO);
        if let Some(delta) = delta {
            bound = bound.withdrawing(delta);
        }
        atlas
            .tile(&request, TileLimits::default(), bound.view(&atlas))
            .expect("the tile request is on the served grid")
    };

    let baseline = assemble(None);

    // The withdrawal leaves the bytes of a view that never held the arrival: same fitted mask,
    // no slot, empty cohort.
    let withdrawing_arrival = withdrawing(&atlas, &[ARRIVAL_SEED]);
    let subtracted = assemble(Some(&withdrawing_arrival));
    let slotless = mask_hiding(&atlas, &[0]);
    let never = {
        let bound = Bound::resolved(&atlas, &slotless, PlacementCohort::EMPTY, CutOffset::ZERO);
        atlas
            .tile(&request, TileLimits::default(), bound.view(&atlas))
            .expect("the tile request is on the served grid")
    };
    assert_eq!(
        subtracted, never,
        "the subtracted tile equals the never-held tile"
    );
    assert_ne!(baseline, subtracted, "the baseline delivered the arrival");

    // Same-path control: a withdrawal the cell never delivers moves nothing.
    let withdrawing_other = withdrawing(&atlas, &[ARRIVAL_SEED ^ 0x11]);
    let control = assemble(Some(&withdrawing_other));
    assert_eq!(control, baseline, "an unrelated withdrawal moves nothing");
}

/// The delivery-cut inputs never read the cohort: occupancy and census answer identically
/// under a widened proof and its slot-free counterpart.
///
/// Both are position-bounded walks over the generation's columns, so the cut offset `k` an
/// issuance resolves from them cannot move when arrivals join a scope.
#[tokio::test]
async fn occupancy_and_census_never_read_cohort() {
    let (_generation, atlas) = publish("arrival-occupancy").await;
    let snapshot = arriving(&atlas, Vec2::new(0.25, -0.5));
    let slot = NodeRowId::from_usize(atlas.node_universe().size());

    let with_slot = widened(&atlas, &[0], &[slot]);
    let without = mask_hiding(&atlas, &[0]);

    assert_eq!(
        atlas.visible_occupancy(&with_slot),
        atlas.visible_occupancy(&without),
        "the occupancy aggregate is position-bounded"
    );
    assert_eq!(
        atlas.census(&with_slot),
        atlas.census(&without),
        "the census is position-bounded"
    );
    drop(snapshot);
}

/// The translate request naming exactly the arrival.
fn ask() -> TranslateRequest {
    TranslateRequest {
        entity_ids: vec![entity_string_of(ARRIVAL_SEED)],
    }
}

/// Translate answers a placed arrival from the cohort, on its slot, under the grown universe.
///
/// The wire id must agree with an independent codec derivation at the snapshot's own universe,
/// so the case pins that arrival egress reads the cohort's bound rather than the generation's.
/// The empty-cohort control runs the same request and must answer an absent key, which is the
/// resolution that read no publication.
#[tokio::test]
#[expect(
    clippy::float_cmp,
    reason = "the projected coordinate is copied verbatim into the response, so bit equality is \
              the intended test"
)]
async fn translate_answers_placed_arrival_from_entry_cohort() {
    let (_generation, atlas) = publish("arrival-translate").await;
    let wire = Vec2::new(0.25, -0.5);
    let snapshot = arriving(&atlas, wire);
    let key = entity_string_of(ARRIVAL_SEED);

    let response = atlas
        .translate(
            ask(),
            TranslateLimits::default(),
            &FULL,
            None,
            PlacementCohort::of(Some(&snapshot)),
        )
        .expect("the request is under the cap");

    let node = response
        .nodes
        .get(&key)
        .expect("the cohort resolves the arrival");
    let slot = NodeRowId::from_usize(atlas.node_universe().size());
    assert_eq!(
        node.id,
        test_codec(&atlas).encode(slot, snapshot.universe()),
        "the arrival encodes its slot under the cohort's universe"
    );
    assert_eq!(node.x, wire.x(), "the projected coordinate answers");
    assert_eq!(node.y, wire.y(), "the projected coordinate answers");
    assert!(
        response.edges.is_empty(),
        "a node-classified arrival answers in the nodes map alone"
    );

    // The empty-cohort control runs the same request with no publication and must answer an
    // absent key.
    let unresolved = atlas
        .translate(
            ask(),
            TranslateLimits::default(),
            &FULL,
            None,
            PlacementCohort::EMPTY,
        )
        .expect("the request is under the cap");
    assert!(
        unresolved.nodes.is_empty() && unresolved.edges.is_empty(),
        "an empty cohort answers absent keys"
    );
}

/// A withdrawn arrival answers an absent key while the entry still retains its cohort.
///
/// The filter is literal membership in the ingress capture's withdrawn identity set, in both
/// directions: the withdrawal hides the retained arrival on this request, and an ingress set no
/// longer holding the identity serves it again from the same retained cohort. The control
/// withdraws an identity the request never names and must leave the response equal to the
/// baseline.
#[tokio::test]
async fn withdrawn_arrival_answers_absent_key_while_cohort_retains_it() {
    let (_generation, atlas) = publish("arrival-withdrawn").await;
    let snapshot = arriving(&atlas, Vec2::new(0.25, -0.5));
    let cohort = PlacementCohort::of(Some(&snapshot));
    let key = entity_string_of(ARRIVAL_SEED);

    let translate = |delta: Option<&DeltaSnapshot>| {
        atlas
            .translate(ask(), TranslateLimits::default(), &FULL, delta, cohort)
            .expect("the request is under the cap")
    };

    let baseline = translate(None);
    assert!(baseline.nodes.contains_key(&key), "the arrival resolves");

    let hidden = translate(Some(&withdrawing(&atlas, &[ARRIVAL_SEED])));
    assert!(
        !hidden.nodes.contains_key(&key),
        "the ingress withdrawal hides the retained arrival"
    );

    // Same-path control: a withdrawal the request never names moves nothing, which is the
    // literal-membership reading in the serving direction.
    let control = translate(Some(&withdrawing(&atlas, &[ARRIVAL_SEED ^ 0x11])));
    assert_eq!(control, baseline, "an unrelated withdrawal moves nothing");
}

/// A scoped proof answers an arrival exactly when its widened mask admits the slot.
///
/// The mask builder admits a placed arrival on its cohort slot, and this case pins the serving
/// end of that law. A node mask holding the slot serves the arrival, and the control proof,
/// which admits every fitted row and no slot, answers an absent key for the same cohort.
#[tokio::test]
async fn scoped_proof_admits_arrival_only_through_widened_mask() {
    let (_generation, atlas) = publish("arrival-scoped").await;
    let snapshot = arriving(&atlas, Vec2::new(0.25, -0.5));
    let cohort = PlacementCohort::of(Some(&snapshot));
    let key = entity_string_of(ARRIVAL_SEED);
    let slot = NodeRowId::from_usize(atlas.node_universe().size());

    let translate = |proof: &VisibilityProof| {
        atlas
            .translate(ask(), TranslateLimits::default(), proof, None, cohort)
            .expect("the request is under the cap")
    };

    // The widened mask holds the slot alone, the shape the mask builder produces for a scope
    // whose store resolution admitted exactly this arrival.
    let widened = VisibilityProof::from_masks(
        CompressedBitSet::from_rows([slot]),
        CompressedBitSet::<EdgeRowId>::from_rows([]),
        fast_hash_set(),
    );
    let admitted = translate(&widened);
    assert!(
        admitted.nodes.contains_key(&key),
        "the widened mask admits the arrival on its slot"
    );

    // The control admits every fitted row and no slot, so the same cohort answers nothing.
    let fitted_only = translate(&mask_hiding(&atlas, &[]));
    assert!(
        !fitted_only.nodes.contains_key(&key),
        "a mask without the slot hides the arrival"
    );
}

/// A corpus tile serves a placed arrival byte-exact against the directly built wire document:
/// the wire id and projected coordinate in the columns, the captured display in the trailer.
///
/// The operator proof admits every slot, so the corpus delivery splices the whole cohort. The
/// arrival's cell holds no fitted row, so every column of the response is the arrival's alone
/// and the expected envelope derives whole from the placement's own values: the delivered set
/// is one splice at index zero, with one delivered run at the arrival's natural bucket clamped
/// into the corpus catch-all. A second resolution must produce identical bytes, which pins delivery
/// against the cohort map's iteration order.
#[tokio::test]
async fn corpus_tile_serves_placed_arrival_with_captured_display() {
    let (_generation, atlas) = publish("arrival-corpus-tile").await;
    let (wire, coordinate) = vacant_cell(&atlas);
    let snapshot = arriving(&atlas, wire);
    let slot = NodeRowId::from_usize(atlas.node_universe().size());
    let cohort = PlacementCohort::of(Some(&snapshot));

    let mut request = request(coordinate.z, coordinate.x, coordinate.y, Mode::Total);
    request.query.detail = TileDetail::Auxiliary;

    let assemble = || {
        let bound = Bound::resolved(&atlas, &FULL, cohort, CutOffset::ZERO);
        atlas
            .tile(&request, TileLimits::default(), bound.view(&atlas))
            .expect("the tile request is on the served grid")
    };
    let bytes = assemble();
    assert_eq!(bytes, assemble(), "two resolutions serve identical bytes");

    // The corpus catch-all is the deepest zoom's cut, so the total delivery covers buckets
    // 0..=deepest with the vacant cell contributing the arrival alone, and the deepest zoom's
    // child bitmask reads zero.
    let deepest = FIXTURE_LOD.max_tile_depth + FIXTURE_LOD.span.get();
    let bucket = expected_bucket(&atlas, &FULL, wire, deepest);
    let runs: Vec<u32> = (0..=deepest).map(|at| u32::from(at == bucket)).collect();

    let arrival_row = ArrivalRow {
        identity: archived_id(ARRIVAL_SEED),
        position: wire,
        wire: test_codec(&atlas).encode(slot, snapshot.universe()),
        legend: arrival_legend(&atlas),
    };
    let expected = TileResponse {
        head: TileHead {
            generation: atlas.generation().digest(),
            variant: 0,
            coordinate,
            mode: Mode::Total,
            first_bucket: 0,
            runs: &runs,
            global: None,
            children: 0,
        },
        delivered: DeliveredSet::Spliced {
            ranges: &[],
            splices: &[Splice {
                at: 0,
                arrival: ArrivalIndex::from_u32(0),
            }],
        },
        positions: atlas.positions(),
        rows: atlas.wire_rows(),
        arrivals: IdSlice::from_raw(core::slice::from_ref(&arrival_row)),
        masks: None,
        trailer: Some(TileTrailer {
            labels: &[Label::new("arrival")],
            icons: &[Icon::new("arrival-icon")],
        }),
    }
    .encode();
    assert_eq!(bytes, expected, "the corpus arrival tile is byte-exact");
}

/// The corpus schedule's root count and depth from the operator proof's census.
fn corpus_census(atlas: &Atlas) -> (u64, u64) {
    match atlas.census(&FULL) {
        ViewCensus::Corpus {
            visible,
            min_resolution,
            ..
        } => (visible, min_resolution),
        ViewCensus::Scope { .. } => panic!("the operator proof censuses the corpus"),
    }
}

/// The corpus splice, the saturated overlay, and the folded cascade agree byte for byte on
/// every tile.
///
/// A saturated scope reads the shared memo with the cohort as its overlay, and a directly built
/// cascade folds the same arrivals into its own slots: the overlay must reproduce the fold at
/// every zoom, cell, mode, and admissible offset. At the zero offset the corpus contract serves
/// the same rows through the range-splice path, so all three must coincide there, which pins the
/// splice arithmetic against the two schedule mechanisms.
///
/// One arrival sits in a cell of its own and the other co-locates with fitted row zero at the
/// full key width, so the sweep crosses vacant cells, mid-run splices, the catch-all, and the
/// equal-key ordering law in one pass. The root coordinates then check the merged global
/// aggregates against the census and the arrivals' own buckets.
#[tokio::test]
async fn corpus_saturated_and_folded_arrival_deliveries_agree() {
    let (_generation, atlas) = publish("arrival-parity").await;
    let (vacant, _) = vacant_cell(&atlas);
    let co_located = atlas.positions()[BasePosition::MIN];
    let snapshot = arriving_all(
        &atlas,
        &[(ARRIVAL_SEED, vacant), (ARRIVAL_SEED + 1, co_located)],
    );
    let cohort = PlacementCohort::of(Some(&snapshot));
    let base = atlas.node_universe().size();
    let slots = [base, base + 1].map(NodeRowId::from_usize);
    let saturated = widened(&atlas, &[], &slots);

    for k in 0..=1_u8 {
        let offset = CutOffset::new(k);
        let fold = ViewSchedule::Scope(
            Arc::new(ScopeSchedule::of(&atlas, &saturated, cohort)),
            ArrivalOverlay::empty(),
        );
        let folded_bound = Bound {
            proof: &saturated,
            census: atlas.census(&saturated),
            schedule: fold,
            k: offset,
            cohort,
            delta: None,
        };

        for z in 0..=FIXTURE_LOD.max_tile_depth {
            let cells = 1_u32 << z;
            for (x, y) in (0..cells).flat_map(|x| (0..cells).map(move |y| (x, y))) {
                for mode in [Mode::Delta, Mode::Total] {
                    let at = format!("k={k} {mode:?} {z}/{x}/{y}");
                    let tile = request(z, x, y, mode);

                    let memo = {
                        let bound = Bound::resolved(&atlas, &saturated, cohort, offset);
                        atlas
                            .tile(&tile, TileLimits::default(), bound.view(&atlas))
                            .expect("the saturated scope serves")
                    };
                    let folded = atlas
                        .tile(&tile, TileLimits::default(), folded_bound.view(&atlas))
                        .expect("the folded cascade serves");
                    assert_eq!(
                        memo, folded,
                        "{at}: the overlay reproduces the folded cascade"
                    );

                    if k == 0 {
                        let corpus = {
                            let bound = Bound::resolved(&atlas, &FULL, cohort, CutOffset::ZERO);
                            atlas
                                .tile(&tile, TileLimits::default(), bound.view(&atlas))
                                .expect("the operator contract serves")
                        };
                        assert_eq!(
                            corpus, memo,
                            "{at}: the corpus splice parts from the cascade"
                        );
                    }
                }
            }
        }
    }

    // The corpus root publishes the census merged with the overlay. The vacant arrival counts
    // toward the visible aggregate exactly when its bucket lies on the root's cumulative
    // schedule, while the co-located arrival takes the catch-all and never does. The resolution
    // deepens to the deepest clamped arrival bucket.
    let deepest = FIXTURE_LOD.max_tile_depth + FIXTURE_LOD.span.get();
    let vacant_bucket = expected_bucket(&atlas, &FULL, vacant, deepest);
    assert_eq!(
        expected_bucket(&atlas, &FULL, co_located, deepest),
        deepest,
        "a full-key co-location takes the catch-all",
    );

    let root = {
        let bound = Bound::resolved(&atlas, &FULL, cohort, CutOffset::ZERO);
        atlas
            .tile(
                &request(0, 0, 0, Mode::Delta),
                TileLimits::default(),
                bound.view(&atlas),
            )
            .expect("the root serves")
    };
    let (visible, _, min_resolution) = head_global(section(&root, HEAD).expect("HEAD is present"))
        .expect("the root carries the global aggregates");

    let (census_visible, census_resolution) = corpus_census(&atlas);
    let cut = FIXTURE_LOD.span.get();
    assert_eq!(
        visible,
        census_visible + u64::from(vacant_bucket <= cut),
        "the root's visible count folds the delivered arrivals in",
    );
    assert_eq!(
        min_resolution,
        census_resolution.max(u64::from(deepest)),
        "the root's resolution reaches the deepest clamped arrival bucket",
    );
    assert_eq!(
        Bound::resolved(&atlas, &FULL, cohort, CutOffset::ZERO)
            .view(&atlas)
            .min_resolution(),
        min_resolution,
        "the manifest's maxZoom reads the root's resolution",
    );
}

/// An ingress withdrawal subtracts spliced arrivals from corpus tiles, leaving exactly the
/// bytes a view that never held them serves, and a fitted withdrawal beside a retained arrival
/// subtracts identically through the spliced and the gathered shapes.
///
/// The control withdraws an identity the cohort never held and must leave the baseline bytes
/// untouched.
#[tokio::test]
async fn ingress_withdrawal_subtracts_spliced_arrival_from_corpus_tiles() {
    let (_generation, atlas) = publish("arrival-corpus-withdrawn").await;
    let (vacant, coordinate) = vacant_cell(&atlas);
    let co_located = atlas.positions()[BasePosition::MIN];
    let snapshot = arriving_all(
        &atlas,
        &[(ARRIVAL_SEED, vacant), (ARRIVAL_SEED + 1, co_located)],
    );
    let cohort = PlacementCohort::of(Some(&snapshot));
    let tile = request(coordinate.z, coordinate.x, coordinate.y, Mode::Total);

    let corpus = |cohort: PlacementCohort<'_>,
                  delta: Option<&DeltaSnapshot>,
                  tile: &crate::serve::TileRequest| {
        let mut bound = Bound::resolved(&atlas, &FULL, cohort, CutOffset::ZERO);
        if let Some(delta) = delta {
            bound = bound.withdrawing(delta);
        }
        atlas
            .tile(tile, TileLimits::default(), bound.view(&atlas))
            .expect("the tile request is on the served grid")
    };

    let baseline = corpus(cohort, None, &tile);

    // Withdrawing both arrivals leaves the bytes of a view that never read a publication.
    let withdrawing_both = withdrawing(&atlas, &[ARRIVAL_SEED, ARRIVAL_SEED + 1]);
    let subtracted = corpus(cohort, Some(&withdrawing_both), &tile);
    let never = corpus(PlacementCohort::EMPTY, None, &tile);
    assert_eq!(
        subtracted, never,
        "the subtracted tile equals the never-held tile"
    );
    assert_ne!(baseline, subtracted, "the baseline delivered the arrival");

    // Same-path control: a withdrawal the cohort never held moves nothing.
    let withdrawing_other = withdrawing(&atlas, &[ARRIVAL_SEED ^ 0x11]);
    let control = corpus(cohort, Some(&withdrawing_other), &tile);
    assert_eq!(control, baseline, "an unrelated withdrawal moves nothing");

    // A fitted withdrawal in the co-located cell shifts the splice sitting behind it. The
    // saturated scope subtracts the same rows through the gathered shape, so byte parity pins
    // the spliced subtraction against it.
    let fitted_seed =
        u8::try_from(atlas.row_ids()[BasePosition::MIN].as_u32()).expect("fixture rows fit u8");
    let withdrawing_fitted = withdrawing(&atlas, &[fitted_seed]);
    let depth = Depth::new(FIXTURE_LOD.max_tile_depth).expect("the fixture depth is a depth");
    let shared_cell = coordinate_of(atlas.morton.code(BasePosition::MIN).cell(depth));
    let shared_tile = request(shared_cell.z, shared_cell.x, shared_cell.y, Mode::Total);

    let base = atlas.node_universe().size();
    let saturated = widened(&atlas, &[], &[base, base + 1].map(NodeRowId::from_usize));
    let gathered = {
        let bound = Bound::resolved(&atlas, &saturated, cohort, CutOffset::ZERO)
            .withdrawing(&withdrawing_fitted);
        atlas
            .tile(&shared_tile, TileLimits::default(), bound.view(&atlas))
            .expect("the saturated scope serves")
    };
    let spliced = corpus(cohort, Some(&withdrawing_fitted), &shared_tile);
    assert_eq!(
        spliced, gathered,
        "both shapes subtract the fitted row and keep the arrival"
    );
}

/// A store answering that every delivered entity resolves with no recorded detail.
///
/// The store resolution answers and every store-derived column stays empty, so an expectation built
/// over it pins the in-process columns - the captured display among them - without store-derived
/// content.
struct ResolvingEmptyStore;

impl LocateStore for ResolvingEmptyStore {
    fn hydrate(self, order: LocateOrder<'_>) -> Result<LocateHydration, DetailError> {
        Ok(LocateHydration {
            nodes: LocateNodeHydration {
                resolved: DenseBitSet::new_filled(order.nodes.count()),
                type_urls: IdVec::from_elem(Vec::new(), order.nodes.count()),
                source_properties: Some(Vec::new()),
                source_properties_complete: true,
            },
            links: LocateLinkHydration::empty(order.links.len()),
        })
    }
}

/// The locate request naming the arrival by its wire row id.
fn locate_by_row(wire: crate::serve::WireRow<NodeRowId>) -> LocateRequest {
    LocateRequest {
        entity_id: None,
        row: Some(wire),
        colored_type_ids: Vec::new(),
    }
}

/// Inverts the scope's cut rule over the arrival's bucket at `k = 0`.
///
/// The scope folds its arrivals into its own cascade, so the bucket is the separation law over
/// the visible fitted keys, clamped into the catch-all, the zoom inverts it, and the fly-to
/// cell is the projected coordinate's tile at that zoom.
fn arrival_zoom_and_cell(
    atlas: &Atlas,
    proof: &VisibilityProof,
    wire: Vec2,
) -> (u8, TileCoordinate) {
    let deepest = FIXTURE_LOD.max_tile_depth + FIXTURE_LOD.span.get();
    let bucket = expected_bucket(atlas, proof, wire, deepest);
    let zoom = bucket.saturating_sub(FIXTURE_LOD.span.get());
    let [x, y] = WIRE_FRAME.quantize(wire);
    let cell = coordinate_of(
        MortonKey::new(x, y).cell(Depth::new(zoom).expect("a served zoom is a depth")),
    );
    (zoom, cell)
}

/// Both ingress domains resolve a placed arrival to one source point under the cut rule.
///
/// The entity-keyed and the wire-keyed resolutions must agree on one `SourcePoint`, whose zoom
/// is the scope's own cut rule inverted over the arrival's bucket and whose cell is the
/// projected coordinate's tile there. The saturated shape must agree on the zoom through its
/// overlay, which pins both scoped bucket sources against one law.
#[tokio::test]
async fn arrival_source_point_cut_rule() {
    let (_, atlas) = publish("arrival-source-point").await;
    let (wire, _) = vacant_cell(&atlas);
    let snapshot = arriving(&atlas, wire);
    let slot = NodeRowId::from_usize(atlas.node_universe().size());
    let cohort = PlacementCohort::of(Some(&snapshot));
    let proof = widened(&atlas, &[0], &[slot]);

    let bound = Bound::resolved(&atlas, &proof, cohort, CutOffset::ZERO);
    let view = bound.view(&atlas);
    let (zoom, cell) = arrival_zoom_and_cell(&atlas, &proof, wire);

    let source = atlas
        .resolve_source(&view, &entity_string_of(ARRIVAL_SEED))
        .expect("the cohort resolves the arrival");
    assert_eq!(
        source.subject,
        SourceSubject::Arrival(ArrivalIndex::from_u32(0)),
        "the arrival addresses the view's table"
    );
    assert_eq!(source.zoom, zoom, "the zoom inverts the cut rule");
    assert_eq!(
        source.cell, cell,
        "the fly-to cell is the projected coordinate's tile"
    );

    let slot_wire = test_codec(&atlas).encode(slot, snapshot.universe());
    assert_eq!(
        atlas.resolve_wire_source(&view, slot_wire),
        Some(source),
        "both ingress domains land on one source point"
    );

    // The saturated shape reads the shared memo with the cohort as its overlay, and must invert
    // to the same zoom through the overlay's bucket, because hiding no row leaves the
    // separation inputs identical.
    let saturated = widened(&atlas, &[], &[slot]);
    let saturated_bound = Bound::resolved(&atlas, &saturated, cohort, CutOffset::ZERO);
    let through_overlay = atlas
        .resolve_source(
            &saturated_bound.view(&atlas),
            &entity_string_of(ARRIVAL_SEED),
        )
        .expect("the saturated scope resolves the arrival");
    assert_eq!(
        through_overlay.zoom, zoom,
        "the overlay inverts identically"
    );
}

/// Locate serves a placed arrival from both ingress domains, byte-exact against the directly
/// built wire document.
///
/// The full envelope delivers the arrival alone and complete, because the generation's
/// adjacency never names a cohort slot and this cohort publishes no link at it. The columns
/// carry its projected coordinate and slot wire id. The trailer carries the captured display
/// once the store resolution answers, and the edge columns stay empty. A second assembly must
/// produce identical bytes.
#[tokio::test]
async fn locate_serves_placed_arrival_from_both_ingress_domains() {
    let (generation, atlas) = publish("arrival-locate").await;
    let (wire, _) = vacant_cell(&atlas);
    let snapshot = arriving(&atlas, wire);
    let slot = NodeRowId::from_usize(atlas.node_universe().size());
    let cohort = PlacementCohort::of(Some(&snapshot));
    let proof = widened(&atlas, &[0], &[slot]);
    let (_, cell) = arrival_zoom_and_cell(&atlas, &proof, wire);
    let slot_wire = test_codec(&atlas).encode(slot, snapshot.universe());

    let assemble = |request: &LocateRequest| {
        let bound = Bound::resolved(&atlas, &proof, cohort, CutOffset::ZERO);
        atlas
            .locate(
                request,
                ServeLimits::default(),
                bound.view(&atlas),
                ResolvingEmptyStore,
            )
            .expect("the arrival locate serves")
    };
    let by_id = assemble(&locate_request(entity_string_of(ARRIVAL_SEED)));
    assert_eq!(
        by_id,
        assemble(&locate_request(entity_string_of(ARRIVAL_SEED))),
        "two assemblies serve identical bytes"
    );
    assert_eq!(
        by_id,
        assemble(&locate_by_row(slot_wire)),
        "both ingress domains serve identical bytes"
    );

    let arrival_row = ArrivalRow {
        identity: archived_id(ARRIVAL_SEED),
        position: wire,
        wire: slot_wire,
        legend: arrival_legend(&atlas),
    };
    let empty_map = PropertyMap::new_unchecked(Vec::new());
    let no_edges = EdgeColumns::pinned([]);
    let no_flags: Box<DenseBitSlice<crate::serve::hydrate::EdgeSlot>> = DenseBitSlice::new_empty(0);
    let expected = LocateResponse {
        generation: generation.id().digest(),
        variant: 0,
        cell,
        complete: true,
        entity_id: archived_id(ARRIVAL_SEED),
        // The store records no types, and coverage of an empty set attests nothing.
        type_ids_complete: false,
        properties_complete: true,
        delivered: IdSlice::from_raw(&[ViewRow::Arrival(ArrivalIndex::from_u32(0))]),
        arrivals: IdSlice::from_raw(core::slice::from_ref(&arrival_row)),
        positions: atlas.positions(),
        rows: atlas.wire_rows(),
        masks: None,
        edges: &no_edges,
        trailer: LocateTrailer {
            type_table: IdSlice::from_raw(&[]),
            property_table: IdSlice::from_raw(&[]),
            labels: IdSlice::from_raw(&[Label::new("arrival")]),
            type_ids: IdSlice::from_raw(&[None]),
            properties: Some(&empty_map),
            link_labels: IdSlice::from_raw(&[]),
            link_type_ids: IdSlice::from_raw(&[]),
            link_type_ids_complete: &no_flags,
            link_properties: IdSlice::from_raw(&[]),
            link_properties_complete: &no_flags,
        },
    }
    .encode();
    assert_eq!(by_id, expected, "the arrival locate is byte-exact");
}

/// A corpus locate clamps the arrival's natural bucket into the catch-all before inverting.
///
/// The vacant arrival inverts its natural bucket, and a full-key co-location saturates at
/// [`Depth::MAX`], whose clamp into the corpus catch-all inverts to exactly the deepest served
/// zoom. A fitted source's response must not move when a cohort rides the view, which pins the
/// fitted locate path against arrival ingress.
#[tokio::test]
async fn corpus_locate_clamps_arrival_zoom_into_catch_all() {
    let (_generation, atlas) = publish("arrival-locate-corpus").await;
    let (vacant, _) = vacant_cell(&atlas);
    let co_located = atlas.positions()[BasePosition::MIN];
    let snapshot = arriving_all(
        &atlas,
        &[(ARRIVAL_SEED, vacant), (ARRIVAL_SEED + 1, co_located)],
    );
    let cohort = PlacementCohort::of(Some(&snapshot));

    let bound = Bound::resolved(&atlas, &FULL, cohort, CutOffset::ZERO);
    let view = bound.view(&atlas);

    // Grid::deepest() is the corpus catch-all, and first_zoom subtracts the span.
    let deepest = FIXTURE_LOD.max_tile_depth + FIXTURE_LOD.span.get();
    let vacant_zoom =
        expected_bucket(&atlas, &FULL, vacant, deepest).saturating_sub(FIXTURE_LOD.span.get());
    let source = atlas
        .resolve_source(&view, &entity_string_of(ARRIVAL_SEED))
        .expect("the corpus view resolves the arrival");
    assert_eq!(source.zoom, vacant_zoom, "the natural bucket inverts");

    // The co-location shares every key bit with fitted row zero, so its natural bucket
    // saturates past the catch-all and the clamp answers the deepest served zoom.
    let saturated = atlas
        .resolve_source(&view, &entity_string_of(ARRIVAL_SEED + 1))
        .expect("the corpus view resolves the co-located arrival");
    assert_eq!(
        saturated.zoom, FIXTURE_LOD.max_tile_depth,
        "the catch-all clamp inverts to the deepest served zoom"
    );

    // A fitted source's bytes are cohort-independent. The same request and the same store
    // answer run with and without the retained cohort.
    let fitted = |cohort: PlacementCohort<'_>| {
        let bound = Bound::resolved(&atlas, &FULL, cohort, CutOffset::ZERO);
        atlas
            .locate(
                &locate_request(entity_string_of(0)),
                ServeLimits::default(),
                bound.view(&atlas),
                ResolvingEmptyStore,
            )
            .expect("the fitted locate serves")
    };
    assert_eq!(
        fitted(cohort),
        fitted(PlacementCohort::EMPTY),
        "a fitted source's bytes do not move under a cohort"
    );
}

/// A withdrawn or unadmitted arrival locates nowhere, in both ingress domains.
///
/// The ingress withdrawal filter hides a retained arrival on this request alone, a scoped mask
/// without the slot never admits it, and the empty cohort refuses its wire id at decode. The
/// control withdraws an identity the request never names and must leave both resolutions
/// standing.
#[tokio::test]
async fn withdrawn_or_unadmitted_arrival_locates_nowhere() {
    let (_generation, atlas) = publish("arrival-locate-withdrawn").await;
    let (wire, _) = vacant_cell(&atlas);
    let snapshot = arriving(&atlas, wire);
    let slot = NodeRowId::from_usize(atlas.node_universe().size());
    let cohort = PlacementCohort::of(Some(&snapshot));
    let proof = widened(&atlas, &[0], &[slot]);
    let id = entity_string_of(ARRIVAL_SEED);
    let slot_wire = test_codec(&atlas).encode(slot, snapshot.universe());

    // The ingress withdrawal covers both domains through the one convergence point.
    let hidden = withdrawing(&atlas, &[ARRIVAL_SEED]);
    let bound = Bound::resolved(&atlas, &proof, cohort, CutOffset::ZERO).withdrawing(&hidden);
    let view = bound.view(&atlas);
    assert!(
        atlas.resolve_source(&view, &id).is_none(),
        "a withdrawn arrival is unknown by entity id"
    );
    assert!(
        atlas.resolve_wire_source(&view, slot_wire).is_none(),
        "the wire-keyed path refuses the same way"
    );

    // Same-path control: an unrelated withdrawal leaves both resolutions standing.
    let unrelated = withdrawing(&atlas, &[ARRIVAL_SEED ^ 0x11]);
    let bound = Bound::resolved(&atlas, &proof, cohort, CutOffset::ZERO).withdrawing(&unrelated);
    let view = bound.view(&atlas);
    assert!(
        atlas.resolve_source(&view, &id).is_some()
            && atlas.resolve_wire_source(&view, slot_wire).is_some(),
        "an unrelated withdrawal moves nothing"
    );

    // A mask without the slot never admitted the arrival: the view's table does not hold it,
    // and both domains answer the same absence.
    let slotless = mask_hiding(&atlas, &[0]);
    let bound = Bound::resolved(&atlas, &slotless, cohort, CutOffset::ZERO);
    let view = bound.view(&atlas);
    assert!(
        atlas.resolve_source(&view, &id).is_none(),
        "an unadmitted arrival is unknown by entity id"
    );
    assert!(
        atlas.resolve_wire_source(&view, slot_wire).is_none(),
        "an unadmitted slot refuses at resolution"
    );

    // The empty cohort is the resolution that read no publication: the slot wire id lies past
    // the generation's universe and refuses at decode.
    let bound = Bound::resolved(&atlas, &proof, PlacementCohort::EMPTY, CutOffset::ZERO);
    let view = bound.view(&atlas);
    assert!(
        atlas.resolve_wire_source(&view, slot_wire).is_none(),
        "an empty cohort refuses the slot at decode"
    );
}

/// A cohort publishing no links moves no edge byte: arrivals alone contribute no edge.
///
/// An arrival contributes no generation edge, and a delta edge exists only where the cohort
/// publishes a link. Corpus and saturated views holding a link-free cohort must answer the
/// exact bytes their arrival-free counterparts answer over the whole served grid.
#[tokio::test]
async fn arrival_bounds_no_edge_in_edges_response() {
    let (_generation, atlas) = publish("arrival-edges").await;
    let (vacant, _) = vacant_cell(&atlas);
    let co_located = atlas.positions()[BasePosition::MIN];
    let snapshot = arriving_all(
        &atlas,
        &[(ARRIVAL_SEED, vacant), (ARRIVAL_SEED + 1, co_located)],
    );
    let cohort = PlacementCohort::of(Some(&snapshot));
    let base = atlas.node_universe().size();
    let slots = [base, base + 1].map(NodeRowId::from_usize);

    let edges = |proof: &VisibilityProof, cohort: PlacementCohort<'_>| {
        let bound = Bound::resolved(&atlas, proof, cohort, CutOffset::ZERO);
        atlas
            .edges(
                &edges_request(full_grid()),
                EdgesLimits::default(),
                bound.view(&atlas),
                UntouchedStore,
            )
            .expect("the edges request is on the served grid")
    };

    assert_eq!(
        edges(&FULL, cohort),
        edges(&FULL, PlacementCohort::EMPTY),
        "the corpus edge set ignores the cohort"
    );

    let saturated = widened(&atlas, &[], &slots);
    let slotless = mask_hiding(&atlas, &[]);
    assert_eq!(
        edges(&saturated, cohort),
        edges(&slotless, PlacementCohort::EMPTY),
        "the scoped edge set ignores the cohort"
    );
}
