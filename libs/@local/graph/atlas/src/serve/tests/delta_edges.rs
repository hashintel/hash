//! Delta-edge witnesses: the entry cohort's published links serve through the edges,
//! translate, and locate routes.
//!
//! Every case runs the route's own assembly with a real published snapshot, folded, classified,
//! and placed exactly as the consumer records them, so the witnesses cover the seam rather than
//! the map lookups alone. A delta link serves when the proof's identity set admits it, the
//! ingress capture does not withdraw it, and the response's delivered sets hold both of its
//! endpoints, and it merges into the same ascending identity order the fitted edges answer in.
//! Translate reads the same publication keyed by identity, its endpoints qualified through the
//! proof and the cohort's retention rather than a delivered bound, and the locate fold takes
//! the same endpoint rule around one source. Each refusal case runs beside a same-path control
//! whose delta touches nothing the request names.

use core::num::NonZero;

use hash_graph_postgres_store::store::{EntityEnd, EntityEvent, EntityUpdate};
use hash_graph_temporal_versioning::Timestamp;
use hashql_core::{
    collections::FastHashMap,
    id::{Id as _, IdSlice, IdVec, bit_vec::DenseBitSet},
};
use type_system::{
    knowledge::entity::{
        EntityId,
        id::{EntityEditionId, EntityUuid},
    },
    ontology::id::VersionedUrl,
};
use uuid::Uuid;

use super::{
    Atlas, Bound, CutOffset, EDGE_IDS, FIXTURE_LOD, FULL, Generation, UntouchedStore,
    arrival::vacant_cell, coordinate_of, edge_identity_of, edges_request, entity_string_of,
    expected_edges_bytes, fixture_type_url, full_grid, locate_request, open_edge_artifacts,
    publish, section, test_codec, type_expectations,
};
use crate::{
    bitset::{CompressedBitSet, DenseBitSlice},
    dataset::auxiliary::{Icon, Label, OwnedIcon, OwnedLabel},
    identity::{BasePosition, EdgeRowId, ImportanceRank, NodeRowId},
    math::Vec2,
    morton::Depth,
    postgres::{
        Classification,
        edition_display::DisplayParts,
        id::{ArchivedEntityId, ArchivedEntityUuid, ArchivedOntologyTypeUuid},
    },
    random::{keyed_rng, uniform_below},
    salt::wire::{
        edges::{EdgesResponse, EdgesTrailer},
        locate::{LocateResponse, LocateTrailer, PropertyMap},
    },
    serve::{
        EdgesLimits, ServeLimits, VisibilityProof,
        delta::{
            DeltaEvent, DeltaRegister, DeltaRevision, DeltaSnapshot, PlacementCohort,
            ProjectedArrival,
        },
        edges::EdgesDetail,
        hydrate::{
            DetailError, EdgesStore, LocateHydration, LocateLinkHydration, LocateNodeHydration,
            LocateOrder, LocateStore, TypeSlot,
        },
        locate::LocateLimits,
        neighbourhood::{DeltaEdge, DeltaEndpoint, EdgeColumns, ServedEdge},
        schedule::{ArrivalIndex, ViewRow},
        translate::{TranslateLimits, TranslateRequest, TranslatedEdge},
    },
};

/// A link identity sorting before every fitted edge identity, whose seeds start at 64.
const LOW_LINK: u8 = 50;

/// A link identity sorting after the arrival band.
const HIGH_LINK: u8 = 0xB0;

/// The arrival's seed, past every node and edge seed the fixture generation fits.
const ARRIVAL: u8 = 0xA0;

/// Link seeds for the differential's random cohorts, disjoint from node seeds `0..48`, edge
/// seeds `64..70`, and `ARRIVAL`.
const LINK_SEEDS: [u8; 8] = [48, 52, 58, 63, 72, 90, 150, 200];

/// An endpoint identity the view cannot deliver.
const REFUSED: u8 = 0xD0;

/// An oracle candidate pairs the full-sort selection key with the delivered wire triple.
type OracleCandidate<Rank> = ((Rank, ArchivedEntityId), (u32, u32, ArchivedEntityId));

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

/// Folds, classifies, and places live arrivals and links, publishing one snapshot.
///
/// The events travel the consumer's own conversion. Each arrival classifies as a node and takes
/// the register's own slot allocation, and each link classifies with its endpoint pair, so the
/// snapshot is the publication a scope resolution would bind rather than a hand-assembled
/// equivalent. A link's endpoints are seeds under the same rule, so a link can attach fitted
/// rows, arrivals, and itself.
fn publishing(atlas: &Atlas, arrivals: &[(u8, Vec2)], links: &[(u8, u8, u8)]) -> DeltaSnapshot {
    publishing_displayed(
        atlas,
        arrivals,
        links,
        &DisplayParts {
            label: OwnedLabel::from("link"),
            icon: OwnedIcon::from("link-icon"),
            representative: fixture_type(),
        },
    )
}

/// The fixture's shared link representative type, unknown to the generation, so the register's
/// own extension allocates its ontology row.
fn fixture_type() -> ArchivedOntologyTypeUuid {
    ArchivedOntologyTypeUuid::from(Uuid::from_u128(0x117C))
}

/// [`publishing`], with every link capturing `link_display` instead of the default.
fn publishing_displayed(
    atlas: &Atlas,
    arrivals: &[(u8, Vec2)],
    links: &[(u8, u8, u8)],
    link_display: &DisplayParts,
) -> DeltaSnapshot {
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
                    representative: fixture_type(),
                },
                atlas,
            )
            .expect("the fixture universe is far from the wire's row domain");
    }
    for &(seed, source, target) in links {
        let event = EntityEvent::Updated(EntityUpdate {
            entity: store_id(seed),
            edition: EntityEditionId::new(Uuid::from_u128(u128::from(seed))),
            archived: false,
            changed_at: Timestamp::from_unix_timestamp(1),
        });
        register.apply(DeltaEvent::from(&event));
        register
            .classify(
                archived_id(seed),
                Classification::Edge {
                    source: Some(archived_id(source)),
                    target: Some(archived_id(target)),
                },
            )
            .expect("the fixture stays inside the edge universe");
        // Publication withholds an uncaptured link, so the fixture captures exactly as the
        // poll's own display read does.
        let DisplayParts {
            label,
            icon,
            representative,
        } = link_display.clone();
        register
            .capture_display(
                archived_id(seed),
                EntityEditionId::new(Uuid::from_u128(u128::from(seed))),
                &label,
                &icon,
                representative,
                atlas,
            )
            .expect("the fixture ontology domain has room");
    }

    register.snapshot(
        atlas,
        DeltaRevision::FIRST,
        Timestamp::from_unix_timestamp(1),
    )
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

/// The full-coverage fitted wire triples, ascending identity bytes.
///
/// Every fixture edge qualifies under a full grid with everything visible, and edge identities
/// ascend with the edge row by the seeding rule, so the artifact order is the delivery order.
fn fitted_triples(atlas: &Atlas, generation: &Generation) -> Vec<(u32, u32, ArchivedEntityId)> {
    let artifacts = open_edge_artifacts(generation);
    let endpoints = artifacts
        .endpoints
        .u64_le_pairs()
        .expect("the endpoint column is little-endian u64 pairs");
    let codec = test_codec(atlas);
    let wire = |row: u64| {
        codec
            .encode(
                NodeRowId::from_u32(u32::try_from(row).expect("fixture rows fit u32")),
                atlas.node_universe(),
            )
            .get()
    };

    endpoints
        .iter()
        .enumerate()
        .map(|(row, pair)| {
            let [source, target] = pair.map(zerocopy::U64::get);
            (
                wire(source),
                wire(target),
                edge_identity_of(u32::try_from(row).expect("fixture edge rows fit u32")),
            )
        })
        .collect()
}

/// The wire id of the fitted node owning `seed`, whose row is the seed by the seeding rule.
fn node_wire(atlas: &Atlas, seed: u8) -> u32 {
    test_codec(atlas)
        .encode(NodeRowId::from_u32(u32::from(seed)), atlas.node_universe())
        .get()
}

/// The delivered `EDGE_IDS` records of one response.
fn edge_ids_of(bytes: &[u8]) -> Vec<ArchivedEntityId> {
    section(bytes, EDGE_IDS)
        .expect("EDGE_IDS is present")
        .as_chunks::<32>()
        .0
        .iter()
        .map(|record| {
            *zerocopy::FromBytes::ref_from_bytes(record.as_slice())
                .expect("EDGE_IDS records are identity-sized")
        })
        .collect()
}

/// A scoped proof admitting every fitted row, `slots`, and exactly `links`.
fn admitting(atlas: &Atlas, slots: &[NodeRowId], links: &[u8]) -> VisibilityProof {
    let rows = u32::try_from(atlas.row_ids().len()).expect("fixture domains fit u32");
    let edges = u32::try_from(atlas.endpoints.view().len()).expect("fixture domains fit u32");

    VisibilityProof::from_masks(
        CompressedBitSet::from_rows(
            (0..rows)
                .map(NodeRowId::from_u32)
                .chain(slots.iter().copied()),
        ),
        CompressedBitSet::from_rows((0..edges).map(EdgeRowId::from_u32)),
        links.iter().map(|&seed| archived_id(seed)).collect(),
    )
}

/// Serves one edges request over `proof` and `cohort`, with `ingress` as the request's capture.
fn edges_with(
    atlas: &Atlas,
    proof: &VisibilityProof,
    cohort: PlacementCohort<'_>,
    ingress: Option<&DeltaSnapshot>,
    tiles: Vec<crate::salt::wire::tile::TileCoordinate>,
    limits: EdgesLimits,
) -> Vec<u8> {
    let mut bound = Bound::resolved(atlas, proof, cohort, CutOffset::ZERO);
    if let Some(ingress) = ingress {
        bound = bound.withdrawing(ingress);
    }

    atlas
        .edges(
            &edges_request(tiles),
            limits,
            bound.view(atlas),
            UntouchedStore,
        )
        .expect("the edges request is on the served grid")
}

/// A corpus view serves every published link, merged into the identity order, byte-exactly.
///
/// The link identities straddle the fitted edge identities, so the expectation pins the merge
/// rather than an appended tail: one delta edge leads the column and one closes it. The repeat
/// call pins determinism across the cohort map's iteration order, and the empty-cohort control
/// answers the fitted set alone on the same path.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn corpus_link_identity_order() {
    let (generation, atlas) = publish("delta-edges-corpus").await;
    let snapshot = publishing(&atlas, &[], &[(LOW_LINK, 0, 1), (HIGH_LINK, 2, 3)]);
    let cohort = PlacementCohort::of(Some(&snapshot));
    let fitted = fitted_triples(&atlas, &generation);

    let mut merged = vec![(
        node_wire(&atlas, 0),
        node_wire(&atlas, 1),
        archived_id(LOW_LINK),
    )];
    merged.extend(fitted.iter().copied());
    merged.push((
        node_wire(&atlas, 2),
        node_wire(&atlas, 3),
        archived_id(HIGH_LINK),
    ));
    let expected = expected_edges_bytes(&generation, true, &EdgeColumns::pinned(merged));

    let serve = |cohort| {
        edges_with(
            &atlas,
            &FULL,
            cohort,
            None,
            full_grid(),
            EdgesLimits::default(),
        )
    };

    let first = serve(cohort);
    assert_eq!(first, expected, "delta links merge into the identity order");
    assert_eq!(
        serve(cohort),
        first,
        "the delta-bearing response is deterministic"
    );

    let control = expected_edges_bytes(&generation, true, &EdgeColumns::pinned(fitted));
    assert_eq!(
        serve(PlacementCohort::EMPTY),
        control,
        "an empty cohort serves the fitted set alone"
    );
}

