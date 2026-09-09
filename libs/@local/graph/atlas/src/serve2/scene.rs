use error_stack::{Report, ResultExt as _};

use super::{
    delta::epoch::Epoch,
    schedule::{DeliverySchedule, ViewSchedule},
    visibility::{VisibilityMask, cache::CacheEntry},
    world::World,
};
use crate::morton::Zoom;

#[derive(Debug)]
pub enum SceneError {
    Delivery,
}

impl core::fmt::Display for SceneError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Delivery => fmt.write_str("unable to build delivery schedule"),
        }
    }
}

impl core::error::Error for SceneError {}

#[derive(Debug, Copy, Clone)]
pub(crate) struct Scene<'scene> {
    pub world: &'scene World,
    pub epoch: &'scene Epoch,
    pub mask: &'scene VisibilityMask,
    pub schedule: &'scene ViewSchedule,
    pub delivery: DeliverySchedule<'scene>,
}

impl<'scope> Scene<'scope> {
    pub(crate) fn of(
        world: &'scope World,
        epoch: &'scope Epoch,
        entry: &'scope CacheEntry,
        k: Zoom,
    ) -> Result<Self, Report<SceneError>> {
        let delivery = entry.schedule.cut(k).change_context(SceneError::Delivery)?;

        Ok(Scene {
            world,
            epoch,
            mask: &entry.mask,
            schedule: &entry.schedule,
            delivery,
        })
    }
}
