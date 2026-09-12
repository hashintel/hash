use alloc::collections::BinaryHeap;
use core::cmp::Ordering;

use error_stack::Report;
use hashql_core::id::IdVec;
use type_system::knowledge::entity::EntityId;

use super::{LocateDocumentError, LocateSource};
use crate::{
    identity::NodeRowId,
    math::{DNonNegative, Vec2},
    morton::{Depth, MortonKey, MortonTile, Zoom},
    postgres::id::ArchivedEntityId,
    salt::lod::stage::WIRE_FRAME,
    serve::{
        hydrate::NodeSlot,
        neighbourhood::{DeliveredEdge, EdgeSet, Neighbourhood},
        scene::Scene,
        visibility::Visible,
    },
};

pub(crate) struct SourcePoint {
    pub row: Visible<NodeRowId>,
    pub identity: ArchivedEntityId,
    pub position: Vec2,
    pub cell: MortonTile,
}

impl SourcePoint {
    /// Resolves a visible source's identity, position and first delivery cell.
    ///
    /// Returns [`None`] for a draft key or a source without a live identity, visibility, position
    /// or delivery zoom.
    ///
    /// # Panics
    ///
    /// Panics if the scene's node index does not belong to its epoch and `source` is not a draft
    /// key.
    pub(crate) fn new(
        Scene {
            world,
            epoch,
            mask,
            delivery,
            ..
        }: Scene<'_>,
        source: LocateSource,
    ) -> Option<Self> {
        let row = match source {
            LocateSource::Key(EntityId {
                web_id,
                entity_uuid,
                draft_id: None,
            }) => world.layout.index.row_of(
                epoch,
                ArchivedEntityId {
                    web_id: web_id.into(),
                    entity_uuid: entity_uuid.into(),
                },
            )?,
            LocateSource::Key(_) => return None,
            LocateSource::Row(row) => world.layout.index.decode(epoch, row)?,
        };

        let row = mask.visible_node(row)?;
        let identity = world.layout.index.key_of(epoch, row.unwrap())?;
        let position = world.layout.position(epoch, row.unwrap())?;
        let zoom = delivery.first_zoom(row.unwrap())?;
        let [x, y] = WIRE_FRAME.quantize(position);

        Some(Self {
            row,
            identity,
            position,
            cell: MortonKey::new(x, y).tile(Depth::from_zoom(zoom)),
        })
    }
}

/// The truncation key of an incident edge.
///
/// The squared distance to the partner orders first. The partner's first delivery zoom breaks a
/// distance tie, and the link identity breaks a zoom tie. Link identities are distinct, which makes
/// the order total.
type NearestKey = (DNonNegative, Zoom, ArchivedEntityId);

/// An edge ordered by its truncation key alone.
struct Keyed {
    key: NearestKey,
    edge: DeliveredEdge,
}

impl PartialEq for Keyed {
    fn eq(&self, other: &Self) -> bool {
        self.key == other.key
    }
}

impl Eq for Keyed {}