/// A scoped proof serves exactly the links its own resolution admitted.
///
/// Both directions on one path: widening the admitted set from one link to both adds exactly
/// the second link's row, and the empty set serves the fitted edges alone even while the cohort
/// publishes both links.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn scoped_admitted_links() {
    let (generation, atlas) = publish("delta-edges-admission").await;
    let snapshot = publishing(&atlas, &[], &[(LOW_LINK, 0, 1), (HIGH_LINK, 2, 3)]);
    let cohort = PlacementCohort::of(Some(&snapshot));
    let fitted = fitted_triples(&atlas, &generation);

    let serve = |links: &[u8]| {
        edges_with(
            &atlas,
            &admitting(&atlas, &[], links),
            cohort,
            None,
            full_grid(),
            EdgesLimits::default(),
        )
    };

    let low = (
        node_wire(&atlas, 0),
        node_wire(&atlas, 1),
        archived_id(LOW_LINK),
    );
    let high = (
        node_wire(&atlas, 2),
        node_wire(&atlas, 3),
        archived_id(HIGH_LINK),
    );

    let mut one = vec![low];
    one.extend(fitted.iter().copied());
    assert_eq!(
        serve(&[LOW_LINK]),
        expected_edges_bytes(&generation, true, &EdgeColumns::pinned(one.clone())),
        "the admitted link serves"
    );

    let mut both = one;
    both.push(high);
    assert_eq!(
        serve(&[LOW_LINK, HIGH_LINK]),
        expected_edges_bytes(&generation, true, &EdgeColumns::pinned(both)),
        "widening the admitted set adds exactly the second link"
    );

    assert_eq!(
        serve(&[]),
        expected_edges_bytes(&generation, true, &EdgeColumns::pinned(fitted)),
        "an unadmitted link never serves, whatever the cohort publishes"
    );
}

/// An arrival endpoint qualifies exactly when the arrival serves.
///
/// One link attaches the anchor node to a placed arrival and a control link attaches the anchor
/// to itself. Listing both tiles serves both links. Dropping the arrival's tile from the list
/// drops the arrival-endpoint link alone, and hiding the slot from the proof drops it again
/// with both tiles listed, while the self-loop control survives every case.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn arrival_endpoint_qualification() {
    let (_generation, atlas) = publish("delta-edges-arrival").await;
    let (vacant, arrival_tile) = vacant_cell(&atlas);

    let anchor_position = BasePosition::MIN;
    let anchor_row = atlas.row_ids()[anchor_position];
    let anchor_seed = u8::try_from(anchor_row.as_u32()).expect("fixture rows fit u8");
    let depth = Depth::new(FIXTURE_LOD.max_tile_depth).expect("the fixture depth is a depth");
    let anchor_tile = coordinate_of(atlas.morton.code(anchor_position).cell(depth));

    let snapshot = publishing(
        &atlas,
        &[(ARRIVAL, vacant)],
        &[
            (HIGH_LINK, anchor_seed, ARRIVAL),
            (LOW_LINK, anchor_seed, anchor_seed),
        ],
    );
    let cohort = PlacementCohort::of(Some(&snapshot));
    let slot = NodeRowId::from_usize(atlas.node_universe().size());

    let ids = |proof: &VisibilityProof, tiles: Vec<_>| {
        edge_ids_of(&edges_with(
            &atlas,
            proof,
            cohort,
            None,
            tiles,
            EdgesLimits::default(),
        ))
    };

    let widened = admitting(&atlas, &[slot], &[LOW_LINK, HIGH_LINK]);
    let served = ids(&widened, vec![anchor_tile, arrival_tile]);
    assert!(
        served.contains(&archived_id(HIGH_LINK)) && served.contains(&archived_id(LOW_LINK)),
        "both links serve while the arrival delivers: {served:?}"
    );

    let undelivered = ids(&widened, vec![anchor_tile]);
    assert!(
        !undelivered.contains(&archived_id(HIGH_LINK)),
        "the arrival-endpoint link drops when its tile is unlisted"
    );
    assert!(
        undelivered.contains(&archived_id(LOW_LINK)),
        "the self-loop control survives the narrowed tile list"
    );

    let slotless = admitting(&atlas, &[], &[LOW_LINK, HIGH_LINK]);
    let hidden = ids(&slotless, vec![anchor_tile, arrival_tile]);
    assert!(
        !hidden.contains(&archived_id(HIGH_LINK)),
        "the arrival-endpoint link drops when the proof hides the slot"
    );
    assert!(
        hidden.contains(&archived_id(LOW_LINK)),
        "the self-loop control survives the hidden slot"
    );
}

/// The ingress capture's withdrawn identity set filters what the retained cohort serves.
///
/// The entry keeps its cohort while three later captures withdraw the link itself, a fitted
/// endpoint, and an arrival endpoint, each killing exactly its own edge at the next request.
/// The control capture withdraws an identity the response never names and answers byte-exactly
/// the capture-free response.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn withdrawal_kills_retained_link() {
    let (generation, atlas) = publish("delta-edges-ingress").await;
    let (vacant, _) = vacant_cell(&atlas);
    let snapshot = publishing(
        &atlas,
        &[(ARRIVAL, vacant)],
        &[(LOW_LINK, 0, 1), (HIGH_LINK, 0, ARRIVAL)],
    );
    let cohort = PlacementCohort::of(Some(&snapshot));
    let slot = NodeRowId::from_usize(atlas.node_universe().size());
    let slot_wire = test_codec(&atlas).encode(slot, snapshot.universe());
    let fitted = fitted_triples(&atlas, &generation);

    let serve = |ingress: Option<&DeltaSnapshot>| {
        edges_with(
            &atlas,
            &FULL,
            cohort,
            ingress,
            full_grid(),
            EdgesLimits::default(),
        )
    };

    let mut merged = vec![(
        node_wire(&atlas, 0),
        node_wire(&atlas, 1),
        archived_id(LOW_LINK),
    )];
    merged.extend(fitted.iter().copied());
    merged.push((
        node_wire(&atlas, 0),
        slot_wire.get(),
        archived_id(HIGH_LINK),
    ));

    let held = serve(None);
    assert_eq!(
        held,
        expected_edges_bytes(&generation, true, &EdgeColumns::pinned(merged)),
        "the retained cohort serves both links before any withdrawal"
    );

    let link_withdrawn = edge_ids_of(&serve(Some(&withdrawing(&atlas, &[LOW_LINK]))));
    assert!(
        !link_withdrawn.contains(&archived_id(LOW_LINK)),
        "withdrawing the link itself kills its edge"
    );
    assert!(
        link_withdrawn.contains(&archived_id(HIGH_LINK)),
        "the unrelated link survives the link withdrawal"
    );

    let endpoint_withdrawn = edge_ids_of(&serve(Some(&withdrawing(&atlas, &[1]))));
    assert!(
        !endpoint_withdrawn.contains(&archived_id(LOW_LINK)),
        "withdrawing a fitted endpoint kills the edge through the delivered set"
    );
    assert!(
        endpoint_withdrawn.contains(&archived_id(HIGH_LINK)),
        "the unrelated link survives the endpoint withdrawal"
    );

    let arrival_withdrawn = edge_ids_of(&serve(Some(&withdrawing(&atlas, &[ARRIVAL]))));
    assert!(
        !arrival_withdrawn.contains(&archived_id(HIGH_LINK)),
        "withdrawing the arrival endpoint kills its incident delta edge"
    );
    assert!(
        arrival_withdrawn.contains(&archived_id(LOW_LINK)),
        "the fitted-endpoint link survives the arrival withdrawal"
    );

    assert_eq!(
        serve(Some(&withdrawing(&atlas, &[60]))),
        held,
        "a capture withdrawing nothing the response names moves no byte"
    );
}

/// The rank-ordered cap selects over the fitted-plus-delta union, arrivals ranking last.
///
/// A cap of the fitted count drops exactly the arrival-endpoint link, because an arrival
/// endpoint ranks past every generation row, and the head reports the truncation. One more
/// slot serves the whole union complete.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn cap_ranks_arrivals_last() {
    let (generation, atlas) = publish("delta-edges-cap").await;
    let (vacant, _) = vacant_cell(&atlas);
    let snapshot = publishing(&atlas, &[(ARRIVAL, vacant)], &[(HIGH_LINK, 0, ARRIVAL)]);
    let cohort = PlacementCohort::of(Some(&snapshot));
    let slot = NodeRowId::from_usize(atlas.node_universe().size());
    let slot_wire = test_codec(&atlas).encode(slot, snapshot.universe());
    let fitted = fitted_triples(&atlas, &generation);
    let fitted_count = u32::try_from(fitted.len()).expect("fixture edge counts fit u32");

    let serve = |edges: u32| {
        edges_with(
            &atlas,
            &FULL,
            cohort,
            None,
            full_grid(),
            EdgesLimits {
                edges,
                ..EdgesLimits::default()
            },
        )
    };

    assert_eq!(
        serve(fitted_count),
        expected_edges_bytes(&generation, false, &EdgeColumns::pinned(fitted.clone())),
        "the cap drops the arrival-endpoint link first and reports the truncation"
    );

    let mut whole = fitted;
    whole.push((
        node_wire(&atlas, 0),
        slot_wire.get(),
        archived_id(HIGH_LINK),
    ));
    assert_eq!(
        serve(fitted_count + 1),
        expected_edges_bytes(&generation, true, &EdgeColumns::pinned(whole)),
        "one more slot serves the whole union complete"
    );
}

/// A union candidate's selection key beside its expected wire triple.
type KeyedTriple = ((u32, ArchivedEntityId), (u32, u32, ArchivedEntityId));

/// The fixture's endpoint row pairs and each node row's importance rank, from the edge artifacts.
fn endpoint_ranks(generation: &Generation) -> (Vec<[u64; 2]>, Vec<u32>) {
    let artifacts = open_edge_artifacts(generation);
    let endpoints = artifacts
        .endpoints
        .u64_le_pairs()
        .expect("the endpoint column is little-endian u64 pairs")
        .iter()
        .map(|pair| pair.map(zerocopy::U64::get))
        .collect();
    let ranks: Vec<u32> = artifacts
        .ranks
        .column::<BasePosition, ImportanceRank>()
        .expect("the rank column holds importance ranks")
        .as_raw()
        .iter()
        .map(|rank| rank.as_u32())
        .collect();
    let row_ranks = artifacts
        .positions
        .column::<NodeRowId, BasePosition>()
        .expect("the position column holds base positions")
        .as_raw()
        .iter()
        .map(|position| ranks[position.as_usize()])
        .collect();

    (endpoints, row_ranks)
}

