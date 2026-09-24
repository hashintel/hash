//! Request-bound document assembly over a publication and cached visibility scope.

use error_stack::{Report, ResultExt as _};

use super::{
    delta::epoch::Epoch,
    schedule::{DeliverySchedule, ViewSchedule},
    visibility::{VisibilityMask, cache::CacheEntry},
    world::World,
};
use crate::morton::Zoom;

/// The reason [`Scene::of`] could not assemble a scene.
#[derive(Debug)]
pub(crate) enum SceneError {
    /// The requested density offset puts a scoped delivery cut beyond the Morton key width.
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

/// A request publication bound to one cached visibility scope and delivery schedule.
///
/// The world and epoch belong to the admitted request. The mask and delivery schedule belong to a
/// cache entry for the same generation and delta lifetime, but the cache may have resolved them at
/// an older revision. Identity, geometry and topology reads use `epoch`. Row admission uses the
/// cached mask, while delivery order and Morton keys come from the cached schedule. Scoped delivery
/// applies the requested density offset across the generation's served tile-zoom range. Corpus
/// delivery keeps its recorded cuts for every offset. Every field shares the scene's borrow
/// lifetime.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Scene<'scene> {
    /// The requested generation's opened serving artifacts.
    pub world: &'scene World,
    /// The immutable delta publication captured for this request.
    pub epoch: &'scene Epoch,
    /// The cached authorization decision applied to delivered rows.
    pub mask: &'scene VisibilityMask,
    /// The cached row assignment and keys from visibility resolution.
    pub schedule: &'scene ViewSchedule,
    /// The offset-bound scoped cuts or the recorded corpus cuts.
    pub delivery: DeliverySchedule<'scene>,
}

impl<'scope> Scene<'scope> {
    /// Binds a cached visibility scope to the request's publication and delivery schedule.
    ///
    /// `zoom` deepens the scoped delivery cuts while preserving the generation's served tile-zoom
    /// range. `world` and `epoch` must come from the same requested
    /// [`Universe`](crate::serve::runtime::registry::Universe). `entry` must be the scope returned
    /// for that request's generation and delta lifetime. This method does not verify either
    /// association. The publication used to build `entry` need not have the same revision because
    /// visibility caching intentionally reuses a scope across publications within one lifetime.
    ///
    /// # Errors
    ///
    /// Returns [`SceneError::Delivery`] when `zoom` puts a scoped delivery cut beyond the Morton
    /// key width.
    pub(crate) fn of(
        world: &'scope World,
        epoch: &'scope Epoch,
        entry: &'scope CacheEntry,
        zoom: Zoom,
    ) -> Result<Self, Report<SceneError>> {
        let delivery = entry
            .schedule
            .cut(zoom)
            .change_context(SceneError::Delivery)?;

        Ok(Scene {
            world,
            epoch,
            mask: &entry.mask,
            schedule: &entry.schedule,
            delivery,
        })
    }
}