impl PartialOrd for Keyed {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Keyed {
    fn cmp(&self, other: &Self) -> Ordering {
        self.key.cmp(&other.key)
    }
}

/// The edges a [`NearestCap`] holds.
enum Retained {
    /// Every offered edge, unranked, while their count is at most the capacity.
    Buffered(Vec<DeliveredEdge>),
    /// The `capacity` smallest keys offered, with the largest on top.
    Ranked(BinaryHeap<Keyed>),
}

/// The `capacity` nearest incident edges of one source, selected while the incident set streams.
///
/// Offered edges buffer unranked until one more than `capacity` has arrived. That offer ranks the
/// buffered edges and itself, and every later offer ranks on arrival, keeping the `capacity`
/// smallest [`NearestKey`]s. The rank function, and any error it returns, therefore runs only when
/// the selection truncates, and at zero capacity never: the response is then empty and the
/// truncation flag is the only fact recorded.
///
/// # Complexity
///
/// For capacity `c` and `n` offered edges, let `L = 1 + log₂(c + 1)`. Excluding the rank function's
/// work, a buffering offer costs amortized `O(1)`, with a buffer copy on reallocation. The first
/// overflow ranks the buffered edges and itself, building the heap by repeated pushes in
/// `O(cL)` work. Every later offer costs `O(L)`. At zero capacity each offer costs `O(1)` and
/// skips ranking. Total container work is `O(1 + nL)`, with at most one rank call per offered
/// edge. Edge storage is `O(min(n, c))`, in addition to fixed state and the rank closure.
struct NearestCap<F> {
    capacity: usize,
    rank: F,
    retained: Retained,
    truncated: bool,
}

impl<F, E> NearestCap<F>
where
    F: FnMut(&DeliveredEdge) -> Result<NearestKey, E>,
{
    /// Selects at most `capacity` edges under `rank`.
    ///
    /// Storage grows with the offered edges rather than with `capacity`, which a request may set
    /// far above any degree.
    const fn new(capacity: usize, rank: F) -> Self {
        Self {
            capacity,
            rank,
            retained: Retained::Buffered(Vec::new()),
            truncated: false,
        }
    }

    /// Offers one incident edge.
    ///
    /// # Errors
    ///
    /// Returns the rank function's error for any edge ranked by this offer: the buffered edges at
    /// the transition, or `edge` alone afterwards. The selection is unusable after an error.
    fn offer(&mut self, edge: DeliveredEdge) -> Result<(), E> {
        match &mut self.retained {
            Retained::Buffered(buffer) if buffer.len() < self.capacity => {
                buffer.push(edge);
                Ok(())
            }
            Retained::Buffered(buffer) => {
                self.truncated = true;
                if self.capacity == 0 {
                    return Ok(());
                }

                let mut kept = BinaryHeap::with_capacity(buffer.len());
                for buffered in buffer.drain(..) {
                    let key = (self.rank)(&buffered)?;
                    kept.push(Keyed {
                        key,
                        edge: buffered,
                    });
                }

                let key = (self.rank)(&edge)?;
                Self::keep_smaller(&mut kept, Keyed { key, edge });
                self.retained = Retained::Ranked(kept);
                Ok(())
            }
            Retained::Ranked(kept) => {
                self.truncated = true;
                let key = (self.rank)(&edge)?;
                Self::keep_smaller(kept, Keyed { key, edge });
                Ok(())
            }
        }
    }

    /// Replaces the largest kept key with `candidate` when the candidate is smaller.
    fn keep_smaller(kept: &mut BinaryHeap<Keyed>, candidate: Keyed) {
        if let Some(mut worst) = kept.peek_mut()
            && candidate < *worst
        {
            *worst = candidate;
        }
    }

    /// Returns the selected edges in unspecified order.
    ///
    /// The set is complete when the selection dropped no offer.
    fn into_set(self) -> EdgeSet {
        let edges = match self.retained {
            Retained::Buffered(buffer) => buffer,
            Retained::Ranked(kept) => kept.into_iter().map(|keyed| keyed.edge).collect(),
        };

        EdgeSet {
            complete: !self.truncated,
            edges,
        }
    }
}

/// A capped incident set with the source first and distinct partners in wire-id order.
pub(crate) struct LocateSubgraph {
    pub source: SourcePoint,
    pub nodes: IdVec<NodeSlot, NodeRowId>,
    pub edges: Vec<DeliveredEdge>,
    pub complete: bool,
}

impl LocateSubgraph {
    /// Selects incident edges and their distinct partners around `source`.
    ///
    /// Truncation keeps the edges with the smallest [`NearestKey`]. The selection reads partner
    /// positions and delivery zooms only when the incident set exceeds `capacity`, and never at
    /// zero capacity.
    ///
    /// # Errors
    ///
    /// Returns [`LocateDocumentError::Node`] when a partner of a ranked edge has no captured
    /// position or delivery zoom.
    ///
    /// # Panics
    ///
    /// Panics if the scene's topology does not belong to its epoch.
    ///
    /// # Complexity
    ///
    /// Let `d` count the edges offered by the incident iterator, `c` be the capacity,
    /// `m = min(d, c)` and `L = 1 + log₂(c + 1)`. Selection takes `O(1 + dL)` container work,
    /// including the one-time heap construction. The output sorts take
    /// `O(1 + m(1 + log₂(m + 1)))` work, within the same total bound. Storage beyond the response
    /// is `O(1 + m)`. These bounds exclude iterator costs and queries on the
    /// [`World`](crate::serve::world::World) and
    /// [`DeliverySchedule`](crate::serve::schedule::DeliverySchedule). The iterator
    /// can inspect more underlying entries than it yields. The remaining query work consists of
    /// at most one rank call per offered edge and one wire encoding per retained partner
    /// occurrence before deduplication.
    pub(crate) fn new(
        scene @ Scene {
            world,
            epoch,
            delivery,
            ..
        }: Scene<'_>,
        source: SourcePoint,
        capacity: usize,
    ) -> Result<Self, Report<LocateDocumentError>> {
        let source_row = source.row.unwrap();
        let source_position = source.position;

        let mut nearest = NearestCap::new(
            capacity,
            |edge: &DeliveredEdge| -> Result<NearestKey, Report<LocateDocumentError>> {
                let row = edge
                    .partner_of(source_row)
                    .expect("an incident edge should contain the source");

                let position = world
                    .layout
                    .position(epoch, row)
                    .ok_or_else(|| Report::new(LocateDocumentError::Node { row }))?;

                let zoom = delivery
                    .first_zoom(row)
                    .ok_or_else(|| Report::new(LocateDocumentError::Node { row }))?;

                Ok((
                    position.distance_squared_wide(source_position),
                    zoom,
                    edge.identity,
                ))
            },
        );

        let neighbourhood = Neighbourhood { provider: scene };
        for edge in neighbourhood.incident(source_row) {
            nearest.offer(edge)?;
        }

        let EdgeSet {
            complete,
            mut edges,
        } = nearest.into_set();
        edges.sort_unstable_by_key(|edge| edge.identity);

        let mut partners: Vec<_> = edges
            .iter()
            .flat_map(|edge| edge.endpoints)
            .filter(|&row| row != source_row)
            .map(|row| (world.layout.index.encode(row), row))
            .collect();
        partners.sort_unstable_by_key(|&(wire, _)| wire);
        partners.dedup_by_key(|&mut (wire, _)| wire);

        let mut nodes = IdVec::with_capacity(partners.len() + 1);
        nodes.push(source_row);
        nodes.extend(partners.into_iter().map(|(_, row)| row));

        Ok(Self {
            source,
            nodes,
            edges,
            complete,
        })
    }
}

#[cfg(test)]
mod tests {
    use core::cell::Cell;

