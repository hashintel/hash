pub(crate) mod epoch;
mod feed;
mod history;
mod id;
pub(crate) mod layout;
mod overlay;
mod placement;
mod projector;
pub(crate) mod topology;

use alloc::sync::Arc;

use hashql_core::id::Id as _;
use rand::TryCryptoRng;

use self::{
    layout::LayoutDelta,
    overlay::{IdentityProviderResidual, NaiveIdentityProvider},
    topology::TopologyDelta,
};
use super::world::World;
use crate::{
    dataset::auxiliary::{OwnedIcon, OwnedLegend},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    postgres::id::{ArchivedEntityId, ArchivedEntityUuid, ArchivedOntologyTypeUuid},
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

    fn withdraw(&mut self, entity: ArchivedEntityUuid) -> bool {
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

        let mut changed = false;

        // changed |= self
        //     .node
        //     .withdraw(&self.world.layout.index.identity, self.revision, entity);
        // changed |= self
        //     .edge
        //     .withdraw(&self.world.topology.identity, self.revision, entity);

        // changed |= topology.withdraw(&self.world.topology, entity, self.revision);
        // changed |= layout.withdraw(&self.world.layout, entity, self.revision);
        changed
    }

    fn update(&mut self, entity: ArchivedEntityUuid) -> bool {
        todo!()
    }

    fn register_ontology(&mut self) {}
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
