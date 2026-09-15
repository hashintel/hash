//! What one actor may see of a generation.
//!
//! Serving artifacts contain every row. Serving resolves a [`VisibilityMask`] against the
//! permission store before delivery and reuses it for the life of a cache entry. The mask records
//! the node and edge rows the actor may receive, together with the principal and instance-
//! administrator status used for resolution. Filter construction receives property-protection
//! configuration as a separate input. The mask freezes the resulting permission-store decision.
//! [`cache`] defines when requests reuse, refresh or refuse it.
//!
//! A mask is either the whole corpus or an explicit row set, and
//! [`VisibilityKind`] names which. That distinction is the actor's admitted policy rather than an
//! observation about the row count. A scoped actor whose set happens to cover every row is
//! still scoped.

use hash_graph_store::filter::protection::{
    PropertyProtectionFilter, PropertyProtectionFilterConfig,
};
use hashql_core::id::Id;
use type_system::principal::actor::ActorId;

use crate::{
    allocator::HeapMemoryUsage,
    bitset::CompressedBitSet,
    identity::{EdgeRowId, NodeRowId},
};

pub(crate) mod cache;
pub(crate) mod resolver;

/// A visible row set over one row domain.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Rows<T> {
    /// Every row of the domain is visible.
    Full,
    /// Exactly the set rows are visible.
    Mask(CompressedBitSet<T>),
}

impl<T> Rows<T> {
    /// Tests admission, rejecting masked rows outside the represented domain.
    fn contains(&self, row: T) -> bool
    where
        T: Id,
    {
        match self {
            Self::Full => true,
            Self::Mask(mask) => mask.contains(row),
        }
    }
}

impl<T> HeapMemoryUsage for Rows<T>
where
    T: Id,
{
    /// Returns this admission set's owned heap bytes.
    ///
    /// A full set admitting every row owns none. A masked subset returns the mask's own bytes.
    fn heap_memory_usage(&self) -> u64 {
        match self {
            Self::Full => 0,
            Self::Mask(mask) => mask.heap_bytes(),
        }
    }
}

/// The principal and instance-administrator status retained by a resolved mask.
///
/// The containing cache entry keeps the administrator status unchanged across reuse.
/// Property-protection rules remain separate. Filter construction passes them to
/// [`Self::protection`].
#[derive(Debug, Copy, Clone)]
pub(crate) struct VisibilityActor {
    /// The principal the request authenticated as.
    pub id: ActorId,
    /// Whether the principal administers the instance, and so reads properties unprotected.
    pub instance_admin: bool,
}

impl VisibilityActor {
    /// Returns whether `config`'s property protection applies to this actor.
    ///
    /// An instance administrator is exempt, and an empty configuration protects nothing. Only a
    /// rule that can withhold a property incurs the masking cost.
    #[must_use]
    pub(crate) fn masked_by(self, config: &PropertyProtectionFilterConfig<'_>) -> bool {
        !config.is_empty() && !self.instance_admin
    }

    /// Builds the property protection filter that applies to this actor, when one does.
    ///
    /// Returns [`None`] exactly when [`masked_by`](Self::masked_by) is false, which the caller
    /// reads as unprotected delivery.
    #[must_use]
    pub(crate) fn protection<'config, 'rules>(
        self,
        config: &'config PropertyProtectionFilterConfig<'rules>,
    ) -> Option<PropertyProtectionFilter<'config, 'rules>> {
        self.masked_by(config)
            .then(|| config.to_property_protection_filter(Some(self.id)))
    }
}

hashql_core::id::newtype! {
    /// A row of domain `T` accompanied by a visibility-admission witness.
    ///
    /// [`VisibilityMask::visible_node`] and [`VisibilityMask::visible_edge`] are the ordinary
    /// construction paths. Macro-generated constructors and conversions remain crate-visible and
    /// require their callers to establish the same admission condition. Assembly accepts `Visible<T>`
    /// where policy permits delivery, distinguishing an admitted row from an ordinary row
    /// identifier.
    pub(crate) struct Visible<T>(u64)
}

