mod consumer;
mod epoch;
mod history;
mod layout;
mod overlay;
mod placement;
mod topology;

use rand::TryCryptoRng;

use self::{layout::LayoutDelta, overlay::IdentityProviderResidual, topology::TopologyDelta};
use crate::{
    dataset::auxiliary::{OwnedIcon, OwnedLegend},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::Vec2,
    postgres::id::{ArchivedEntityUuid, ArchivedOntologyTypeUuid},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct DeltaRevision(u64);

struct DeltaProviderId(u64);

impl DeltaProviderId {
    fn new<R>(mut rng: R) -> Result<Self, R::Error>
    where
        R: TryCryptoRng,
    {
        let bytes = rng.try_next_u64()?;
        Ok(Self(bytes))
    }
}

struct DeltaProvider {
    id: DeltaProviderId,
}

impl DeltaProvider {
    fn new<R>(rng: R) -> Result<Self, R::Error>
    where
        R: TryCryptoRng,
    {
        let id = DeltaProviderId::new(rng)?;
        Ok(Self { id })
    }
}

pub(crate) struct Projected<T> {
    value: T,
    position: Vec2,
}

pub(crate) struct Delta {
    ontology: IdentityProviderResidual<ArchivedOntologyTypeUuid, OntologyRowId, OwnedIcon>,

    node: IdentityProviderResidual<ArchivedEntityUuid, NodeRowId, OwnedLegend>,
    edge: IdentityProviderResidual<EdgeRowId, EdgeRowId, OwnedLegend>,

    topology: TopologyDelta,
    layout: LayoutDelta,
}

impl Clone for Delta {
    #[inline]
    fn clone(&self) -> Self {
        Self {
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
            ontology,
            node,
            edge,
            topology,
            layout,
        } = self;

        ontology.clone_from(&source.ontology);
        node.clone_from(&source.node);
        edge.clone_from(&source.edge);
        topology.clone_from(&source.topology);
        layout.clone_from(&source.layout);
    }
}
