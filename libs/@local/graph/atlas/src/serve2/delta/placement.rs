use core::time::Duration;

use tokio::sync::mpsc;
use type_system::knowledge::entity::EntityId;

use super::projector;

struct DeltaPlacementTaskOptions {
    tick_rate: Duration,
}

pub(crate) struct DeltaPlacementTask {
    projector: projector::DeltaProjector,
    options: DeltaPlacementTaskOptions,

    rx: mpsc::Receiver<EntityId>,
}
