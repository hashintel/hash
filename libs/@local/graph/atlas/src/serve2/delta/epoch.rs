use alloc::sync::Arc;
use core::ptr;

use arc_swap::Guard;

use super::{Delta, DeltaRevision, layout::LayoutDelta, topology::TopologyDelta};
use crate::serve2::world::{layout::Layout, topology::Topology};

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
