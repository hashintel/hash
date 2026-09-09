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
    fn heap_memory_usage(&self) -> u64 {
        match self {
            Self::Full => 0,
            Self::Mask(mask) => mask.heap_bytes(),
        }
    }
}

#[derive(Debug, Copy, Clone)]
pub(crate) struct VisibilityActor {
    pub id: ActorId,
    pub instance_admin: bool,
}

impl VisibilityActor {
    #[must_use]
    pub(crate) fn masked_by(self, config: &PropertyProtectionFilterConfig<'_>) -> bool {
        !config.is_empty() && !self.instance_admin
    }

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
    pub(crate) struct Visible<T>(u64)
}

/// The declared delivery policy, independent of a mask's cardinality.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum VisibilityKind {
    Corpus,
    Scope,
}

pub(crate) struct VisibilityMask {
    actor: VisibilityActor,
    nodes: Rows<NodeRowId>,
    edges: Rows<EdgeRowId>,
}

impl VisibilityMask {
    pub(crate) const fn full(actor: VisibilityActor) -> Self {
        Self {
            actor,
            nodes: Rows::Full,
            edges: Rows::Full,
        }
    }

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

    pub(crate) const fn kind(&self) -> VisibilityKind {
        match self.nodes {
            Rows::Full => VisibilityKind::Corpus,
            Rows::Mask(_) => VisibilityKind::Scope,
        }
    }

    pub(crate) fn visible_node(&self, node: NodeRowId) -> Option<Visible<NodeRowId>> {
        self.nodes.contains(node).then(|| Visible::new(node.get()))
    }

    pub(crate) fn visible_edge(&self, edge: EdgeRowId) -> Option<Visible<EdgeRowId>> {
        self.edges.contains(edge).then(|| Visible::new(edge.get()))
    }
}

impl HeapMemoryUsage for VisibilityMask {
    fn heap_memory_usage(&self) -> u64 {
        self.nodes.heap_memory_usage() + self.edges.heap_memory_usage()
    }
}
