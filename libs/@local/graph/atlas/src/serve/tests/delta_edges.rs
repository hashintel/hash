//! Delta-edge witnesses: the entry cohort's published links serve through the edges route.
//!
//! Every case runs the served edges assembly with a real published snapshot, folded, classified,
//! and placed exactly as the consumer records them, so the witnesses cover the seam rather than
//! the map lookups alone. A delta link serves when the proof's identity set admits it, the
//! ingress capture does not withdraw it, and the response's delivered sets hold both of its
//! endpoints, and it merges into the same ascending identity order the fitted edges answer in.
//! Each refusal case runs beside a same-path control whose delta touches nothing the request
//! names.

use hash_graph_postgres_store::store::{EntityEnd, EntityEvent, EntityUpdate};
use hash_graph_temporal_versioning::Timestamp;
use hashql_core::id::{Id as _, IdSlice};
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
    full_grid, open_edge_artifacts, publish, section, test_codec,
};
use crate::{
    bitset::CompressedBitSet,
    dataset::auxiliary::{Label, OwnedLabel},
    identity::{BasePosition, EdgeRowId, NodeRowId},
    math::Vec2,
    morton::Depth,
    postgres::{
        Classification, EditionDisplay, LinkDisplay,
        id::{ArchivedEntityId, ArchivedEntityUuid},
    },
    salt::wire::edges::{EdgesResponse, EdgesTrailer},
    serve::{
        EdgesLimits, VisibilityProof,
        delta::{
            DeltaEvent, DeltaRegister, DeltaRevision, DeltaSnapshot, FrozenPlacement,
            PlacementCohort,
        },
        edges::EdgesDetail,
        hydrate::{DetailError, EdgesHydration, EdgesOrder, EdgesStore},
        neighbourhood::EdgeColumns,
    },
};

/// A link identity sorting before every fitted edge identity, whose seeds start at 64.
const LOW_LINK: u8 = 50;

/// A link identity sorting after the arrival band.
const HIGH_LINK: u8 = 0xB0;

/// The arrival's seed, past every node and edge seed the fixture generation fits.
const ARRIVAL: u8 = 0xA0;

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
    let mut register = DeltaRegister::new(atlas.universe());
    for &(seed, wire) in arrivals {
        let event = EntityEvent::Updated(EntityUpdate {
            entity: store_id(seed),
            edition: EntityEditionId::new(Uuid::from_u128(u128::from(seed))),
            archived: false,
            changed_at: Timestamp::from_unix_timestamp(1),
        });
        register.apply(DeltaEvent::from(&event));
        register.classify(archived_id(seed), Classification::Node);
        register
            .place(
                archived_id(seed),
                FrozenPlacement {
                    edition: EntityEditionId::new(Uuid::from_u128(u128::from(seed))),
                    wire,
                    display: EditionDisplay {
                        label: OwnedLabel::from("arrival"),
                        first_type: None,
                    },
                },
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
        register.classify(
            archived_id(seed),
            Classification::Link {
                source: Some(archived_id(source)),
                target: Some(archived_id(target)),
            },
        );
    }

    register.snapshot(
        atlas,
        DeltaRevision::FIRST,
        Timestamp::from_unix_timestamp(1),
    )
}

/// Folds one `Ended` event per seed into an ingress snapshot withdrawing those identities.
fn withdrawing(atlas: &Atlas, seeds: &[u8]) -> DeltaSnapshot {
    let mut register = DeltaRegister::new(atlas.universe());
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
                atlas.universe(),
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
        .encode(NodeRowId::from_u32(u32::from(seed)), atlas.universe())
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
async fn corpus_views_serve_published_links_in_identity_order() {
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
async fn scoped_proofs_serve_exactly_their_admitted_links() {
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
async fn an_arrival_endpoint_qualifies_exactly_when_it_serves() {
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
    let slot = NodeRowId::from_u32(atlas.universe().rows());

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
async fn ingress_withdrawal_kills_retained_links_at_the_next_request() {
    let (generation, atlas) = publish("delta-edges-ingress").await;
    let (vacant, _) = vacant_cell(&atlas);
    let snapshot = publishing(
        &atlas,
        &[(ARRIVAL, vacant)],
        &[(LOW_LINK, 0, 1), (HIGH_LINK, 0, ARRIVAL)],
    );
    let cohort = PlacementCohort::of(Some(&snapshot));
    let slot = NodeRowId::from_u32(atlas.universe().rows());
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
async fn the_cap_ranks_arrival_endpoints_past_every_fitted_row() {
    let (generation, atlas) = publish("delta-edges-cap").await;
    let (vacant, _) = vacant_cell(&atlas);
    let snapshot = publishing(&atlas, &[(ARRIVAL, vacant)], &[(HIGH_LINK, 0, ARRIVAL)]);
    let cohort = PlacementCohort::of(Some(&snapshot));
    let slot = NodeRowId::from_u32(atlas.universe().rows());
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

/// A store answering one split order, asserting the split and carrying one delta display.
struct SplitOrderStore {
    /// The fitted identities the order must name, in delivered order.
    fitted: Vec<ArchivedEntityId>,
    /// The delta identities the order must name, in delivered order.
    delta: Vec<ArchivedEntityId>,
    /// The display every delta identity answers.
    display: LinkDisplay,
}

impl EdgesStore for SplitOrderStore {
    #[expect(
        clippy::panic_in_result_fn,
        reason = "the split order is the contract under test, and the assertion is its witness"
    )]
    fn hydrate(self, order: EdgesOrder<'_>) -> Result<EdgesHydration, DetailError> {
        assert_eq!(
            order.fitted, self.fitted,
            "the fitted order names the fitted links"
        );
        assert_eq!(
            order.delta, self.delta,
            "the delta order names the delta links"
        );

        Ok(EdgesHydration {
            fitted: vec![None; order.fitted.len()],
            delta: order.delta.iter().map(|_| self.display.clone()).collect(),
        })
    }
}

/// The detail trailer carries each delta display at its own slot of the merged order.
///
/// The delta link's identity sorts before every fitted edge, so its label and interned type
/// occupy the column head rather than a tail, which pins the split-and-scatter alignment. The
/// fitted labels stay the generation's payloads, empty under the fixture's identity rewrite.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn the_detail_trailer_scatters_delta_displays_into_the_merged_order() {
    let (generation, atlas) = publish("delta-edges-trailer").await;
    let snapshot = publishing(&atlas, &[], &[(LOW_LINK, 0, 1)]);
    let fitted = fitted_triples(&atlas, &generation);
    let url: VersionedUrl = "https://example.com/wired/v/1"
        .parse()
        .expect("the fixture URL parses");
    let wired = OwnedLabel::from("wired");

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
            SplitOrderStore {
                fitted: fitted.iter().map(|&(_, _, id)| id).collect(),
                delta: vec![archived_id(LOW_LINK)],
                display: LinkDisplay {
                    label: wired.clone(),
                    first_type: Some(url.clone()),
                },
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
    labels.extend(core::iter::repeat_n(Label::empty(), fitted.len()));
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
