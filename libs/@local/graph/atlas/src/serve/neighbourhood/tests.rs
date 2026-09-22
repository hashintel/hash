//! Cases covering incident and induced edge delivery over a scene and over a synthetic graph.

use alloc::sync::Arc;

use arc_swap::Guard;
use hashql_core::id::{Id as _, IdVec};
use proptest::{arbitrary::any, collection, prop_assert_eq, property_test};
use rand::{SeedableRng as _, rngs::StdRng};
use type_system::principal::actor::{ActorId, ActorType};
use uuid::Uuid;

use super::{DeliveredEdge, EdgeSet, Neighbourhood, NeighbourhoodProvider, RankCap};
use crate::{
    bitset::CompressedBitSet,
    identity::{EdgeRowId, ImportanceRank, NodeRowId},
    morton::Zoom,
    postgres::id::ArchivedEntityId,
    serve::{
        delta::{Delta, epoch::Epoch},
        scene::Scene,
        schedule::ViewSchedule,
        tests::fixture::{TamperFixture, secret},
        visibility::{VisibilityActor, VisibilityMask, Visible},
        world::{
            World,
            node_importance::{ImportanceProvider, NodePriority},
        },
    },
};

/// The captured scene the [`Scene`]-backed cases resolve against.
///
/// An opened synthetic generation with a captured epoch, actor, visibility mask and delivery
/// schedule.
struct SceneFixture {
    /// The opened world.
    world: Arc<World>,
    /// The captured publication.
    epoch: Epoch,
    /// The principal the mask resolves for.
    actor: VisibilityActor,
    /// The current visibility mask.
    mask: VisibilityMask,
    /// The view schedule captured under `mask`.
    schedule: ViewSchedule,
    /// The published files, kept until the fixture drops.
    _files: TamperFixture,
}

impl SceneFixture {
    /// Publishes and opens the synthetic generation under a root named `name`.
    ///
    /// The fixture starts with a fresh delta identity and a full-visibility mask for one fixed
    /// test actor.
    ///
    /// # Panics
    ///
    /// Panics if publishing or opening the generation fails, or allocating the delta does.
    fn new(name: &str) -> Self {
        let files = TamperFixture::publish(name);
        let world = Arc::new(
            World::open(files.generation().clone(), &secret())
                .expect("should open the synthetic generation"),
        );
        let delta = Delta::new(Arc::clone(&world), StdRng::seed_from_u64(17))
            .expect("should allocate a delta identity");
        let epoch = Epoch::from(Guard::from_inner(Arc::new(delta)));
        let actor = VisibilityActor {
            id: ActorId::new(Uuid::from_u128(1), ActorType::User),
            instance_admin: false,
        };
        let mask = VisibilityMask::full(actor);
        let schedule = ViewSchedule::of(Arc::clone(&world), &epoch, &mask);
        Self {
            world,
            epoch,
            actor,
            mask,
            schedule,
            _files: files,
        }
    }

    /// Narrows the visibility mask and schedule to exactly the supplied node and edge rows.
    ///
    /// A later `scene()` call sees only those rows.
    fn restrict(
        &mut self,
        nodes: impl IntoIterator<Item = u64>,
        edges: impl IntoIterator<Item = u64>,
    ) {
        self.mask = VisibilityMask::partial(
            self.actor,
            CompressedBitSet::from_rows(nodes.into_iter().map(NodeRowId::new)),
            CompressedBitSet::from_rows(edges.into_iter().map(EdgeRowId::new)),
        );
        self.schedule = ViewSchedule::of(Arc::clone(&self.world), &self.epoch, &self.mask);
    }

    /// Assembles the current world, epoch, mask and schedule as one [`Scene`] at offset zero.
    fn scene(&self) -> Scene<'_> {
        Scene {
            world: &self.world,
            epoch: &self.epoch,
            mask: &self.mask,
            schedule: &self.schedule,
            delivery: self
                .schedule
                .cut(Zoom::MIN)
                .expect("should bind the zero offset"),
        }
    }
}

