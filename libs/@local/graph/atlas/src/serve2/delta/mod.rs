pub(crate) mod epoch;
mod feed;
mod history;
mod id;
mod importance;
pub(crate) mod layout;
pub(crate) mod overlay;
mod placement;
mod projector;
pub(crate) mod topology;

#[cfg(test)]
mod tests;

use alloc::sync::Arc;

use hashql_core::id::Id as _;
use rand::TryCryptoRng;

use self::{
    layout::{LayoutDelta, provider::NaiveLayoutProvider},
    overlay::{
        DeltaIdentityProvider, IdentityProviderResidual, NaiveIdentityProvider,
        VersionedIdentityProvider as _,
    },
    topology::{TopologyDelta, provider::NaiveTopologyProvider},
};
use super::world::World;
use crate::{
    dataset::auxiliary::{OwnedIcon, OwnedLegend},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::Vec2,
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
};

hashql_core::id::newtype! {
    pub(crate) struct DeltaRevision(u64)
}

#[derive(Debug, Copy, Clone)]
struct DeltaId(u64);

impl DeltaId {
    fn new<R>(mut rng: R) -> Result<Self, R::Error>
    where
        R: TryCryptoRng,
    {
        let bytes = rng.try_next_u64()?;
        Ok(Self(bytes))
    }
}

pub(crate) struct Delta {
    world: Arc<World>,

    id: DeltaId,
    revision: DeltaRevision,

    ontology: IdentityProviderResidual<ArchivedOntologyTypeUuid, OntologyRowId, OwnedIcon>,

    node: IdentityProviderResidual<ArchivedEntityId, NodeRowId, OwnedLegend>,
    edge: IdentityProviderResidual<ArchivedEntityId, EdgeRowId, OwnedLegend>,

    topology: TopologyDelta,
    layout: LayoutDelta,
}

impl Delta {
    pub(crate) fn new<R>(world: Arc<World>, rng: R) -> Result<Self, R::Error>
    where
        R: TryCryptoRng,
    {
        let id = DeltaId::new(rng)?;
        let revision = DeltaRevision::MIN;

        Ok(Self {
            id,
            revision,
            ontology: IdentityProviderResidual::new(NaiveIdentityProvider::from_ref(
                &world.ontology.identity,
            )),
            node: IdentityProviderResidual::new(NaiveIdentityProvider::from_ref(
                &world.layout.index.identity,
            )),
            edge: IdentityProviderResidual::new(NaiveIdentityProvider::from_ref(
                &world.topology.identity,
            )),
            topology: TopologyDelta::default(),
            layout: LayoutDelta::default(),
            world,
        })
    }

    /// Resolves an allocated node row, including a withdrawn node.
    fn node_row(&self, entity: ArchivedEntityId) -> Option<NodeRowId> {
        DeltaIdentityProvider::from_parts(
            &self.node,
            NaiveIdentityProvider::from_ref(&self.world.layout.index.identity),
        )
        .provide_allocated_row_of(entity)
    }

    /// Returns a node's retained wire coordinates, including after withdrawal.
    fn node_position(&self, entity: ArchivedEntityId) -> Option<Vec2> {
        self.layout.recorded_position(
            &NaiveLayoutProvider::new(&self.world.layout),
            self.node_row(entity)?,
        )
    }

    /// Hides an entity's identity and geometry without releasing its row.
    fn withdraw(&mut self, entity: ArchivedEntityId) -> bool {
        let node = self.node_row(entity);
        let edge = DeltaIdentityProvider::from_parts(
            &self.edge,
            NaiveIdentityProvider::from_ref(&self.world.topology.identity),
        )
        .provide_allocated_row_of(entity);

        let mut changed = self.node.withdraw(
            NaiveIdentityProvider::from_ref(&self.world.layout.index.identity),
            self.revision,
            entity,
        );
        changed |= self.edge.withdraw(
            NaiveIdentityProvider::from_ref(&self.world.topology.identity),
            self.revision,
            entity,
        );

        if let Some(node) = node {
            changed |= self.layout.withdraw(
                &NaiveLayoutProvider::new(&self.world.layout),
                node,
                self.revision,
            );
        }

        if let Some(edge) = edge {
            changed |= self.topology.withdraw(
                NaiveTopologyProvider::from_ref(&self.world.topology),
                edge,
                self.revision,
            );
        }
        changed
    }

