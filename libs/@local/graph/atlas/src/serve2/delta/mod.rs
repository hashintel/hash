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

use rand::TryCryptoRng;

use self::{
    feed::DeltaFeedEvent, layout::LayoutDelta, overlay::IdentityProviderResidual,
    topology::TopologyDelta,
};
use super::world::World;
use crate::{
    dataset::auxiliary::{OwnedIcon, OwnedLegend},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::Vec2,
    postgres::id::{ArchivedEntityUuid, ArchivedOntologyTypeUuid},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct DeltaRevision(u64);

impl DeltaRevision {
    fn increment(&mut self) {
        self.0 += 1;
    }

    fn decrement(&mut self) {
        self.0 -= 1;
    }
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

struct DeltaProvider {
    id: DeltaId,
}

impl DeltaProvider {
    fn new<R>(rng: R) -> Result<Self, R::Error>
    where
        R: TryCryptoRng,
    {
        let id = DeltaId::new(rng)?;
        Ok(Self { id })
    }
}

pub(crate) struct Projected<T> {
    value: T,
    position: Vec2,
}

pub(crate) struct Delta {
    world: Arc<World>,

    id: DeltaId,
    revision: DeltaRevision,

    ontology: IdentityProviderResidual<ArchivedOntologyTypeUuid, OntologyRowId, OwnedIcon>,

    node: IdentityProviderResidual<ArchivedEntityUuid, NodeRowId, OwnedLegend>,
    edge: IdentityProviderResidual<ArchivedEntityUuid, EdgeRowId, OwnedLegend>,

    topology: TopologyDelta,
    layout: LayoutDelta,
}

impl Delta {
    pub(crate) fn new<R>(world: Arc<World>, rng: impl TryCryptoRng) -> Result<Self, R::Error>
    where
        R: TryCryptoRng,
    {
        todo!()
    }

    fn apply_event(&mut self, event: DeltaFeedEvent) -> bool {
        match event.kind {
            feed::DeltaEventKind::Live {
                edition,
                position,
                payload,
                endpoints: None,
            } => todo!(),
            feed::DeltaEventKind::Live {
                edition,
                position,
                payload,
                endpoints: Some([source, target]),
            } => todo!(),
            feed::DeltaEventKind::Defect => {
                return false;
            }
            feed::DeltaEventKind::Withdrawn => {
                // let mut changed = false;
                // changed |= self.node.withdraw((), self.revision, event.entity.entity_uuid);
                // changed |= self.edge.withdraw((), self.revision, event.entity.entity_uuid);
                // changed
                todo!("connect the identity providers before applying withdrawals")
            }
        }
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