impl<T> Visible<T> {
    /// Returns the underlying row identifier, discarding the admission evidence.
    pub(crate) fn unwrap(self) -> T
    where
        T: Id,
    {
        T::from_u64(self.as_u64())
    }
}

/// The declared delivery policy, independent of a mask's cardinality.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum VisibilityKind {
    /// The actor is admitted to the whole corpus.
    Corpus,
    /// The actor is admitted to an explicit row set.
    Scope,
}

/// The rows one actor may receive from a generation.
///
/// Each cache entry retains one mask from a single resolution. The mask carries no delta revision.
/// Assembly consults it for every row. Full masks admit any row queried during their lifetime,
/// including a later allocation, while partial masks admit only their captured bits. Later rows
/// remain hidden until refresh. The associated
/// [`ViewSchedule`](crate::serve::schedule::ViewSchedule) retains only the placements captured
/// during entry construction. The schedule omits a newly allocated row until refresh rebuilds that
/// entry.
///
/// [`visible_node`](Self::visible_node) and [`visible_edge`](Self::visible_edge) are response hot
/// paths. Their [`Visible`] results let assembly require a typed admission witness instead of an
/// ordinary row identifier. Other crate-visible construction paths carry the same admission
/// obligation.
#[derive(Debug)]
pub(crate) struct VisibilityMask {
    actor: VisibilityActor,
    nodes: Rows<NodeRowId>,
    edges: Rows<EdgeRowId>,
}

impl VisibilityMask {
    /// Admits `actor` to the whole corpus.
    pub(crate) const fn full(actor: VisibilityActor) -> Self {
        Self {
            actor,
            nodes: Rows::Full,
            edges: Rows::Full,
        }
    }

    /// Admits `actor` to exactly the given node and edge rows.
    pub(crate) const fn partial(
        actor: VisibilityActor,
        nodes: CompressedBitSet<NodeRowId>,
        edges: CompressedBitSet<EdgeRowId>,
    ) -> Self {
        Self {
            actor,
            nodes: Rows::Mask(nodes),
            edges: Rows::Mask(edges),
        }
    }

    /// Returns the principal captured during this mask's resolution.
    pub(crate) const fn actor(&self) -> VisibilityActor {
        self.actor
    }

    /// Returns the delivery policy the mask declares.
    pub(crate) const fn kind(&self) -> VisibilityKind {
        match self.nodes {
            Rows::Full => VisibilityKind::Corpus,
            Rows::Mask(_) => VisibilityKind::Scope,
        }
    }

    /// Admits `node`, or returns [`None`] where the actor may not receive it.
    pub(crate) fn visible_node(&self, node: NodeRowId) -> Option<Visible<NodeRowId>> {
        self.nodes.contains(node).then(|| Visible::new(node.get()))
    }

    /// Admits `edge`, or returns [`None`] where the actor may not receive it.
    ///
    /// An edge needs its own admission and the admission of both `endpoints`. Delivering an edge
    /// whose endpoint is withheld would disclose that the endpoint exists, which the endpoint's
    /// own exclusion is there to prevent.
    pub(crate) fn visible_edge(
        &self,
        edge: EdgeRowId,
        endpoints: [NodeRowId; 2],
    ) -> Option<Visible<EdgeRowId>> {
        (self.edges.contains(edge)
            && endpoints
                .iter()
                .all(|&endpoint| self.nodes.contains(endpoint)))
        .then(|| Visible::new(edge.get()))
    }
}

impl HeapMemoryUsage for VisibilityMask {
    /// Returns the combined heap ownership of the node and edge admission sets.
    ///
    /// Cache weighting uses this value, which excludes shared allocations.
    fn heap_memory_usage(&self) -> u64 {
        self.nodes.heap_memory_usage() + self.edges.heap_memory_usage()
    }
}