/// A scene-backed neighbourhood returns only edges both endpoints' visibility admits.
///
/// This holds for `incident` and `induced` alike.
#[test]
fn scene_admission() {
    let mut fixture = SceneFixture::new("neighbourhood-scene-admission");
    let source = NodeRowId::new(2);
    assert_eq!(
        Neighbourhood {
            provider: fixture.scene()
        }
        .incident(source)
        .count(),
        2
    );
    let cases: [(&[u64], &[u64], &[u64]); 4] = [
        (&[1, 2], &[1], &[1]),
        (&[2], &[1, 2], &[2]),
        (&[1], &[1, 2], &[]),
        (&[1, 2], &[], &[]),
    ];
    let delivered = CompressedBitSet::from_rows([NodeRowId::new(1), source]);
    for (nodes, edges, expected) in cases {
        fixture.restrict(nodes.iter().copied(), edges.iter().copied());
        let neighbourhood = Neighbourhood {
            provider: fixture.scene(),
        };
        let actual: Vec<_> = neighbourhood
            .incident(source)
            .map(|edge| edge.row.get())
            .collect();
        assert_eq!(actual, expected);
        let actual = neighbourhood.induced(&delivered, 2);
        assert!(actual.complete);
        assert_eq!(
            actual
                .edges
                .iter()
                .map(|edge| edge.row.get())
                .collect::<Vec<_>>(),
            expected
        );
    }
}

/// A synthetic [`NeighbourhoodProvider`] over explicit node priorities and linked edges.
///
/// Hidden edges stand in for visibility masking without a real [`Scene`].
struct Graph {
    /// Every node's priority, in row order.
    priorities: IdVec<NodeRowId, NodePriority>,
    /// Every linked edge, in row order.
    edges: IdVec<EdgeRowId, DeliveredEdge>,
    /// The edge rows the provider withholds.
    hidden: CompressedBitSet<EdgeRowId>,
}

impl Graph {
    /// Builds a graph with one node per rank in `ranks`, in row order, and no edges.
    fn new(ranks: impl IntoIterator<Item = u32>) -> Self {
        Self {
            priorities: ranks
                .into_iter()
                .map(|rank| NodePriority::Rank(ImportanceRank::new(rank)))
                .collect(),
            edges: IdVec::new(),
            hidden: CompressedBitSet::new(),
        }
    }

    /// Adds and returns an edge between `endpoints` with a synthetic identity from `identity`.
    ///
    /// The endpoints may coincide in a self-loop.
    fn link(&mut self, endpoints: [u64; 2], identity: u128) -> DeliveredEdge {
        let edge = DeliveredEdge {
            row: Visible::new(EdgeRowId::from_usize(self.edges.len()).get()),
            endpoints: endpoints.map(NodeRowId::new),
            identity: ArchivedEntityId {
                web_id: Uuid::from_u128(1).into(),
                entity_uuid: Uuid::from_u128(identity).into(),
            },
        };
        self.edges.push(edge);
        edge
    }

    /// Selects the `capacity`-capped induced edge set among `rows` over this graph.
    ///
    /// [`Neighbourhood::induced`] computes it.
    ///
    /// # Panics
    ///
    /// Panics when the scan reaches an edge whose delivered target has no priority.
    fn select(&self, rows: impl IntoIterator<Item = u64>, capacity: usize) -> EdgeSet {
        let delivered = CompressedBitSet::from_rows(rows.into_iter().map(NodeRowId::new));
        Neighbourhood { provider: self }.induced(&delivered, capacity)
    }

    /// Selects the `capacity`-capped induced edge set by a full sort.
    ///
    /// The sort orders by the larger endpoint priority and edge identity, truncates to
    /// `capacity`, then returns the selected edges in identity order. This is the reference
    /// result for [`Neighbourhood::induced`]'s incremental selection.
    ///
    /// # Panics
    ///
    /// Panics if an edge between delivered nodes refers to a missing priority.
    fn reference(&self, delivered: &CompressedBitSet<NodeRowId>, capacity: usize) -> EdgeSet {
        let mut edges: Vec<_> = self
            .edges
            .iter()
            .copied()
            .filter(|edge| {
                let [source, target] = edge.endpoints;
                !self.hidden.contains(EdgeRowId::new(edge.row.get()))
                    && delivered.contains(source)
                    && delivered.contains(target)
            })
            .collect();
        edges.sort_unstable_by_key(|edge| {
            let [source, target] = edge.endpoints;
            (
                self.priorities[source].max(self.priorities[target]),
                edge.identity,
            )
        });
        let complete = edges.len() <= capacity;
        edges.truncate(capacity);
        edges.sort_unstable_by_key(|edge| edge.identity);
        EdgeSet { complete, edges }
    }
}

impl NeighbourhoodProvider for &Graph {
    fn provide_edge(&self, row: EdgeRowId) -> Option<DeliveredEdge> {
        if self.hidden.contains(row) {
            return None;
        }
        self.edges.get(row).copied()
    }