/// A truncating cap admits a winning delta link and drops arrival-endpoint links unpriced.
///
/// The cap sits strictly below the fitted count, so the fitted walk itself truncates. The
/// cohort publishes one link between the two best-ranked rows, whose identity sorts before
/// every fitted edge, so its key wins a seat in a selection that is already dropping fitted
/// edges - the fold must keep pricing delta links after truncation begins. The arrival-endpoint
/// link keys past every fitted candidate and stays out. The expectation is the full-sort law
/// over the union, the same selection the bounded fold must reproduce.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn truncating_cap_admits_winner() {
    let (generation, atlas) = publish("delta-edges-rank-cap").await;
    let (endpoints, row_ranks) = endpoint_ranks(&generation);
    let rank_of_row = |row: usize| row_ranks[row];

    // The published link attaches the best-ranked row pair, ties on the row. Its worse-endpoint
    // rank therefore ties or beats every fitted edge's, and any tie falls to its lower identity.
    let mut by_rank: Vec<(u32, usize)> = (0..row_ranks.len())
        .map(|row| (rank_of_row(row), row))
        .collect();
    by_rank.sort_unstable();
    let (best, second) = (by_rank[0].1, by_rank[1].1);
    let best_seed = u8::try_from(best).expect("fixture rows fit u8");
    let second_seed = u8::try_from(second).expect("fixture rows fit u8");

    let fitted = fitted_triples(&atlas, &generation);
    // The union under the selection key: every fitted edge and the published link, keyed by
    // worse-endpoint rank with ties on identity bytes. The arrival-endpoint link keys past
    // every fitted candidate, so the fitted-domain key covers the whole competition and the
    // link's absence is asserted on the delivered ids instead.
    let mut union: Vec<KeyedTriple> = endpoints
        .iter()
        .zip(&fitted)
        .map(|(&[source, target], &triple)| {
            let worse = rank_of_row(usize::try_from(source).expect("fixture rows fit usize")).max(
                rank_of_row(usize::try_from(target).expect("fixture rows fit usize")),
            );
            ((worse, triple.2), triple)
        })
        .collect();
    union.push((
        (
            rank_of_row(best).max(rank_of_row(second)),
            archived_id(LOW_LINK),
        ),
        (
            node_wire(&atlas, best_seed),
            node_wire(&atlas, second_seed),
            archived_id(LOW_LINK),
        ),
    ));
    union.sort_unstable_by_key(|&(key, _)| key);
    union.truncate(2);
    assert!(
        union
            .iter()
            .any(|&(_, (.., id))| id == archived_id(LOW_LINK)),
        "the charter needs the published link winning a seat"
    );
    let mut kept: Vec<(u32, u32, ArchivedEntityId)> =
        union.into_iter().map(|(_, triple)| triple).collect();
    kept.sort_unstable_by_key(|&(.., id)| id);

    let (vacant, _) = vacant_cell(&atlas);
    let snapshot = publishing(
        &atlas,
        &[(ARRIVAL, vacant)],
        &[(LOW_LINK, best_seed, second_seed), (HIGH_LINK, 0, ARRIVAL)],
    );
    let cohort = PlacementCohort::of(Some(&snapshot));

    let capped = edges_with(
        &atlas,
        &FULL,
        cohort,
        None,
        full_grid(),
        EdgesLimits {
            edges: 2,
            ..EdgesLimits::default()
        },
    );
    assert_eq!(
        capped,
        expected_edges_bytes(&generation, false, &EdgeColumns::pinned(kept)),
        "the truncating cap keeps exactly the full-sort head of the union"
    );
    assert!(
        !edge_ids_of(&capped).contains(&archived_id(HIGH_LINK)),
        "the arrival-endpoint link stays out of a selection full of fitted keys"
    );

    let slot = NodeRowId::from_usize(atlas.node_universe().size());
    let slot_wire = test_codec(&atlas).encode(slot, snapshot.universe());
    let mut whole = vec![(
        node_wire(&atlas, best_seed),
        node_wire(&atlas, second_seed),
        archived_id(LOW_LINK),
    )];
    whole.extend(fitted.iter().copied());
    whole.push((
        node_wire(&atlas, 0),
        slot_wire.get(),
        archived_id(HIGH_LINK),
    ));
    assert_eq!(
        edges_with(
            &atlas,
            &FULL,
            cohort,
            None,
            full_grid(),
            EdgesLimits::default()
        ),
        expected_edges_bytes(&generation, true, &EdgeColumns::pinned(whole)),
        "the uncapped serve delivers the whole union complete"
    );
}

/// A full cap stays complete when the delta link refuses, and truncates when it qualifies.
///
/// Both serves cap at exactly the fitted count, and the cohort publishes one arrival and one
/// link onto it. Withdrawing the arrival removes the link's endpoint from the delivered sets,
/// so the link refuses and the full selection stays complete - a full cap alone is not a
/// truncation. Retaining the arrival makes the link qualify, so it falls to the same cap and
/// the head reports the truncation. The delivered columns are the fitted set either way, and
/// only the completeness bit separates the two.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn full_cap_refusal_vs_truncation() {
    let (generation, atlas) = publish("delta-edges-full-cap").await;
    let (vacant, _) = vacant_cell(&atlas);
    let snapshot = publishing(&atlas, &[(ARRIVAL, vacant)], &[(HIGH_LINK, 0, ARRIVAL)]);
    let cohort = PlacementCohort::of(Some(&snapshot));
    let fitted = fitted_triples(&atlas, &generation);
    let limits = EdgesLimits {
        edges: u32::try_from(fitted.len()).expect("fixture edge counts fit u32"),
        ..EdgesLimits::default()
    };

    let withdrawn = withdrawing(&atlas, &[ARRIVAL]);
    assert_eq!(
        edges_with(&atlas, &FULL, cohort, Some(&withdrawn), full_grid(), limits),
        expected_edges_bytes(&generation, true, &EdgeColumns::pinned(fitted.clone())),
        "a link refused at the endpoint rule leaves the full cap complete"
    );

    assert_eq!(
        edges_with(&atlas, &FULL, cohort, None, full_grid(), limits),
        expected_edges_bytes(&generation, false, &EdgeColumns::pinned(fitted)),
        "the qualifying link falls to the same cap and the head reports it"
    );
}

/// A store answering per uuid map, asserting the one order the trailer places.
///
/// The expected order is the distinct representative uuids in first-occurrence order over the
/// delivered slots, delta and fitted alike, so the assertion pins that hydration stopped
/// splitting the arms. The order is an internal convention rather than a wire property -
/// `Table::new` bytewise-sorts every trailer table, so the wire is order-invariant - and the
/// assertion pins the convention the store observes.
struct ExpectedTypesStore {
    /// The distinct representative uuids the order must name, in first-occurrence order.
    expected: Vec<ArchivedOntologyTypeUuid>,
    /// The resolved URL per uuid. An unlisted uuid answers `None`.
    urls: FastHashMap<ArchivedOntologyTypeUuid, VersionedUrl>,
}

impl EdgesStore for ExpectedTypesStore {
    #[expect(
        clippy::panic_in_result_fn,
        reason = "the merged order is the contract under test, and the assertion is its witness"
    )]
    fn hydrate(
        self,
        types: &IdSlice<TypeSlot, ArchivedOntologyTypeUuid>,
    ) -> Result<IdVec<TypeSlot, Option<VersionedUrl>>, DetailError> {
        assert_eq!(
            types.iter().copied().collect::<Vec<_>>(),
            self.expected,
            "the one order names the distinct representative uuids in first-occurrence order"
        );

        Ok(types
            .iter()
            .map(|uuid| self.urls.get(uuid).cloned())
            .collect())
    }
}

/// The detail trailer carries each delta link's captured display at its own merged slot.
///
/// The delta link's identity sorts before every fitted edge, so its captured label and interned
/// type occupy the column head rather than a tail, and its representative uuid takes the merged
/// order's first slot. The fitted labels stay the generation's payloads, empty under the
/// fixture's identity rewrite.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn delta_display_head_slot() {
    let (generation, atlas) = publish("delta-edges-trailer").await;
    let url: VersionedUrl = "https://example.com/wired/v/1"
        .parse()
        .expect("the fixture URL parses");
    let delta_uuid = ArchivedOntologyTypeUuid::from_url(&url);
    let wired = OwnedLabel::from("wired");
    let snapshot = publishing_displayed(
        &atlas,
        &[],
        &[(LOW_LINK, 0, 1)],
        &DisplayParts {
            label: wired.clone(),
            icon: OwnedIcon::from("wired-icon"),
            representative: delta_uuid,
        },
    );
    let fitted = fitted_triples(&atlas, &generation);

    let mut request = edges_request(full_grid());
    request.detail = EdgesDetail::Auxiliary;
    let bound = Bound::resolved(
        &atlas,
        &FULL,
        PlacementCohort::of(Some(&snapshot)),
        CutOffset::ZERO,
    );
    let bytes = atlas
        .edges(
            &request,
            EdgesLimits::default(),
            bound.view(&atlas),
            ExpectedTypesStore {
                expected: {
                    let rows: Vec<u32> = (0..u32::try_from(fitted.len())
                        .expect("fixture edge rows fit u32"))
                        .collect();
                    let mut expected = vec![delta_uuid];
                    expected.extend(type_expectations(&generation, &rows).2);
                    expected
                },
                urls: FastHashMap::from_iter([(delta_uuid, url.clone())]),
            },
        )
        .expect("the detail request serves");

    let mut merged = vec![(
        node_wire(&atlas, 0),
        node_wire(&atlas, 1),
        archived_id(LOW_LINK),
    )];
    merged.extend(fitted.iter().copied());
    let columns = EdgeColumns::pinned(merged);

    let type_table = [alloc::borrow::Cow::Owned(url.to_string())];
    let mut labels: Vec<&Label> = vec![&wired];
    labels.extend(core::iter::repeat_n(Label::EMPTY, fitted.len()));
    let mut type_ids = vec![Some(crate::serve::intern::TableIndex::new(0))];
    type_ids.extend(core::iter::repeat_n(None, fitted.len()));

    let expected = EdgesResponse {
        generation: generation.id().digest(),
        variant: 0,
        complete: true,
        edges: &columns,
        trailer: Some(EdgesTrailer {
            type_table: IdSlice::from_raw(&type_table),
            link_labels: IdSlice::from_raw(&labels),
            link_type_ids: IdSlice::from_raw(&type_ids),
        }),
    }
    .encode();
    assert_eq!(
        bytes, expected,
        "the delta display rides the head slot of the merged trailer"
    );
}