    /// Activates a node and replaces its legend, retaining its first placement.
    ///
    /// `position` uses the [wire frame](crate::salt::lod::stage::WIRE_FRAME). Returns whether state
    /// changed, or `None` when no node row remains available.
    fn update_node(
        &mut self,
        entity: ArchivedEntityId,
        legend: OwnedLegend,
        position: Vec2,
    ) -> Option<bool> {
        let (node, mut changed) = self.node.insert(
            NaiveIdentityProvider::from_ref(&self.world.layout.index.identity),
            self.revision,
            entity,
            legend,
        )?;
        self.topology
            .reserve_node(NaiveTopologyProvider::from_ref(&self.world.topology), node);

        changed |= self.layout.insert(
            &NaiveLayoutProvider::new(&self.world.layout),
            node,
            position,
            self.revision,
        );
        Some(changed)
    }

    /// Records an edge legend and activates a resolved endpoint pair.
    ///
    /// An edge retains its first bound pair.
    ///
    /// An unresolved pair reserves the edge row without binding it. Returns whether state changed,
    /// or `None` when no edge row remains available.
    fn update_edge(
        &mut self,
        entity: ArchivedEntityId,
        legend: OwnedLegend,
        endpoints: Option<[NodeRowId; 2]>,
    ) -> Option<bool> {
        let (edge, mut changed) = self.edge.insert(
            NaiveIdentityProvider::from_ref(&self.world.topology.identity),
            self.revision,
            entity,
            legend,
        )?;

        let base = NaiveTopologyProvider::from_ref(&self.world.topology);

        self.topology.reserve_edge(base, edge);
        if let Some(endpoints) = endpoints {
            changed |= self.topology.insert(base, edge, endpoints, self.revision);
        }

        Some(changed)
    }

    /// Resolves an ontology row and replaces its icon.
    ///
    /// Returns the row and whether state changed, or `None` when no ontology row remains available.
    fn register_ontology(
        &mut self,
        ontology: ArchivedOntologyTypeUuid,
        icon: OwnedIcon,
    ) -> Option<(OntologyRowId, bool)> {
        self.ontology.insert(
            NaiveIdentityProvider::from_ref(&self.world.ontology.identity),
            self.revision,
            ontology,
            icon,
        )
    }

    pub(crate) fn withdrawn_nodes(&self) -> impl IntoIterator<Item = NodeRowId> {
        self.node.withdrawn(NaiveIdentityProvider::from_ref(
            &self.world.layout.index.identity,
        ))
    }

    pub(crate) fn withdrawn_edges(&self) -> impl IntoIterator<Item = EdgeRowId> {
        self.edge.withdrawn(NaiveIdentityProvider::from_ref(
            &self.world.topology.identity,
        ))
    }
}

impl Clone for Delta {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            world: Arc::clone(&self.world),
            id: self.id,
            revision: self.revision,
            ontology: self.ontology.clone(),
            node: self.node.clone(),
            edge: self.edge.clone(),
            topology: self.topology.clone(),
            layout: self.layout.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        let Self {
            world,
            id,
            revision,
            ontology,
            node,
            edge,
            topology,
            layout,
        } = self;

        world.clone_from(&source.world);
        id.clone_from(&source.id);
        revision.clone_from(&source.revision);
        ontology.clone_from(&source.ontology);
        node.clone_from(&source.node);
        edge.clone_from(&source.edge);
        topology.clone_from(&source.topology);
        layout.clone_from(&source.layout);
    }
}