    fn provide_incoming(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId> {
        self.edges
            .iter_enumerated()
            .filter_map(move |(row, edge)| (edge.endpoints[1] == node).then_some(row))
    }

    fn provide_outgoing(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId> {
        self.edges
            .iter_enumerated()
            .filter_map(move |(row, edge)| (edge.endpoints[0] == node).then_some(row))
    }
}

impl ImportanceProvider for &Graph {
    fn provide_priority(&self, node: NodeRowId) -> Option<NodePriority> {
        self.priorities.get(node).copied()
    }
}

/// `incident` returns each parallel edge and the self-loop exactly once.
///
/// An unknown node yields no edges.
#[test]
fn incident_parallel_and_self_loop() {
    let mut graph = Graph::new([0, 1, 2]);
    let expected = [
        graph.link([0, 1], 0),
        graph.link([0, 1], 1),
        graph.link([1, 0], 2),
        graph.link([1, 1], 3),
        graph.link([1, 2], 4),
    ];
    let neighbourhood = Neighbourhood { provider: &graph };
    let mut actual: Vec<_> = neighbourhood.incident(NodeRowId::new(1)).collect();
    actual.sort_unstable_by_key(|edge| edge.identity);
    assert_eq!(actual, expected);
    assert_eq!(neighbourhood.incident(NodeRowId::new(99)).count(), 0);
}

/// `incident` omits a hidden incoming edge and a hidden self-loop.
///
/// Only the visible outgoing edge remains.
#[test]
fn incident_hidden_edge() {
    let mut graph = Graph::new([0, 1]);
    let incoming = graph.link([0, 1], 0);
    let outgoing = graph.link([1, 0], 1);
    let self_loop = graph.link([1, 1], 2);
    for edge in [incoming, self_loop] {
        graph.hidden.insert(EdgeRowId::new(edge.row.get()));
    }
    assert_eq!(
        Neighbourhood { provider: &graph }
            .incident(NodeRowId::new(1))
            .collect::<Vec<_>>(),
        [outgoing],
    );
}

/// A row repeated in the delivered set does not duplicate its edges in the induced result.
#[test]
fn induced_duplicate_rows() {
    let mut graph = Graph::new([0, 1]);
    let expected = [
        graph.link([0, 1], 0),
        graph.link([1, 0], 1),
        graph.link([1, 1], 2),
    ];
    let actual = graph.select([0, 1, 0, 1], expected.len());
    assert_eq!(actual.edges, expected);
    assert!(actual.complete);
}

/// Under a tight capacity, `induced` ranks each edge at its less prominent endpoint.
///
/// It keeps the edge whose less prominent endpoint outranks the other candidate's, and marks the
/// result incomplete.
#[test]
fn induced_worse_endpoint() {
    let mut graph = Graph::new([0, 9, 4, 5]);
    graph.link([0, 1], 0);
    let expected = graph.link([2, 3], 1);
    let actual = graph.select(0..4, 1);
    assert_eq!(actual.edges, [expected]);
    assert!(!actual.complete);
}

/// `induced` omits hidden edges and edges with an undelivered endpoint without charging the cap.
///
/// A zero capacity is complete only when no qualifying edge exists.
#[test]
fn induced_nonqualifying_tail() {
    let mut graph = Graph::new([0, 1, 2, 3, 4]);
    let expected = graph.link([0, 1], 0);
    let hidden = graph.link([2, 3], 1);
    graph.hidden.insert(EdgeRowId::new(hidden.row.get()));
    graph.link([3, 4], 2);

    let actual = graph.select([0, 1, 2, 3, 99], 1);
    assert_eq!(actual.edges, [expected]);
    assert!(actual.complete);
    let actual = graph.select([0, 1, 2, 3], 0);
    assert_eq!(actual.edges, [] as [DeliveredEdge; 0]);
    assert!(!actual.complete);
    let actual = graph.select([2, 3], 0);
    assert_eq!(actual.edges, [] as [DeliveredEdge; 0]);
    assert!(actual.complete);
}

/// `partner_of` returns the other endpoint from either side of a plain edge.
///
/// It returns [`None`] for a node not on the edge, and the same node for a self-loop.
#[test]
fn partner_direction() {
    let mut graph = Graph::new([0, 1]);
    let edge = graph.link([0, 1], 0);
    assert_eq!(edge.partner_of(NodeRowId::new(0)), Some(NodeRowId::new(1)));
    assert_eq!(edge.partner_of(NodeRowId::new(1)), Some(NodeRowId::new(0)));
    assert_eq!(edge.partner_of(NodeRowId::new(2)), None);
    let self_loop = graph.link([0, 0], 1);
    assert_eq!(
        self_loop.partner_of(NodeRowId::new(0)),
        Some(NodeRowId::new(0))
    );
}

/// A zero-capacity [`RankCap`] excludes nothing before an offer and everything after one.
///
/// The resulting set is empty and incomplete, and an untouched zero-capacity cap is complete.
#[test]
fn cap_zero() {
    let mut graph = Graph::new([0, 1]);
    let edge = graph.link([0, 1], 0);
    let priority = graph.priorities[NodeRowId::new(1)];
    let empty = RankCap::new(0);
    assert!(!empty.excludes(priority));
    assert!(empty.into_set().complete);

    let mut cap = RankCap::new(0);
    cap.offer(priority, edge);
    assert!(cap.excludes(priority));
    let actual = cap.into_set();
    assert!(!actual.complete);
    assert_eq!(actual.edges, [] as [DeliveredEdge; 0]);
}

/// A full cap is not yet truncated and remains complete until it turns an offer away.
///
/// At that point it reports both the exclusion and the incompleteness.
#[test]
fn cap_full_before_truncation() {
    let mut graph = Graph::new([0, 1]);
    let best = graph.priorities[NodeRowId::new(0)];
    let worst = graph.priorities[NodeRowId::new(1)];
    let first = graph.link([0, 0], 0);
    let second = graph.link([0, 1], 1);
    let mut cap = RankCap::new(1);
    cap.offer(best, first);
    assert!(
        !cap.excludes(worst),
        "a full selection can still be complete"
    );
    assert!(cap.into_set().complete);

    let mut cap = RankCap::new(1);
    cap.offer(best, first);
    cap.offer(worst, second);
    assert!(cap.excludes(worst));
    assert!(!cap.into_set().complete);
}

/// Equal priorities still compare by identity.
///
/// The cap keeps the lower-identity edge and excludes on that comparison even when priorities
/// alone would not decide it.
#[test]
fn cap_identity_tie() {
    let mut graph = Graph::new([7, 8]);
    let priority = graph.priorities[NodeRowId::new(0)];
    let worse = graph.priorities[NodeRowId::new(1)];
    let first = graph.link([0, 0], 9);
    let loser = graph.link([0, 1], 10);
    let winner = graph.link([0, 0], 1);
    let mut cap = RankCap::new(1);
    cap.offer(priority, first);
    cap.offer(worse, loser);
    assert!(
        !cap.excludes(priority),
        "equal priorities still compare identities"
    );
    assert!(cap.excludes(worse));
    cap.offer(priority, winner);
    let actual = cap.into_set();
    assert_eq!(actual.edges, [winner]);
    assert!(!actual.complete);
}

/// A ranked priority always outranks an identity-only priority, whatever the identity values.
#[test]
fn cap_priority_domains() {
    let mut graph = Graph::new([0, 1]);
    let unranked = graph.link([0, 1], 0);
    let ranked = graph.link([0, 1], 100);
    let mut cap = RankCap::new(1);
    cap.offer(NodePriority::Identity(unranked.identity), unranked);
    cap.offer(NodePriority::Rank(ImportanceRank::MAX), ranked);
    let actual = cap.into_set();
    assert_eq!(actual.edges, [ranked]);
    assert!(!actual.complete);
}

/// [`Neighbourhood::induced`]'s incremental selection agrees with a full sort.
///
/// [`Graph::reference`] is the sort, over randomized ranks, membership, edges and capacities.
#[property_test]
fn induced_reference(
    ranks: [u8; 8],
    members: [bool; 8],
    #[strategy = collection::vec((0_u8..8, 0_u8..8, any::<u16>(), any::<bool>()), 0..40)]
    inputs: Vec<(u8, u8, u16, bool)>,
    #[strategy = 0_usize..45] capacity: usize,
) {
    let mut graph = Graph::new(ranks.map(u32::from));
    for (node, priority) in graph.priorities.iter_enumerated_mut() {
        let rank = ranks[node.as_usize()];
        if rank & 0x80 != 0 {
            *priority = NodePriority::Identity(ArchivedEntityId {
                web_id: Uuid::from_u128(1).into(),
                entity_uuid: Uuid::from_u128(u128::from(rank & 0x7F)).into(),
            });
        }
    }
    for (index, (source, target, key, admitted)) in inputs.into_iter().enumerate() {
        let index = u64::try_from(index).expect("should fit the generated edge index");
        let identity = (u128::from(key) << 64) | u128::from(index);
        let edge = graph.link([u64::from(source), u64::from(target)], identity);
        if !admitted {
            graph.hidden.insert(EdgeRowId::new(edge.row.get()));
        }
    }
    let delivered = CompressedBitSet::from_rows(
        members
            .into_iter()
            .enumerate()
            .filter_map(|(index, member)| member.then_some(NodeRowId::from_usize(index))),
    );
    let expected = graph.reference(&delivered, capacity);
    let actual = Neighbourhood { provider: &graph }.induced(&delivered, capacity);
    prop_assert_eq!(actual.complete, expected.complete);
    prop_assert_eq!(actual.edges, expected.edges);
}