/// The fixture geometry with each edge's type cycling over the three ontology rows.
///
/// The shared fixture gives every edge one ontology row, so a single uuid satisfies any
/// scatter of the fitted order. Cycling the rows delivers repeated representatives in an
/// interleaved order, which makes the trailer's dedup and its first-occurrence order both
/// observable.
fn cycling_types_dataset() -> crate::dataset::memory::MemoryDataset {
    use smallvec::smallvec;
    use zerocopy::{LE, U64};

    use crate::{
        dataset::{Edge, Ontology, card::Card, memory::MemoryDataset},
        identity::OntologyRowId,
    };

    let (nodes, canonical) =
        super::fixture_nodes(|row| smallvec![OntologyRowId::from_usize(row & 1)]);

    let edges = super::FIXTURE_EDGES
        .into_iter()
        .zip([0_usize, 1, 2].into_iter().cycle())
        .map(|((id, source, target), ontology_row)| Edge {
            id: U64::<LE>::new(id),
            source: NodeRowId::new(source),
            target: NodeRowId::new(target),
            ontology: smallvec![OntologyRowId::from_usize(ontology_row)],
            embedding: None,
            confidence: None,
            source_confidence: None,
            target_confidence: None,
        })
        .collect();

    let ontology = vec![
        Ontology {
            id: U64::<LE>::new(0),
            parents: smallvec![],
        },
        Ontology {
            id: U64::<LE>::new(1),
            parents: smallvec![],
        },
        Ontology {
            id: U64::<LE>::new(2),
            parents: smallvec![],
        },
    ];
    let cards = std::collections::HashMap::from([
        (0, Card::verbatim("Person entity card".to_owned())),
        (1, Card::verbatim("Company entity card".to_owned())),
        (2, Card::verbatim("Employment link card".to_owned())),
    ]);

    MemoryDataset::new(nodes, edges, ontology, canonical, cards)
}

/// The trailer resolves several fitted representatives beside a delta display in one response.
///
/// The cycling dataset delivers three distinct representative uuids, so the merged order's
/// dedup and first-occurrence contract are exercised beyond one uuid while the delta link's
/// captured display occupies the head slot of the same trailer. Expected values derive from the
/// published artifacts alone, through [`type_expectations`].
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn compose_trailer_types() {
    let (generation, atlas) =
        super::publish_dataset("delta-edges-composed-trailer", &cycling_types_dataset()).await;
    let delta_url: VersionedUrl = "https://example.com/wired/v/1"
        .parse()
        .expect("the fixture URL parses");
    let delta_uuid = ArchivedOntologyTypeUuid::from_url(&delta_url);
    let wired = OwnedLabel::from("wired");
    let snapshot = publishing_displayed(
        &atlas,
        &[],
        &[(LOW_LINK, 0, 1)],
        &DisplayParts {
            label: wired.clone(),
            icon: OwnedIcon::from("wired-icon"),
            representative: delta_uuid,
        },
    );
    let fitted = fitted_triples(&atlas, &generation);

    let rows: Vec<u32> =
        (0..u32::try_from(fitted.len()).expect("fixture edge rows fit u32")).collect();
    let (mut urls, fitted_urls, expected_asked) = type_expectations(&generation, &rows);
    assert!(
        expected_asked.len() > 1,
        "the cycling dataset delivers more than one distinct representative"
    );
    urls.insert(delta_uuid, delta_url.clone());

    let mut request = edges_request(full_grid());
    request.detail = EdgesDetail::Auxiliary;
    let bound = Bound::resolved(
        &atlas,
        &FULL,
        PlacementCohort::of(Some(&snapshot)),
        CutOffset::ZERO,
    );
    let bytes = atlas
        .edges(
            &request,
            EdgesLimits::default(),
            bound.view(&atlas),
            ExpectedTypesStore {
                expected: {
                    let mut expected = vec![delta_uuid];
                    expected.extend(expected_asked);
                    expected
                },
                urls,
            },
        )
        .expect("the detail request serves");

    let mut merged = vec![(
        node_wire(&atlas, 0),
        node_wire(&atlas, 1),
        archived_id(LOW_LINK),
    )];
    merged.extend(fitted.iter().copied());
    let columns = EdgeColumns::pinned(merged);

    let merged_urls: Vec<Option<VersionedUrl>> = core::iter::once(Some(delta_url))
        .chain(fitted_urls)
        .collect();
    let table = crate::serve::intern::Table::new(merged_urls.iter().flatten());
    let type_ids: Vec<Option<crate::serve::intern::TableIndex<VersionedUrl>>> = merged_urls
        .iter()
        .map(|url| url.as_ref().map(|url| table.index_of(url)))
        .collect();
    let mut labels: Vec<&Label> = vec![&wired];
    labels.extend(core::iter::repeat_n(Label::EMPTY, fitted.len()));

    let expected = EdgesResponse {
        generation: generation.id().digest(),
        variant: 0,
        complete: true,
        edges: &columns,
        trailer: Some(EdgesTrailer {
            type_table: table.entries(),
            link_labels: IdSlice::from_raw(&labels),
            link_type_ids: IdSlice::from_raw(&type_ids),
        }),
    }
    .encode();
    assert_eq!(
        bytes, expected,
        "the merged trailer carries each fitted representative's URL beside the delta display"
    );
}

/// A revised fitted link's captured display reaches the edges trailer, overriding the
/// generation legend at that edge's own slot alone.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn revised_fitted_trailer_overlay() {
    let (generation, atlas) = publish("revised-fitted-trailer").await;
    let fitted = fitted_triples(&atlas, &generation);

    // Fitted edge row 0's identity under the rewrite rule.
    let revised_seed = 64_u8;
    assert_eq!(
        archived_id(revised_seed),
        edge_identity_of(0),
        "the witness revises fitted edge row 0"
    );

    let captured: VersionedUrl = "https://example.com/wired/v/1"
        .parse()
        .expect("the fixture URL parses");
    let captured_uuid = ArchivedOntologyTypeUuid::from_url(&captured);
    let revised_label = OwnedLabel::from("revised");

    let mut register = DeltaRegister::new(
        atlas.node_universe(),
        atlas.edge_universe(),
        atlas.ontology_universe(),
    );
    let event = EntityEvent::Updated(EntityUpdate {
        entity: store_id(revised_seed),
        edition: EntityEditionId::new(Uuid::from_u128(u128::from(revised_seed))),
        archived: false,
        changed_at: Timestamp::from_unix_timestamp(1),
    });
    register.apply(DeltaEvent::from(&event));
    register
        .capture_display(
            archived_id(revised_seed),
            EntityEditionId::new(Uuid::from_u128(u128::from(revised_seed))),
            &revised_label,
            Icon::new("revised-icon"),
            captured_uuid,
            &atlas,
        )
        .expect("the fixture ontology domain has room");
    let snapshot = register.snapshot(
        &atlas,
        DeltaRevision::FIRST,
        Timestamp::from_unix_timestamp(2),
    );
    assert!(
        snapshot.legend_of(archived_id(revised_seed)).is_some(),
        "publication carries the revised fitted identity's capture"
    );

    let fitted_url: VersionedUrl = fixture_type_url(2).parse().expect("the fixture URL parses");
    let fitted_uuid = ArchivedOntologyTypeUuid::from_url(&fitted_url);

    let mut request = edges_request(full_grid());
    request.detail = EdgesDetail::Auxiliary;
    let bound = Bound::resolved(
        &atlas,
        &FULL,
        PlacementCohort::of(Some(&snapshot)),
        CutOffset::ZERO,
    );
    let bytes = atlas
        .edges(
            &request,
            EdgesLimits::default(),
            bound.view(&atlas),
            ExpectedTypesStore {
                // The revised slot delivers first, so its captured uuid heads the merged order.
                expected: vec![captured_uuid, fitted_uuid],
                urls: FastHashMap::from_iter([
                    (captured_uuid, captured.clone()),
                    (fitted_uuid, fitted_url.clone()),
                ]),
            },
        )
        .expect("the detail request serves");

    let columns = EdgeColumns::pinned(fitted.iter().copied());
    let type_table = [
        alloc::borrow::Cow::Owned(fitted_url.to_string()),
        alloc::borrow::Cow::Owned(captured.to_string()),
    ];
    let mut labels: Vec<&Label> = vec![&revised_label];
    labels.extend(core::iter::repeat_n(Label::EMPTY, fitted.len() - 1));
    let mut type_ids = vec![Some(crate::serve::intern::TableIndex::new(1))];
    type_ids.extend(core::iter::repeat_n(
        Some(crate::serve::intern::TableIndex::new(0)),
        fitted.len() - 1,
    ));

    let expected = EdgesResponse {
        generation: generation.id().digest(),
        variant: 0,
        complete: true,
        edges: &columns,
        trailer: Some(EdgesTrailer {
            type_table: IdSlice::from_raw(&type_table),
            link_labels: IdSlice::from_raw(&labels),
            link_type_ids: IdSlice::from_raw(&type_ids),
        }),
    }
    .encode();
    assert_eq!(
        bytes, expected,
        "the revised fitted link's capture overrides its legend at its own slot alone"
    );
}

/// A candidate's rank in the union order, derived independently of `EndpointRank`.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum OracleRank {
    /// A generation row's importance rank.
    Fitted(u32),
    /// A placed arrival's identity.
    Arrival(ArchivedEntityId),
}

/// The oracle union over one trial's survivors, keyed by (worse endpoint rank, identity).
///
/// Fitted rows enter minus the withdrawn identities, and every drawn link whose endpoints both
/// resolve enters with the worse endpoint's rank, so the union is exactly what the fold may
/// select from.
fn fold_oracle_union(
    atlas: &Atlas,
    endpoints: &[[u64; 2]],
    row_ranks: &[u32],
    fitted: &[(u32, u32, ArchivedEntityId)],
    withdrawn_edges: &[u8],
    links: &[(u8, u8, u8)],
    slot_wire: u32,
) -> Vec<OracleCandidate<OracleRank>> {
    let mut union: Vec<OracleCandidate<OracleRank>> = Vec::new();
    for (row, (&[source, target], &triple)) in endpoints.iter().zip(fitted).enumerate() {
        if withdrawn_edges.contains(&(super::EDGE_SEED + u8::try_from(row).expect("small"))) {
            continue;
        }
        let worse = row_ranks[usize::try_from(source).expect("small")]
            .max(row_ranks[usize::try_from(target).expect("small")]);
        union.push(((OracleRank::Fitted(worse), triple.2), triple));
    }
    for &(seed, source, target) in links {
        let resolve = |endpoint: u8| -> Option<(OracleRank, u32)> {
            if endpoint == ARRIVAL {
                Some((OracleRank::Arrival(archived_id(ARRIVAL)), slot_wire))
            } else if usize::from(endpoint) < row_ranks.len() {
                Some((
                    OracleRank::Fitted(row_ranks[usize::from(endpoint)]),
                    node_wire(atlas, endpoint),
                ))
            } else {
                None
            }
        };
        let (Some((source_rank, source_wire)), Some((target_rank, target_wire))) =
            (resolve(source), resolve(target))
        else {
            continue;
        };

        union.push((
            (source_rank.max(target_rank), archived_id(seed)),
            (source_wire, target_wire, archived_id(seed)),
        ));
    }
    union.sort_unstable_by_key(|&(key, _)| key);
    union
}

