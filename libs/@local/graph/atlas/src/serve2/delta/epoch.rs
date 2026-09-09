use alloc::sync::Arc;
use core::ptr;

use arc_swap::Guard;

use super::{
    Delta, DeltaRevision,
    importance::DeltaImportanceProvider,
    layout::{LayoutDelta, provider::NaiveLayoutProvider},
    overlay::{DeltaIdentityProvider, IdentityProviderResidual, NaiveIdentityProvider},
    topology::TopologyDelta,
};
use crate::{
    dataset::auxiliary::OwnedLegend,
    identity::{EdgeRowId, NodeRowId},
    postgres::id::ArchivedEntityId,
    serve2::world::{
        Geometry, NodeIndex,
        layout::{Layout, LayoutProvider as _},
        node_importance::ImportanceProvider,
        topology::Topology,
    },
};

/// A guard retaining one immutable delta publication for a request.
///
/// All component queries through this guard use the same captured revision.
pub(crate) struct Epoch {
    delta: Guard<Arc<Delta>>,
}

impl Epoch {
    pub(crate) fn revision(&self) -> DeltaRevision {
        self.delta.revision
    }

    /// Returns whether a node has a visible placement at the captured revision.
    pub(crate) fn contains_node(&self, node: NodeRowId) -> bool {
        self.delta.world.layout.position(self, node).is_some()
    }

    /// Borrows the captured layout changes after checking their world association.
    ///
    /// # Panics
    ///
    /// Panics if `layout` does not belong to the epoch's world.
    pub(crate) fn layout(&self, layout: &Layout) -> &LayoutDelta {
        assert!(
            ptr::eq(layout, ptr::from_ref(&self.delta.world.layout)),
            "layout must belong to the epoch's world",
        );

        &self.delta.layout
    }

    pub(crate) fn nodes(
        &self,
        index: &NodeIndex,
    ) -> &IdentityProviderResidual<ArchivedEntityId, NodeRowId, OwnedLegend> {
        assert!(
            ptr::eq(index, ptr::from_ref(&self.delta.world.layout.index)),
            "index must belong to the epoch's world",
        );

        &self.delta.node
    }

    pub(crate) fn edges(
        &self,
        topology: &Topology,
    ) -> &IdentityProviderResidual<ArchivedEntityId, EdgeRowId, OwnedLegend> {
        assert!(
            ptr::eq(topology, ptr::from_ref(&self.delta.world.topology)),
            "topology must belong to the epoch's world",
        );

        &self.delta.edge
    }

    /// Returns priorities over this publication's allocated nodes.
    ///
    /// # Panics
    ///
    /// Panics if `layout` does not belong to the epoch's world.
    pub(crate) fn importance<'epoch>(
        &'epoch self,
        layout: &Layout,
    ) -> impl ImportanceProvider + use<'epoch> {
        self.layout(layout);
        DeltaImportanceProvider::from_parts(
            &self.delta.world.layout,
            DeltaIdentityProvider::from_parts(
                &self.delta.node,
                NaiveIdentityProvider::from_ref(&self.delta.world.layout.index.identity),
            ),
        )
    }

    /// Borrows the captured topology changes after checking their world association.
    ///
    /// # Panics
    ///
    /// Panics if `topology` does not belong to the epoch's world.
    pub(crate) fn topology(&self, topology: &Topology) -> &TopologyDelta {
        assert!(
            ptr::eq(topology, ptr::from_ref(&self.delta.world.topology)),
            "topology must belong to the epoch's world",
        );
        &self.delta.topology
    }
}

impl From<Guard<Arc<Delta>>> for Epoch {
    fn from(delta: Guard<Arc<Delta>>) -> Self {
        Self { delta }
    }
}