    use hashql_core::id::{Id as _, IdSlice, IdVec};
    use proptest::{collection, property_test};
    use rand::{RngExt as _, SeedableRng as _, rngs::StdRng};
    use uuid::Uuid;

    use super::{NearestCap, NearestKey, Retained};
    use crate::{
        identity::{EdgeRowId, NodeRowId},
        math::DNonNegative,
        morton::Zoom,
        postgres::id::ArchivedEntityId,
        serve::{
            neighbourhood::{DeliveredEdge, EdgeSet},
            visibility::Visible,
        },
    };

    /// The source every synthetic edge is incident to.
    const SOURCE: NodeRowId = NodeRowId::new(0);

    fn identity(value: u128) -> ArchivedEntityId {
        ArchivedEntityId {
            web_id: Uuid::from_u128(1).into(),
            entity_uuid: Uuid::from_u128(value).into(),
        }
    }

    #[track_caller]
    fn zoom(value: u8) -> Zoom {
        Zoom::new(value).expect("should fit the zoom domain")
    }

    /// Synthetic incident edges keyed by edge row, with the source as every edge's first endpoint.
    struct Incident {
        edges: IdVec<EdgeRowId, DeliveredEdge>,
        keys: IdVec<EdgeRowId, NearestKey>,
    }

    impl Incident {
        fn new() -> Self {
            Self {
                edges: IdVec::new(),
                keys: IdVec::new(),
            }
        }

        /// Adds an edge whose key is `(distance, zoom, identity)` and returns it.
        fn link(&mut self, distance: usize, zoom: u8, identity: u128) -> DeliveredEdge {
            let identity = self::identity(identity);
            let row = self.edges.push_with(|row| DeliveredEdge {
                row: Visible::new(row.as_u64()),
                endpoints: [SOURCE, NodeRowId::new(row.as_u64() + 1)],
                identity,
            });
            self.keys.push((
                DNonNegative::from_usize(distance),
                self::zoom(zoom),
                identity,
            ));
            self.edges[row]
        }

        /// Returns a rank function over the recorded keys that counts its calls.
        fn rank<'this>(
            &'this self,
            calls: &'this Cell<usize>,
        ) -> impl FnMut(&DeliveredEdge) -> Result<NearestKey, ()> + 'this {
            move |edge| {
                calls.set(calls.get() + 1);
                Ok(self.keys[edge.row.unwrap()])
            }
        }

        /// Offers every edge in row order and returns the identity-ordered selection.
        #[track_caller]
        fn select(&self, capacity: usize) -> EdgeSet {
            let calls = Cell::new(0);
            let mut nearest = NearestCap::new(capacity, self.rank(&calls));
            for edge in self.edges.iter().copied() {
                nearest.offer(edge).expect("should rank every edge");
                assert!(
                    retained(&nearest) <= capacity,
                    "should retain at most the capacity after every offer"
                );
            }
            let mut set = nearest.into_set();
            set.edges.sort_unstable_by_key(|edge| edge.identity);
            set
        }