/// Differential: the fold's selection equals full-sort-then-truncate, at every cap.
///
/// Randomised cohorts over the published fixture, each swept across every cap from zero to one
/// past the union size, against an oracle built from the artifacts alone: the union sorted by
/// (worse endpoint rank, identity), truncated, re-sorted by identity, with `complete` read as
/// `union.len() <= cap`. Withdrawn fitted link identities put non-qualifying candidates in the
/// walk, so the exactly-cap completeness law is under test at every trial.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn fold_matches_full_sort() {
    let (generation, atlas) = publish("review-fold-differential").await;
    let (endpoints, row_ranks) = endpoint_ranks(&generation);
    let fitted = fitted_triples(&atlas, &generation);
    let (vacant, _) = vacant_cell(&atlas);
    let slot = NodeRowId::from_usize(atlas.node_universe().size());

    let mut rng = keyed_rng(0x243F_6A88_85A3_08D3, 0, 0);
    let mut next =
        move |bound: u64| uniform_below(&mut rng, NonZero::new(bound).expect("a positive bound"));

    let mut mismatches: Vec<String> = Vec::new();
    for trial in 0..16_u32 {
        let count = if trial < 3 {
            0
        } else {
            1 + usize::try_from(next(LINK_SEEDS.len() as u64)).expect("small")
        };
        let mut links: Vec<(u8, u8, u8)> = Vec::new();
        for &seed in &LINK_SEEDS[..count] {
            let endpoint = |kind: u64, row: u64| -> u8 {
                match kind {
                    0 | 1 => ARRIVAL,
                    2 => REFUSED,
                    _ => u8::try_from(row).expect("fixture rows fit u8"),
                }
            };
            let source = endpoint(next(16), next(48));
            let target = endpoint(next(16), next(48));
            links.push((seed, source, target));
        }

        // Withdrawn fitted link identities: candidates the walk reaches and the rule refuses.
        let withdrawn_edges: Vec<u8> = (0..u8::try_from(fitted.len()).expect("small"))
            .filter(|_| next(4) == 0)
            .map(|row| super::EDGE_SEED + row)
            .collect();
        let capture = withdrawing(&atlas, &withdrawn_edges);
        let ingress = (!withdrawn_edges.is_empty()).then_some(&capture);

        let snapshot = publishing(&atlas, &[(ARRIVAL, vacant)], &links);
        let cohort = PlacementCohort::of(Some(&snapshot));
        let slot_wire = test_codec(&atlas).encode(slot, snapshot.universe()).get();

        let union = fold_oracle_union(
            &atlas,
            &endpoints,
            &row_ranks,
            &fitted,
            &withdrawn_edges,
            &links,
            slot_wire,
        );

        for cap in 0..=(union.len() + 1) {
            let mut kept: Vec<(u32, u32, ArchivedEntityId)> =
                union.iter().take(cap).map(|&(_, triple)| triple).collect();
            kept.sort_unstable_by_key(|&(.., id)| id);

            let served = edges_with(
                &atlas,
                &FULL,
                cohort,
                ingress,
                full_grid(),
                EdgesLimits {
                    edges: u32::try_from(cap).expect("small"),
                    ..EdgesLimits::default()
                },
            );
            let expected = expected_edges_bytes(
                &generation,
                union.len() <= cap,
                &EdgeColumns::pinned(kept.clone()),
            );
            if served != expected {
                mismatches.push(format!(
                    "trial {trial} cap {cap} union {} links {links:?} withdrawn \
                     {withdrawn_edges:?}",
                    union.len()
                ));
            }
        }
    }

    assert!(
        mismatches.is_empty(),
        "{} mismatches:\n{}",
        mismatches.len(),
        mismatches.join("\n")
    );
}

/// The fixture geometry densified with reciprocal edge pairs.
///
/// The first half of the stream carries each pair's high-row-first direction and the second half
/// its low-row-first direction, so the walk (rows ascending) offers the high-identity twin first
/// and the equal-ranked low-identity twin later - the arrival order the cap's tie-break rule has
/// to answer.
fn reciprocal_pairs_dataset() -> crate::dataset::memory::MemoryDataset {
    use smallvec::smallvec;
    use zerocopy::{LE, U64};

    use crate::{
        dataset::{Edge, Ontology, card::Card, memory::MemoryDataset},
        identity::OntologyRowId,
    };

    const PAIRS: [(u64, u64); 12] = [
        (0, 1),
        (2, 3),
        (4, 5),
        (6, 7),
        (8, 9),
        (10, 11),
        (12, 13),
        (14, 15),
        (16, 17),
        (18, 19),
        (20, 21),
        (22, 23),
    ];

    let (nodes, canonical) =
        super::fixture_nodes(|row| smallvec![OntologyRowId::from_usize(row & 1)]);

    let directed: Vec<(u64, u64)> = PAIRS
        .iter()
        .map(|&(low, high)| (high, low))
        .chain(PAIRS.iter().copied())
        .collect();

    let edges = directed
        .iter()
        .enumerate()
        .map(|(row, &(source, target))| Edge {
            id: U64::<LE>::new(100 + row as u64),
            source: NodeRowId::new(source),
            target: NodeRowId::new(target),
            ontology: smallvec![OntologyRowId::new(2)],
            embedding: None,
            confidence: None,
            source_confidence: None,
            target_confidence: None,
        })
        .collect();

    let ontology = vec![
        Ontology {
            id: U64::<LE>::new(0),
            parents: smallvec![],
        },
        Ontology {
            id: U64::<LE>::new(1),
            parents: smallvec![],
        },
        Ontology {
            id: U64::<LE>::new(2),
            parents: smallvec![],
        },
    ];
    let cards = std::collections::HashMap::from([
        (0, Card::verbatim("Person entity card".to_owned())),
        (1, Card::verbatim("Company entity card".to_owned())),
        (2, Card::verbatim("Employment link card".to_owned())),
    ]);

    MemoryDataset::new(nodes, edges, ontology, canonical, cards)
}

/// Differential over the reciprocal-pair fixture: rank ties at the cap boundary, every cap.
///
/// Edges sharing their less-prominent endpoint share a key rank, so the tie-break law is under
/// test at every cap that cuts at a tie: a rank equal to the kept worst's must still price the
/// identity, and the strict form of the rank exclusion is what a `>=` mutation breaks here
/// while every targeted witness stays green.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn rank_tie_admits_better_identity() {
    let (generation, atlas) =
        super::publish_dataset("review-dense", &reciprocal_pairs_dataset()).await;
    let (endpoints, row_ranks) = endpoint_ranks(&generation);
    let fitted = fitted_triples(&atlas, &generation);

    let ties = {
        let mut keys: Vec<u32> = endpoints
            .iter()
            .map(|&[source, target]| {
                row_ranks[usize::try_from(source).expect("small")]
                    .max(row_ranks[usize::try_from(target).expect("small")])
            })
            .collect();
        keys.sort_unstable();
        keys.len() - {
            keys.dedup();
            keys.len()
        }
    };
    assert!(ties > 0, "the dense fixture needs worse-endpoint rank ties");

    let mut mismatches: Vec<String> = Vec::new();
    let mut rng = keyed_rng(0x0BAD_C0FF_EE0D_DF00, 0, 0);
    let mut next =
        move |bound: u64| uniform_below(&mut rng, NonZero::new(bound).expect("a positive bound"));

    for trial in 0..4_u32 {
        let withdrawn_edges: Vec<u8> = (0..u8::try_from(fitted.len()).expect("small"))
            .filter(|_| trial > 0 && next(5) == 0)
            .map(|row| super::EDGE_SEED + row)
            .collect();
        let capture = withdrawing(&atlas, &withdrawn_edges);
        let ingress = (!withdrawn_edges.is_empty()).then_some(&capture);

        let mut union: Vec<OracleCandidate<u32>> = Vec::new();
        for (row, (&[source, target], &triple)) in endpoints.iter().zip(&fitted).enumerate() {
            if withdrawn_edges.contains(&(super::EDGE_SEED + u8::try_from(row).expect("small"))) {
                continue;
            }
            let worse = row_ranks[usize::try_from(source).expect("small")]
                .max(row_ranks[usize::try_from(target).expect("small")]);
            union.push(((worse, triple.2), triple));
        }
        union.sort_unstable_by_key(|&(key, _)| key);

        for cap in 0..=(union.len() + 1) {
            let mut kept: Vec<(u32, u32, ArchivedEntityId)> =
                union.iter().take(cap).map(|&(_, triple)| triple).collect();
            kept.sort_unstable_by_key(|&(.., id)| id);

            let served = edges_with(
                &atlas,
                &FULL,
                PlacementCohort::EMPTY,
                ingress,
                full_grid(),
                EdgesLimits {
                    edges: u32::try_from(cap).expect("small"),
                    ..EdgesLimits::default()
                },
            );
            let expected = expected_edges_bytes(
                &generation,
                union.len() <= cap,
                &EdgeColumns::pinned(kept.clone()),
            );
            if served != expected {
                mismatches.push(format!("trial {trial} cap {cap} union {}", union.len()));
            }
        }
    }

    assert!(
        mismatches.is_empty(),
        "{} mismatches ({ties} rank ties):\n{}",
        mismatches.len(),
        mismatches.join("\n")
    );
}

/// The translate request naming both published links.
fn link_ask() -> TranslateRequest {
    TranslateRequest {
        entity_ids: vec![entity_string_of(LOW_LINK), entity_string_of(HIGH_LINK)],
    }
}

