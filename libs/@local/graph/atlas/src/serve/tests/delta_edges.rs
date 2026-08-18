//! Delta-edge witnesses: the entry cohort's published links serve through the edges route.
//!
//! Every case runs the served edges assembly with a real published snapshot, folded, classified,
//! and placed exactly as the consumer records them, so the witnesses cover the seam rather than
//! the map lookups alone. A delta link serves when the proof's identity set admits it, the
//! ingress capture does not withdraw it, and the response's delivered sets hold both of its
//! endpoints, and it merges into the same ascending identity order the fitted edges answer in.
//! Each refusal case runs beside a same-path control whose delta touches nothing the request
//! names.

use core::num::NonZero;

use hash_graph_postgres_store::store::{EntityEnd, EntityEvent, EntityUpdate};
use hash_graph_temporal_versioning::Timestamp;
use hashql_core::{
    collections::FastHashMap,
    id::{Id as _, IdSlice, IdVec},
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
    arrival::vacant_cell, coordinate_of, edge_identity_of, edges_request, expected_edges_bytes,
    fixture_type_url, full_grid, open_edge_artifacts, publish, section, test_codec,
    type_expectations,
};
use crate::{
    bitset::CompressedBitSet,
    dataset::auxiliary::{Icon, Label, OwnedIcon, OwnedLabel},
    identity::{BasePosition, EdgeRowId, NodeRowId},
    math::Vec2,
    morton::Depth,
    postgres::{
        Classification,
        edition_display::DisplayParts,
        id::{ArchivedEntityId, ArchivedEntityUuid, ArchivedOntologyTypeUuid},
    },
    random::{keyed_rng, uniform_below},
    salt::wire::edges::{EdgesResponse, EdgesTrailer},
    serve::{
        EdgesLimits, VisibilityProof,
        delta::{
            DeltaEvent, DeltaRegister, DeltaRevision, DeltaSnapshot, PlacementCohort,
            ProjectedArrival,
        },
        edges::EdgesDetail,
        hydrate::{DetailError, EdgesStore, TypeSlot},
        neighbourhood::EdgeColumns,
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
        .u32_le_elements()
        .expect("the rank column is little-endian u32")
        .iter()
        .map(|rank| rank.get())
        .collect();
    let row_ranks = artifacts
        .positions
        .u32_le_elements()
        .expect("the position permutation is little-endian u32")
        .iter()
        .map(|position| ranks[position.get() as usize])
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

/// Differential: the fold's selection equals full-sort-then-truncate, at every cap.
///
/// Randomised cohorts over the published fixture, each swept across every cap from zero to one
/// past the union size, against an oracle built from the artifacts alone: the union sorted by
/// (worse endpoint rank, identity), truncated, re-sorted by identity, with `complete` read as
/// `union.len() <= cap`. Withdrawn fitted link identities put non-qualifying candidates in the
/// walk, so the exactly-cap completeness law is under test at every trial.
#[expect(
    clippy::too_many_lines,
    reason = "the cohort draw, the oracle, and the cap sweep share one trial loop"
)]
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

        let mut union: Vec<OracleCandidate<OracleRank>> = Vec::new();
        for (row, (&[source, target], &triple)) in endpoints.iter().zip(&fitted).enumerate() {
            if withdrawn_edges.contains(&(super::EDGE_SEED + u8::try_from(row).expect("small"))) {
                continue;
            }
            let worse = row_ranks[usize::try_from(source).expect("small")]
                .max(row_ranks[usize::try_from(target).expect("small")]);
            union.push(((OracleRank::Fitted(worse), triple.2), triple));
        }
        for &(seed, source, target) in &links {
            let resolve = |endpoint: u8| -> Option<(OracleRank, u32)> {
                if endpoint == ARRIVAL {
                    Some((OracleRank::Arrival(archived_id(ARRIVAL)), slot_wire))
                } else if usize::from(endpoint) < row_ranks.len() {
                    Some((
                        OracleRank::Fitted(row_ranks[usize::from(endpoint)]),
                        node_wire(&atlas, endpoint),
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