        /// The `capacity` smallest keys by a full sort, in identity order.
        fn reference(&self, capacity: usize) -> EdgeSet {
            reference(&self.edges, &self.keys, capacity)
        }
    }

    fn reference(
        edges: &IdSlice<EdgeRowId, DeliveredEdge>,
        keys: &IdSlice<EdgeRowId, NearestKey>,
        capacity: usize,
    ) -> EdgeSet {
        let mut ranked: Vec<_> = edges.iter().copied().collect();
        ranked.sort_unstable_by_key(|edge| keys[edge.row.unwrap()]);
        let complete = ranked.len() <= capacity;
        ranked.truncate(capacity);
        ranked.sort_unstable_by_key(|edge| edge.identity);
        EdgeSet {
            complete,
            edges: ranked,
        }
    }

    /// The count of edges a selection currently holds.
    fn retained<F>(nearest: &NearestCap<F>) -> usize {
        match &nearest.retained {
            Retained::Buffered(buffer) => buffer.len(),
            Retained::Ranked(kept) => kept.len(),
        }
    }

    /// Within capacity the selection keeps every edge in offer order and ranks none.
    #[test]
    fn nearest_within_capacity() {
        let mut incident = Incident::new();
        let expected = [
            incident.link(9, 4, 30),
            incident.link(1, 0, 20),
            incident.link(5, 2, 10),
        ];
        let calls = Cell::new(0);
        let mut nearest = NearestCap::new(3, incident.rank(&calls));
        for edge in expected {
            nearest.offer(edge).expect("should buffer within capacity");
        }
        let set = nearest.into_set();
        assert!(set.complete);
        assert_eq!(set.edges, expected);
        assert_eq!(calls.get(), 0, "should rank nothing within capacity");
    }

    /// Zero capacity records truncation without ranking or retaining anything.
    #[test]
    fn nearest_zero_capacity() {
        let mut incident = Incident::new();
        incident.link(1, 0, 10);
        incident.link(2, 0, 11);
        let calls = Cell::new(0);
        let mut nearest = NearestCap::new(0, incident.rank(&calls));
        for edge in incident.edges.iter().copied() {
            nearest
                .offer(edge)
                .expect("should never rank at zero capacity");
            assert_eq!(retained(&nearest), 0);
        }
        let set = nearest.into_set();
        assert!(!set.complete);
        assert!(set.edges.is_empty());
        assert_eq!(calls.get(), 0);

        let empty = NearestCap::new(0, incident.rank(&calls));
        assert!(
            empty.into_set().complete,
            "should be complete with no offer"
        );
    }

    /// Past capacity the selection ranks every offered edge exactly once and keeps the nearest.
    #[test]
    fn nearest_ranks_once_per_edge() {
        let mut incident = Incident::new();
        let far = incident.link(9, 0, 10);
        let nearest_edge = incident.link(1, 0, 11);
        let middle = incident.link(5, 0, 12);
        let farther = incident.link(12, 0, 13);
        let near = incident.link(2, 0, 14);
        let calls = Cell::new(0);
        let mut nearest = NearestCap::new(2, incident.rank(&calls));
        for edge in [far, nearest_edge, middle, farther, near] {
            nearest.offer(edge).expect("should rank every edge");
            assert!(retained(&nearest) <= 2);
        }
        assert_eq!(calls.get(), 5, "should rank each offered edge once");
        let mut set = nearest.into_set();
        set.edges.sort_unstable_by_key(|edge| edge.identity);
        assert!(!set.complete);
        assert_eq!(set.edges, [nearest_edge, near]);
    }

    /// Equal distances compare the partner's delivery zoom before the link identity.
    #[test]
    fn nearest_zoom_tie() {
        let mut incident = Incident::new();
        let deep = incident.link(4, 3, 10);
        let shallow = incident.link(4, 1, 20);
        assert!(deep.identity < shallow.identity);
        let set = incident.select(1);
        assert!(!set.complete);
        assert_eq!(
            set.edges,
            [shallow],
            "should keep the shallower delivery zoom"
        );
    }

    /// Equal distances and zooms compare the link identity.
    #[test]
    fn nearest_identity_tie() {
        let mut incident = Incident::new();
        let later = incident.link(4, 2, 20);
        let earlier = incident.link(4, 2, 10);
        let set = incident.select(1);
        assert!(!set.complete);
        assert_eq!(set.edges, [earlier]);
        assert_ne!(set.edges, [later]);
    }

    /// A rank error surfaces at the transition for a buffered edge and afterwards for the arrival.
    #[test]
    fn nearest_rank_error() {
        let mut incident = Incident::new();
        let first = incident.link(1, 0, 10);
        let second = incident.link(2, 0, 11);
        let third = incident.link(3, 0, 12);

        let mut failing = NearestCap::new(1, |edge: &DeliveredEdge| {
            if edge.identity == first.identity {
                Err(edge.row.unwrap())
            } else {
                Ok(incident.keys[edge.row.unwrap()])
            }
        });
        failing
            .offer(first)
            .expect("should buffer the first edge unranked");
        assert_eq!(
            failing.offer(second),
            Err(first.row.unwrap()),
            "should rank the buffered edge at the transition"
        );

        let mut failing = NearestCap::new(1, |edge: &DeliveredEdge| {
            if edge.identity == third.identity {
                Err(edge.row.unwrap())
            } else {
                Ok(incident.keys[edge.row.unwrap()])
            }
        });
        failing.offer(first).expect("should buffer the first edge");
        failing
            .offer(second)
            .expect("should rank both edges at the transition");
        assert_eq!(
            failing.offer(third),
            Err(third.row.unwrap()),
            "should rank an arrival after the transition"
        );
    }

    /// A large incident set selects as a full sort does while holding at most the capacity.
    #[test]
    fn nearest_large_degree_bounded() {
        const DEGREE: usize = 10_000;
        const CAPACITY: usize = 8;

        let mut rng = StdRng::seed_from_u64(0x5EED);
        let mut incident = Incident::new();
        for index in 0..DEGREE {
            let distance = rng.random_range(0..64_usize);
            let zoom = rng.random_range(0..8_u8);
            let identity = u128::try_from(index).expect("should fit the edge index");
            incident.link(distance, zoom, identity);
        }

        let calls = Cell::new(0);
        let mut nearest = NearestCap::new(CAPACITY, incident.rank(&calls));
        for edge in incident.edges.iter().copied() {
            nearest.offer(edge).expect("should rank every edge");
            assert!(retained(&nearest) <= CAPACITY);
        }
        assert_eq!(calls.get(), DEGREE);
        let Retained::Ranked(kept) = &nearest.retained else {
            panic!("should rank past the capacity");
        };
        assert!(
            kept.capacity() <= 2 * CAPACITY,
            "should size the heap by the capacity rather than the degree"
        );

        let mut set = nearest.into_set();
        set.edges.sort_unstable_by_key(|edge| edge.identity);
        let expected = incident.reference(CAPACITY);
        assert!(!set.complete);
        assert_eq!(set.edges, expected.edges);
    }

    /// A maximal capacity buffers the offered edges and allocates for them alone.
    ///
    /// The offer path must survive `usize::MAX` without an allocation sized by the capacity or a
    /// `capacity + 1` computation, and the set comes back complete and unranked.
    #[test]
    fn nearest_max_capacity() {
        let mut incident = Incident::new();
        let mut expected = [
            incident.link(3, 1, 10),
            incident.link(1, 0, 11),
            incident.link(2, 2, 12),
        ];
        let calls = Cell::new(0);
        let mut nearest = NearestCap::new(usize::MAX, incident.rank(&calls));
        let Retained::Buffered(buffer) = &nearest.retained else {
            panic!("should start unranked");
        };
        assert_eq!(buffer.capacity(), 0);
        for edge in expected {
            nearest
                .offer(edge)
                .expect("should buffer under a maximal capacity");
        }
        assert_eq!(retained(&nearest), expected.len());
        assert_eq!(
            calls.get(),
            0,
            "should rank nothing under a maximal capacity"
        );
        let mut set = nearest.into_set();
        assert!(set.complete);
        set.edges.sort_unstable_by_key(|edge| edge.identity);
        expected.sort_unstable_by_key(|edge| edge.identity);
        assert_eq!(set.edges, expected);
    }

    /// The selection agrees with a full sort at every capacity.
    ///
    /// The index suffix makes identities unique. Only distance and zoom can tie.
    #[property_test]
    fn nearest_reference(
        #[strategy = collection::vec((0_usize..6, 0_u8..4, 0_u8..3), 0..40)] inputs: Vec<(
            usize,
            u8,
            u8,
        )>,
        #[strategy = 0_usize..45] capacity: usize,
    ) {
        let mut incident = Incident::new();
        for (index, (distance, zoom, key)) in inputs.into_iter().enumerate() {
            let index = u128::try_from(index).expect("should fit the generated edge index");
            incident.link(distance, zoom, (u128::from(key) << 64) | index);
        }
        let actual = incident.select(capacity);
        let expected = incident.reference(capacity);
        proptest::prop_assert_eq!(actual.complete, expected.complete);
        proptest::prop_assert_eq!(actual.edges, expected.edges);
    }
}