/// Translate answers a published link's endpoint rows from the cohort, in both endpoint domains.
///
/// One link joins two fitted rows and one joins a fitted row to a placed arrival, so the case
/// pins the domain split: fitted endpoints encode their generation rows and the arrival endpoint
/// its cohort slot, all under the snapshot's own universe. The empty-cohort control runs the
/// same request and must answer absent keys, which is the resolution that read no publication.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn translate_answers_published_link_endpoints() {
    let (_generation, atlas) = publish("delta-translate").await;
    let (vacant, _) = vacant_cell(&atlas);
    let snapshot = publishing(
        &atlas,
        &[(ARRIVAL, vacant)],
        &[(LOW_LINK, 0, 1), (HIGH_LINK, 0, ARRIVAL)],
    );
    let cohort = PlacementCohort::of(Some(&snapshot));
    let slot = NodeRowId::from_usize(atlas.node_universe().size());
    let codec = test_codec(&atlas);
    let wire = |row: NodeRowId| codec.encode(row, snapshot.universe());

    let response = atlas
        .translate(link_ask(), TranslateLimits::default(), &FULL, None, cohort)
        .expect("the request is under the cap");

    assert_eq!(
        response.edges.get(&entity_string_of(LOW_LINK)),
        Some(&TranslatedEdge {
            source: wire(NodeRowId::from_u32(0)),
            target: wire(NodeRowId::from_u32(1)),
        }),
        "the fitted-endpoint link answers its generation rows"
    );
    assert_eq!(
        response.edges.get(&entity_string_of(HIGH_LINK)),
        Some(&TranslatedEdge {
            source: wire(NodeRowId::from_u32(0)),
            target: wire(slot),
        }),
        "the arrival-endpoint link answers the cohort slot"
    );
    assert!(
        response.nodes.is_empty(),
        "link-classified identities answer in the edges map alone"
    );

    let unresolved = atlas
        .translate(
            link_ask(),
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

/// The ingress capture's withdrawn identity set filters translated links, per direction.
///
/// The entry keeps its cohort while three later captures withdraw the link itself, a fitted
/// endpoint, and the arrival endpoint, each answering an absent key for exactly its own link at
/// the next request. The control capture withdraws an identity the request never names and must
/// leave the response equal to the baseline.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn withdrawal_answers_absent_key_for_translated_link() {
    let (_generation, atlas) = publish("delta-translate-ingress").await;
    let (vacant, _) = vacant_cell(&atlas);
    let snapshot = publishing(
        &atlas,
        &[(ARRIVAL, vacant)],
        &[(LOW_LINK, 0, 1), (HIGH_LINK, 0, ARRIVAL)],
    );
    let cohort = PlacementCohort::of(Some(&snapshot));

    let translate = |ingress: Option<&DeltaSnapshot>| {
        atlas
            .translate(
                link_ask(),
                TranslateLimits::default(),
                &FULL,
                ingress,
                cohort,
            )
            .expect("the request is under the cap")
    };

    let baseline = translate(None);
    assert!(
        baseline.edges.contains_key(&entity_string_of(LOW_LINK))
            && baseline.edges.contains_key(&entity_string_of(HIGH_LINK)),
        "the retained cohort answers both links before any withdrawal"
    );

    let link_withdrawn = translate(Some(&withdrawing(&atlas, &[LOW_LINK])));
    assert!(
        !link_withdrawn
            .edges
            .contains_key(&entity_string_of(LOW_LINK)),
        "withdrawing the link itself answers its absent key"
    );
    assert!(
        link_withdrawn
            .edges
            .contains_key(&entity_string_of(HIGH_LINK)),
        "the unrelated link survives the link withdrawal"
    );

    let endpoint_withdrawn = translate(Some(&withdrawing(&atlas, &[1])));
    assert!(
        !endpoint_withdrawn
            .edges
            .contains_key(&entity_string_of(LOW_LINK)),
        "withdrawing a fitted endpoint kills the translated link"
    );
    assert!(
        endpoint_withdrawn
            .edges
            .contains_key(&entity_string_of(HIGH_LINK)),
        "the unrelated link survives the endpoint withdrawal"
    );

    let arrival_withdrawn = translate(Some(&withdrawing(&atlas, &[ARRIVAL])));
    assert!(
        !arrival_withdrawn
            .edges
            .contains_key(&entity_string_of(HIGH_LINK)),
        "withdrawing the arrival endpoint kills its incident link"
    );
    assert!(
        arrival_withdrawn
            .edges
            .contains_key(&entity_string_of(LOW_LINK)),
        "the fitted-endpoint link survives the arrival withdrawal"
    );

    assert_eq!(
        translate(Some(&withdrawing(&atlas, &[60]))),
        baseline,
        "a capture withdrawing nothing the request names moves no key"
    );
}

/// A scoped proof answers exactly the links its own resolution admitted, endpoint mask included.
///
/// The identity set decides the link itself. Admitting one link answers it alone, and widening
/// the set adds exactly the second. The node mask decides the arrival endpoint. A proof
/// admitting both links while hiding the slot refuses the arrival-endpoint link whole, and the
/// fitted-endpoint link survives as the same-path control.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn scoped_translate_admits_links_through_identity_set_and_mask() {
    let (_generation, atlas) = publish("delta-translate-scope").await;
    let (vacant, _) = vacant_cell(&atlas);
    let snapshot = publishing(
        &atlas,
        &[(ARRIVAL, vacant)],
        &[(LOW_LINK, 0, 1), (HIGH_LINK, 0, ARRIVAL)],
    );
    let cohort = PlacementCohort::of(Some(&snapshot));
    let slot = NodeRowId::from_usize(atlas.node_universe().size());

    let translate = |proof: &VisibilityProof| {
        atlas
            .translate(link_ask(), TranslateLimits::default(), proof, None, cohort)
            .expect("the request is under the cap")
    };

    let one = translate(&admitting(&atlas, &[slot], &[LOW_LINK]));
    assert!(
        one.edges.contains_key(&entity_string_of(LOW_LINK)),
        "the admitted link answers"
    );
    assert!(
        !one.edges.contains_key(&entity_string_of(HIGH_LINK)),
        "an unadmitted link answers an absent key, whatever the cohort publishes"
    );

    let both = translate(&admitting(&atlas, &[slot], &[LOW_LINK, HIGH_LINK]));
    assert!(
        both.edges.contains_key(&entity_string_of(LOW_LINK))
            && both.edges.contains_key(&entity_string_of(HIGH_LINK)),
        "widening the identity set adds exactly the second link"
    );

    let slotless = translate(&admitting(&atlas, &[], &[LOW_LINK, HIGH_LINK]));
    assert!(
        !slotless.edges.contains_key(&entity_string_of(HIGH_LINK)),
        "a hidden slot refuses the arrival-endpoint link whole"
    );
    assert!(
        slotless.edges.contains_key(&entity_string_of(LOW_LINK)),
        "the fitted-endpoint link survives the hidden slot"
    );
}

/// The bound view over `proof` and `cohort`, with `ingress` as the request's capture.
fn viewing_delta<'scope>(
    atlas: &'scope Atlas,
    proof: &'scope VisibilityProof,
    cohort: PlacementCohort<'scope>,
    ingress: Option<&'scope DeltaSnapshot>,
) -> Bound<'scope> {
    let mut bound = Bound::resolved(atlas, proof, cohort, CutOffset::ZERO);
    if let Some(ingress) = ingress {
        bound = bound.withdrawing(ingress);
    }

    bound
}

/// The locate ego-graph folds the cohort's incident links into both endpoint domains.
///
/// Fitted row 0 carries one fitted edge, one published link to fitted row 1, and one published
/// link to a placed arrival. The subgraph merges all three ascending by identity, delivers the
/// arrival partner as its table vessel, and the empty-cohort control answers the fitted edge
/// alone on the same path.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_ego_graph_folds_cohort_links() {
    let (_generation, atlas) = publish("delta-locate-fold").await;
    let (vacant, _) = vacant_cell(&atlas);
    let snapshot = publishing(
        &atlas,
        &[(ARRIVAL, vacant)],
        &[(LOW_LINK, 0, 1), (HIGH_LINK, 0, ARRIVAL)],
    );
    let cohort = PlacementCohort::of(Some(&snapshot));
    let slot = NodeRowId::from_usize(atlas.node_universe().size());
    let bound = viewing_delta(&atlas, &FULL, cohort, None);
    let view = bound.view(&atlas);

    let source = atlas
        .resolve_source(&view, &entity_string_of(0))
        .expect("fixture node ids resolve");
    let subgraph = atlas.locate_subgraph(source, LocateLimits::default(), &view);

    assert!(subgraph.complete, "three edges sit under the default cap");
    let ids: Vec<ArchivedEntityId> = subgraph.edges.iter().map(|&(_, id)| id).collect();
    assert_eq!(
        ids,
        [
            archived_id(LOW_LINK),
            edge_identity_of(0),
            archived_id(HIGH_LINK)
        ],
        "both links merge into the identity order around the fitted edge"
    );
    assert_eq!(
        subgraph.edges[0].0,
        ServedEdge::Delta(DeltaEdge {
            source: DeltaEndpoint::Fitted(NodeRowId::from_u32(0)),
            target: DeltaEndpoint::Fitted(NodeRowId::from_u32(1)),
        }),
        "the fitted-endpoint link resolves both rows"
    );
    assert_eq!(
        subgraph.edges[2].0,
        ServedEdge::Delta(DeltaEdge {
            source: DeltaEndpoint::Fitted(NodeRowId::from_u32(0)),
            target: DeltaEndpoint::Arrival {
                slot,
                identity: archived_id(ARRIVAL),
            },
        }),
        "the arrival-endpoint link resolves the cohort slot"
    );

    // The delivered partners follow ascending wire id, whichever domain each encodes from.
    let positions_of_row = atlas.positions_of_row();
    let codec = test_codec(&atlas);
    let mut expected_partners = [
        (
            codec.encode(NodeRowId::from_u32(1), snapshot.universe()),
            ViewRow::Base(positions_of_row[NodeRowId::from_u32(1)]),
        ),
        (
            view.arrivals()[ArrivalIndex::from_u32(0)].wire,
            ViewRow::Arrival(ArrivalIndex::from_u32(0)),
        ),
    ];
    expected_partners.sort_unstable_by_key(|&(wire, _)| wire);
    let mut expected = vec![ViewRow::Base(positions_of_row[NodeRowId::from_u32(0)])];
    expected.extend(expected_partners.iter().map(|&(_, vessel)| vessel));
    assert_eq!(
        subgraph.delivered.as_raw(),
        expected,
        "partners deliver in their own vessels, ascending wire id"
    );

    // Same-path control: the empty cohort serves the fitted ego-graph alone.
    let bare = viewing_delta(&atlas, &FULL, PlacementCohort::EMPTY, None);
    let control = atlas.locate_subgraph(source, LocateLimits::default(), &bare.view(&atlas));
    assert_eq!(
        control.edges.iter().map(|&(_, id)| id).collect::<Vec<_>>(),
        [edge_identity_of(0)],
        "an empty cohort serves the fitted edge alone"
    );
}

