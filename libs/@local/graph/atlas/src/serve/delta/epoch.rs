use alloc::sync::Arc;
use core::{ops::Deref, ptr};

use arc_swap::Guard;

use super::{
    Delta, DeltaReference, DeltaRevision,
    importance::DeltaImportanceProvider,
    layout::LayoutDelta,
    overlay::{DeltaIdentityProvider, IdentityProviderResidual, NaiveIdentityProvider},
    topology::TopologyDelta,
};
use crate::{
    dataset::auxiliary::{OwnedIcon, OwnedLegend},
    file::generation::GenerationId,
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    serve::world::{
        NodeIndex, Ontology, layout::Layout, node_importance::ImportanceProvider,
        topology::Topology,
    },
};

enum InternalEpoch {
    Full(Arc<Delta>),
    Shared(Guard<Arc<Delta>>),
}

impl InternalEpoch {
    fn load_full(&self) -> Self {
        match self {
            Self::Full(arc) => Self::Full(Arc::clone(arc)),
            Self::Shared(guard) => Self::Full(Arc::clone(guard)),
        }
    }
}

impl Deref for InternalEpoch {
    type Target = Delta;

    fn deref(&self) -> &Self::Target {
        match self {
            Self::Full(arc) => arc,
            Self::Shared(guard) => guard,
        }
    }
}

/// A guard retaining one immutable delta publication for a request.
///
/// All component queries through this guard use the same captured revision.
pub(crate) struct Epoch {
    delta: InternalEpoch,
}

impl Epoch {
    pub(crate) fn generation(&self) -> GenerationId {
        self.delta.world.generation().id()
    }

    pub(crate) fn reference(&self) -> DeltaReference {
        DeltaReference {
            id: self.delta.id,
            revision: self.delta.revision,
        }
    }

    pub(crate) fn revision(&self) -> DeltaRevision {
        self.delta.revision
    }

    pub(crate) fn fork(&self) -> Self {
        Self {
            delta: self.delta.load_full(),
        }
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

    /// Borrows captured node identities after checking their world association.
    ///
    /// # Panics
    ///
    /// Panics if `index` does not belong to the epoch's world.
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

    /// Borrows captured edge identities after checking their world association.
    ///
    /// # Panics
    ///
    /// Panics if `topology` does not belong to the epoch's world.
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

    /// Borrows captured ontology identities after checking their world association.
    ///
    /// # Panics
    ///
    /// Panics if `ontology` does not belong to the epoch's world.
    pub(crate) fn ontology(
        &self,
        ontology: &Ontology,
    ) -> &IdentityProviderResidual<ArchivedOntologyTypeUuid, OntologyRowId, OwnedIcon> {
        assert!(
            ptr::eq(ontology, ptr::from_ref(&self.delta.world.ontology)),
            "ontology must belong to the epoch's world",
        );

        &self.delta.ontology
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

impl core::fmt::Debug for Epoch {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.debug_struct("Epoch")
            .field("generation", &self.generation())
            .field("revision", &self.revision())
            .finish_non_exhaustive()
    }
}

impl From<Guard<Arc<Delta>>> for Epoch {
    fn from(delta: Guard<Arc<Delta>>) -> Self {
        Self {
            delta: InternalEpoch::Shared(delta),
        }
    }
}
