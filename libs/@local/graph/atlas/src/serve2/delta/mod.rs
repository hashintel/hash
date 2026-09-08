mod consumer;
mod overlay;
mod placement;

use rand::TryCryptoRng;
use type_system::knowledge::entity::id::EntityEditionId;

use crate::{
    identity::{EdgeRowId, NodeRowId},
    math::Vec2,
};

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

pub(crate) struct DeltaNode {
    id: NodeRowId,
    edition: EntityEditionId,
}

pub(crate) struct DeltaEdge {
    id: EdgeRowId,
    edition: EntityEditionId,

    source: NodeRowId,
    target: NodeRowId,
}