/// An arrival source's ego-graph serves its cohort links instead of a lone node.
///
/// The link's fitted partner delivers beside the arrival source, and the no-links control keeps
/// the lone-node answer on the same path, so the fold widens the arrival source without moving
/// the linkless case.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn arrival_source_ego_graph_serves_cohort_links() {
    let (_generation, atlas) = publish("delta-locate-arrival-source").await;
    let (vacant, _) = vacant_cell(&atlas);
    let snapshot = publishing(&atlas, &[(ARRIVAL, vacant)], &[(HIGH_LINK, 0, ARRIVAL)]);
    let cohort = PlacementCohort::of(Some(&snapshot));
    let slot = NodeRowId::from_usize(atlas.node_universe().size());
    let bound = viewing_delta(&atlas, &FULL, cohort, None);
    let view = bound.view(&atlas);

    let source = atlas
        .resolve_source(&view, &entity_string_of(ARRIVAL))
        .expect("the cohort resolves the arrival");
    let subgraph = atlas.locate_subgraph(source, LocateLimits::default(), &view);

    assert!(subgraph.complete, "one edge sits under the default cap");
    assert_eq!(
        subgraph.edges,
        vec![(
            ServedEdge::Delta(DeltaEdge {
                source: DeltaEndpoint::Fitted(NodeRowId::from_u32(0)),
                target: DeltaEndpoint::Arrival {
                    slot,
                    identity: archived_id(ARRIVAL),
                },
            }),
            archived_id(HIGH_LINK),
        )],
        "the arrival source serves its incident link"
    );
    assert_eq!(
        subgraph.delivered.as_raw(),
        [
            ViewRow::Arrival(ArrivalIndex::from_u32(0)),
            ViewRow::Base(atlas.positions_of_row()[NodeRowId::from_u32(0)]),
        ],
        "the fitted partner delivers beside the arrival source"
    );

    // Same-path control: a cohort publishing no link keeps the lone-node answer.
    let bare_snapshot = publishing(&atlas, &[(ARRIVAL, vacant)], &[]);
    let bare_cohort = PlacementCohort::of(Some(&bare_snapshot));
    let bare = viewing_delta(&atlas, &FULL, bare_cohort, None);
    let bare_view = bare.view(&atlas);
    let bare_source = atlas
        .resolve_source(&bare_view, &entity_string_of(ARRIVAL))
        .expect("the cohort resolves the arrival");
    let control = atlas.locate_subgraph(bare_source, LocateLimits::default(), &bare_view);
    assert!(control.complete, "no edge qualifies");
    assert!(control.edges.is_empty(), "no link publishes at the source");
    assert_eq!(
        control.delivered.as_raw(),
        [ViewRow::Arrival(ArrivalIndex::from_u32(0))],
        "the linkless arrival delivers alone"
    );
}

/// The ingress capture's withdrawn identity set filters the locate fold, per direction.
///
/// Withdrawing the link kills its edge alone. Withdrawing fitted row 1 kills the published link
/// and the fitted edge through one rule. Withdrawing the arrival kills its incident link alone,
/// and the unrelated control moves nothing.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn withdrawal_subtracts_from_locate_fold() {
    let (_generation, atlas) = publish("delta-locate-ingress").await;
    let (vacant, _) = vacant_cell(&atlas);
    let snapshot = publishing(
        &atlas,
        &[(ARRIVAL, vacant)],
        &[(LOW_LINK, 0, 1), (HIGH_LINK, 0, ARRIVAL)],
    );
    let cohort = PlacementCohort::of(Some(&snapshot));

    let ids = |ingress: Option<&DeltaSnapshot>| -> Vec<ArchivedEntityId> {
        let bound = viewing_delta(&atlas, &FULL, cohort, ingress);
        let view = bound.view(&atlas);
        let source = atlas
            .resolve_source(&view, &entity_string_of(0))
            .expect("fixture node ids resolve");

        atlas
            .locate_subgraph(source, LocateLimits::default(), &view)
            .edges
            .iter()
            .map(|&(_, id)| id)
            .collect()
    };

    let baseline = ids(None);
    assert_eq!(
        baseline,
        [
            archived_id(LOW_LINK),
            edge_identity_of(0),
            archived_id(HIGH_LINK)
        ],
        "the retained cohort serves the whole fold before any withdrawal"
    );

    assert_eq!(
        ids(Some(&withdrawing(&atlas, &[LOW_LINK]))),
        [edge_identity_of(0), archived_id(HIGH_LINK)],
        "withdrawing the link kills its edge alone"
    );
    assert_eq!(
        ids(Some(&withdrawing(&atlas, &[1]))),
        [archived_id(HIGH_LINK)],
        "withdrawing the shared partner kills the published link and the fitted edge"
    );
    assert_eq!(
        ids(Some(&withdrawing(&atlas, &[ARRIVAL]))),
        [archived_id(LOW_LINK), edge_identity_of(0)],
        "withdrawing the arrival kills its incident link alone"
    );
    assert_eq!(
        ids(Some(&withdrawing(&atlas, &[60]))),
        baseline,
        "a withdrawal the fold never names moves nothing"
    );
}

/// A scoped locate serves exactly the links its own resolution admitted, slot mask included.
///
/// The identity set decides each link, and hiding the slot empties the view's arrival table, so
/// the arrival-endpoint link refuses whole while the fitted-endpoint link and the fitted edge
/// survive as the same-path controls.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn scoped_locate_admits_links_through_identity_set_and_mask() {
    let (_generation, atlas) = publish("delta-locate-scope").await;
    let (vacant, _) = vacant_cell(&atlas);
    let snapshot = publishing(
        &atlas,
        &[(ARRIVAL, vacant)],
        &[(LOW_LINK, 0, 1), (HIGH_LINK, 0, ARRIVAL)],
    );
    let cohort = PlacementCohort::of(Some(&snapshot));
    let slot = NodeRowId::from_usize(atlas.node_universe().size());

    let ids = |proof: &VisibilityProof| -> Vec<ArchivedEntityId> {
        let bound = viewing_delta(&atlas, proof, cohort, None);
        let view = bound.view(&atlas);
        let source = atlas
            .resolve_source(&view, &entity_string_of(0))
            .expect("fixture node ids resolve");

        atlas
            .locate_subgraph(source, LocateLimits::default(), &view)
            .edges
            .iter()
            .map(|&(_, id)| id)
            .collect()
    };

    assert_eq!(
        ids(&admitting(&atlas, &[slot], &[LOW_LINK])),
        [archived_id(LOW_LINK), edge_identity_of(0)],
        "the admitted link serves and the unadmitted one refuses"
    );
    assert_eq!(
        ids(&admitting(&atlas, &[slot], &[LOW_LINK, HIGH_LINK])),
        [
            archived_id(LOW_LINK),
            edge_identity_of(0),
            archived_id(HIGH_LINK)
        ],
        "widening the identity set adds exactly the second link"
    );
    assert_eq!(
        ids(&admitting(&atlas, &[], &[LOW_LINK, HIGH_LINK])),
        [archived_id(LOW_LINK), edge_identity_of(0)],
        "a hidden slot refuses the arrival-endpoint link whole"
    );
}

/// The nearest-partner truncation prices arrival partners on their recorded coordinates.
///
/// The arrival places at the wire corner opposite the source, strictly farther than fitted row
/// 1, so a cap of two keeps both row-1 edges and drops the arrival-endpoint link with its
/// partner. One more slot serves the whole fold complete.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn truncation_prices_arrival_partners() {
    let (_generation, atlas) = publish("delta-locate-truncation").await;
    let positions = atlas.positions();
    let positions_of_row = atlas.positions_of_row();
    let origin = positions[positions_of_row[NodeRowId::from_u32(0)]];
    let near = positions[positions_of_row[NodeRowId::from_u32(1)]];
    let far = Vec2::new(
        0.99_f32.copysign(-origin.x()),
        0.99_f32.copysign(-origin.y()),
    );
    let distance = |point: Vec2| {
        let (dx, dy) = (point.x() - origin.x(), point.y() - origin.y());
        #[expect(
            clippy::suboptimal_flops,
            reason = "unfused arithmetic mirrors the selection key exactly"
        )]
        (dx * dx + dy * dy).to_bits()
    };
    assert!(
        distance(near) < distance(far),
        "the charter needs the arrival strictly farther than fitted row 1"
    );

    let snapshot = publishing(
        &atlas,
        &[(ARRIVAL, far)],
        &[(LOW_LINK, 0, 1), (HIGH_LINK, 0, ARRIVAL)],
    );
    let cohort = PlacementCohort::of(Some(&snapshot));
    let bound = viewing_delta(&atlas, &FULL, cohort, None);
    let view = bound.view(&atlas);
    let source = atlas
        .resolve_source(&view, &entity_string_of(0))
        .expect("fixture node ids resolve");

    let capped = |edges: u32| {
        atlas.locate_subgraph(
            source,
            LocateLimits {
                edges,
                ..LocateLimits::default()
            },
            &view,
        )
    };

    let two = capped(2);
    assert!(!two.complete, "the cap truncated the farthest partner");
    assert_eq!(
        two.edges.iter().map(|&(_, id)| id).collect::<Vec<_>>(),
        [archived_id(LOW_LINK), edge_identity_of(0)],
        "both row-1 edges outrank the arrival-endpoint link"
    );
    assert_eq!(
        two.delivered.as_raw(),
        [
            ViewRow::Base(positions_of_row[NodeRowId::from_u32(0)]),
            ViewRow::Base(positions_of_row[NodeRowId::from_u32(1)]),
        ],
        "the truncated arrival partner leaves with its edge"
    );

    let whole = capped(3);
    assert!(whole.complete, "one more slot serves the whole fold");
    assert_eq!(
        whole.edges.iter().map(|&(_, id)| id).collect::<Vec<_>>(),
        [
            archived_id(LOW_LINK),
            edge_identity_of(0),
            archived_id(HIGH_LINK)
        ],
    );
}

/// A store answering every delivered node and link as resolved with no recorded detail.
///
/// The resolution flags open and every store-derived column stays empty, so an expectation
/// built over it pins the in-process label columns - the captured displays among them -
/// without store-derived content.
struct ResolvedEmptyDetails;

impl LocateStore for ResolvedEmptyDetails {
    fn hydrate(self, order: LocateOrder<'_>) -> Result<LocateHydration, DetailError> {
        Ok(LocateHydration {
            nodes: LocateNodeHydration {
                resolved: DenseBitSet::new_filled(order.nodes.count()),
                type_urls: IdVec::from_elem(Vec::new(), order.nodes.count()),
                source_properties: Some(Vec::new()),
                source_properties_complete: true,
            },
            links: LocateLinkHydration {
                type_urls: IdVec::from_elem(Vec::new(), order.links.len()),
                type_urls_complete: DenseBitSlice::new_empty(order.links.len()),
                properties: IdVec::from_elem(Some(Vec::new()), order.links.len()),
                properties_complete: DenseBitSlice::new_empty(order.links.len()),
            },
        })
    }
}

/// Captures each `(seed, label)`'s display with a revised icon over one register and publishes.
fn capturing_displays(atlas: &Atlas, captures: &[(u8, &OwnedLabel)]) -> DeltaSnapshot {
    let mut register = DeltaRegister::new(
        atlas.node_universe(),
        atlas.edge_universe(),
        atlas.ontology_universe(),
    );
    for &(seed, label) in captures {
        let event = EntityEvent::Updated(EntityUpdate {
            entity: store_id(seed),
            edition: EntityEditionId::new(Uuid::from_u128(u128::from(seed))),
            archived: false,
            changed_at: Timestamp::from_unix_timestamp(1),
        });
        register.apply(DeltaEvent::from(&event));
        register
            .capture_display(
                archived_id(seed),
                EntityEditionId::new(Uuid::from_u128(u128::from(seed))),
                label,
                Icon::new("revised-icon"),
                fixture_type(),
                atlas,
            )
            .expect("the fixture ontology domain has room");
    }

    register.snapshot(
        atlas,
        DeltaRevision::FIRST,
        Timestamp::from_unix_timestamp(2),
    )
}

/// Serves fitted node 3's locate under `snapshot`.
fn locate_node_three(atlas: &Atlas, snapshot: Option<&DeltaSnapshot>) -> Vec<u8> {
    let bound = viewing_delta(atlas, &FULL, PlacementCohort::of(snapshot), None);
    atlas
        .locate(
            &locate_request(entity_string_of(3)),
            ServeLimits::default(),
            bound.view(atlas),
            ResolvedEmptyDetails,
        )
        .expect("the locate request serves")
}

/// The expected node-3 locate envelope, built directly.
///
/// Fixture edge row 5 joins rows 3 and 7, the only edge at either row, so only the two label
/// arguments separate a capture's envelope from the baseline.
fn expected_node_three_envelope(
    atlas: &Atlas,
    generation: &Generation,
    source_label: &Label,
    link_label: &Label,
) -> Vec<u8> {
    let source_row = NodeRowId::from_u32(3);
    let partner_row = NodeRowId::from_u32(7);
    let link_seed = 64 + 5;
    assert_eq!(
        archived_id(link_seed),
        edge_identity_of(5),
        "the witness revises fitted edge row 5"
    );

    let bound = viewing_delta(atlas, &FULL, PlacementCohort::EMPTY, None);
    let view = bound.view(atlas);
    let cell = atlas
        .resolve_source(&view, &entity_string_of(3))
        .expect("fixture node ids resolve")
        .cell;
    let positions_of_row = atlas.positions_of_row();
    let codec = test_codec(atlas);
    let wire = |row: NodeRowId| codec.encode(row, atlas.node_universe());
    let columns = EdgeColumns::pinned([(
        wire(source_row).get(),
        wire(partner_row).get(),
        archived_id(link_seed),
    )]);
    let empty_map = PropertyMap::new_unchecked(Vec::new());
    let link_flags: Box<DenseBitSlice<crate::serve::hydrate::EdgeSlot>> =
        DenseBitSlice::new_empty(1);

    LocateResponse {
        generation: generation.id().digest(),
        variant: 0,
        cell,
        complete: true,
        entity_id: archived_id(3),
        type_ids_complete: false,
        properties_complete: true,
        delivered: IdSlice::from_raw(&[
            ViewRow::Base(positions_of_row[source_row]),
            ViewRow::Base(positions_of_row[partner_row]),
        ]),
        arrivals: IdSlice::from_raw(&[]),
        positions: atlas.positions(),
        rows: atlas.wire_rows(),
        masks: None,
        edges: &columns,
        trailer: LocateTrailer {
            type_table: IdSlice::from_raw(&[]),
            property_table: IdSlice::from_raw(&[]),
            labels: IdSlice::from_raw(&[source_label, Label::EMPTY]),
            type_ids: IdSlice::from_raw(&[None, None]),
            properties: Some(&empty_map),
            link_labels: IdSlice::from_raw(&[link_label]),
            link_type_ids: IdSlice::from_raw(&[Vec::new()]),
            link_type_ids_complete: &link_flags,
            link_properties: IdSlice::from_raw(&[Some(&empty_map)]),
            link_properties_complete: &link_flags,
        },
    }
    .encode()
}

/// Captured displays reach the locate trailer's node and link labels, byte-exact.
///
/// The register captures a revised display for fitted node 3 and for its one incident fitted
/// link, and the locate response serves both captured labels at their own slots.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn captured_displays_reach_locate_labels() {
    let (generation, atlas) = publish("delta-locate-labels").await;

    let renamed = OwnedLabel::from("renamed");
    let rewired = OwnedLabel::from("rewired");
    let captured = capturing_displays(&atlas, &[(3, &renamed), (64 + 5, &rewired)]);

    assert_eq!(
        locate_node_three(&atlas, Some(&captured)),
        expected_node_three_envelope(&atlas, &generation, &renamed, &rewired),
        "both captured labels serve at their own slots"
    );
}

/// An empty cohort serves the payload labels.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_baseline_payload_labels() {
    let (generation, atlas) = publish("delta-locate-baseline").await;

    assert_eq!(
        locate_node_three(&atlas, None),
        expected_node_three_envelope(&atlas, &generation, Label::EMPTY, Label::EMPTY),
        "the baseline serves the payload labels"
    );
}

/// Same-path control: a capture the response never delivers moves no byte.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn unrelated_capture_baseline_bytes() {
    let (_generation, atlas) = publish("delta-locate-unrelated").await;

    let renamed = OwnedLabel::from("renamed");
    let unrelated = capturing_displays(&atlas, &[(60, &renamed)]);

    assert_eq!(
        locate_node_three(&atlas, Some(&unrelated)),
        locate_node_three(&atlas, None),
        "a capture the response never names moves nothing"
    );
}

/// Publishes the dormant-arrival shape into one register.
///
/// The arrival arrives live, classifies, and places, so its slot allocates and stands for the
/// register's life. The link then attaches fitted row 0 to that arrival, live and captured. The
/// arrival's own end lands last, the feed order the register cannot forbid. The link therefore
/// keeps standing live while the `nodes` map drops the dormant holder. Every read must refuse the
/// link through `node_at`'s absent answer instead of resolving a slot no arrival table holds.
fn dormant_arrival_snapshot(atlas: &Atlas) -> DeltaSnapshot {
    let (vacant, _) = vacant_cell(atlas);

    let mut register = DeltaRegister::new(
        atlas.node_universe(),
        atlas.edge_universe(),
        atlas.ontology_universe(),
    );

    let arrival_live = EntityEvent::Updated(EntityUpdate {
        entity: store_id(ARRIVAL),
        edition: EntityEditionId::new(Uuid::from_u128(u128::from(ARRIVAL))),
        archived: false,
        changed_at: Timestamp::from_unix_timestamp(1),
    });
    register.apply(DeltaEvent::from(&arrival_live));
    register
        .classify(archived_id(ARRIVAL), Classification::Node)
        .expect("the fixture stays inside the edge universe");
    register
        .place(
            archived_id(ARRIVAL),
            &ProjectedArrival {
                edition: EntityEditionId::new(Uuid::from_u128(u128::from(ARRIVAL))),
                position: vacant,
                label: OwnedLabel::from("arrival"),
                icon: OwnedIcon::from("arrival-icon"),
                representative: fixture_type(),
            },
            atlas,
        )
        .expect("the fixture universe is far from the wire's row domain");

    let link_live = EntityEvent::Updated(EntityUpdate {
        entity: store_id(HIGH_LINK),
        edition: EntityEditionId::new(Uuid::from_u128(u128::from(HIGH_LINK))),
        archived: false,
        changed_at: Timestamp::from_unix_timestamp(1),
    });
    register.apply(DeltaEvent::from(&link_live));
    register
        .classify(
            archived_id(HIGH_LINK),
            Classification::Edge {
                source: Some(archived_id(0)),
                target: Some(archived_id(ARRIVAL)),
            },
        )
        .expect("the fixture stays inside the edge universe");
    register
        .capture_display(
            archived_id(HIGH_LINK),
            EntityEditionId::new(Uuid::from_u128(u128::from(HIGH_LINK))),
            &OwnedLabel::from("link"),
            &OwnedIcon::from("link-icon"),
            fixture_type(),
            atlas,
        )
        .expect("the fixture ontology domain has room");

    let arrival_end = EntityEvent::Ended(EntityEnd {
        entity: store_id(ARRIVAL),
        ended_at: Timestamp::from_unix_timestamp(3),
    });
    register.apply(DeltaEvent::from(&arrival_end));

    register.snapshot(
        atlas,
        DeltaRevision::FIRST,
        Timestamp::from_unix_timestamp(3),
    )
}

/// The dormant-arrival publication keeps the link and withdraws the identity, while the holder
/// leaves the nodes map.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn dormant_arrival_publication_shape() {
    let (_generation, atlas) = publish("probe-dormant-shape").await;
    let snapshot = dormant_arrival_snapshot(&atlas);
    let slot = NodeRowId::from_usize(atlas.node_universe().size());

    assert!(
        snapshot.edge(archived_id(HIGH_LINK)).is_some(),
        "the link publishes even though its arrival endpoint stands withdrawn",
    );
    assert!(
        snapshot.node_at(slot).is_none(),
        "the dormant holder leaves the nodes map, so the slot resolves to no arrival",
    );
    assert!(
        snapshot.withdraws(archived_id(ARRIVAL)),
        "the same publication withdraws the arrival identity",
    );

    let cohort = PlacementCohort::of(Some(&snapshot));
    let bound = viewing_delta(&atlas, &FULL, cohort, None);
    assert!(
        bound.view(&atlas).arrivals().is_empty(),
        "the view's arrival table holds no dormant holder",
    );
}

/// Locate refuses the dormant-endpoint link rather than minting an unindexable endpoint.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_refuses_dormant_link() {
    let (_generation, atlas) = publish("probe-dormant-locate").await;
    let snapshot = dormant_arrival_snapshot(&atlas);
    let bound = viewing_delta(&atlas, &FULL, PlacementCohort::of(Some(&snapshot)), None);
    let view = bound.view(&atlas);

    let source = atlas
        .resolve_source(&view, &entity_string_of(0))
        .expect("fixture node ids resolve");
    let subgraph = atlas.locate_subgraph(source, LocateLimits::default(), &view);
    assert!(
        !subgraph
            .edges
            .iter()
            .any(|&(_, id)| id == archived_id(HIGH_LINK)),
        "the dormant-endpoint link never reaches the locate ego graph",
    );
    assert_eq!(
        subgraph.delivered.len(),
        2,
        "the fitted ego graph delivers the source and its one fitted partner alone",
    );
}

/// Translate answers an absent key for the dormant-endpoint link.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn translate_dormant_link_absent() {
    let (_generation, atlas) = publish("probe-dormant-translate").await;
    let snapshot = dormant_arrival_snapshot(&atlas);
    let cohort = PlacementCohort::of(Some(&snapshot));

    let response = atlas
        .translate(
            TranslateRequest {
                entity_ids: vec![entity_string_of(HIGH_LINK)],
            },
            TranslateLimits::default(),
            &FULL,
            None,
            cohort,
        )
        .expect("the request is under the cap");
    assert!(
        response.edges.is_empty() && response.nodes.is_empty(),
        "translate answers an absent key for the dormant-endpoint link",
    );
}

/// The edges route's delivered set refuses the dormant-endpoint link.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn edges_refuse_dormant_link() {
    let (_generation, atlas) = publish("probe-dormant-edges").await;
    let snapshot = dormant_arrival_snapshot(&atlas);
    let cohort = PlacementCohort::of(Some(&snapshot));

    let served = edges_with(
        &atlas,
        &FULL,
        cohort,
        None,
        full_grid(),
        EdgesLimits::default(),
    );
    assert!(
        !edge_ids_of(&served).contains(&archived_id(HIGH_LINK)),
        "the edges route refuses the dormant-endpoint link",
    );
}
