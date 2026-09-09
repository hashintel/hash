//! Captured view scheduling under corpus or scoped visibility.
//!
//! [`ViewSchedule`] preserves the visibility declaration. Saturated scopes share the generation's
//! complete base cascade and retain their extension rows separately. Narrow scopes recompute the
//! cascade over every admitted placement.

use alloc::sync::Arc;

use hashql_core::id::Id as _;

use super::{
    column::{BucketColumn, ScheduleNode},
    cut::{DeliverySchedule, ScheduleWidthError},
    scope::ScopeSchedule,
};
use crate::{
    identity::NodeRowId,
    morton::Zoom,
    serve2::{
        delta::epoch::Epoch,
        visibility::{VisibilityKind, VisibilityMask},
        world::World,
    },
};

#[cfg(test)]
mod tests;

#[derive(Debug)]
enum ScheduleData {
    Corpus {
        extension: BucketColumn,
    },
    Saturated {
        base: Arc<ScopeSchedule>,
        extension: BucketColumn,
    },
    Scoped(ScopeSchedule),
}

/// A captured node schedule associated with its base generation.
///
/// Corpus schedules preserve recorded base assignments through withdrawals. Scoped schedules
/// include only the mask's admitted placements at construction. Extension rows use captured keys
/// and priorities in both modes.
#[derive(Debug)]
pub(crate) struct ViewSchedule {
    world: Arc<World>,
    data: ScheduleData,
}

impl ViewSchedule {
    /// Resolves the visibility declaration against one captured publication.
    ///
    /// # Panics
    ///
    /// Panics if `world` does not belong to `epoch`.
    pub(crate) fn of(world: Arc<World>, epoch: &Epoch, mask: &VisibilityMask) -> Self {
        let count = world.layout.node_count(epoch);

        let saturated = || {
            (NodeRowId::MIN..world.layout.index.base_node_bound()).all(|node| {
                mask.visible_node(node).is_some() && world.layout.position(epoch, node).is_some()
            })
        };

        let extension = || {
            (world.layout.index.base_node_bound()..NodeRowId::from_usize(count))
                .filter_map(|node| ScheduleNode::visible(&world.layout, epoch, mask, node))
                .collect()
        };

        let data = match mask.kind() {
            VisibilityKind::Corpus => ScheduleData::Corpus {
                extension: BucketColumn::new(extension(), |key| {
                    world.layout.base_shared_depth(key)
                }),
            },
            VisibilityKind::Scope if saturated() => {
                let base = Arc::clone(world.base_scope_schedule());
                let extension =
                    BucketColumn::new(extension(), |key| base.column().shared_depth(key));
                ScheduleData::Saturated { base, extension }
            }
            VisibilityKind::Scope => {
                ScheduleData::Scoped(ScopeSchedule::of(&world.layout, epoch, mask))
            }
        };

        Self { world, data }
    }

    /// Binds the scoped density offset or reads the corpus's recorded cuts.
    ///
    /// Corpus delivery keeps its recorded cuts for every `offset`.
    ///
    /// # Errors
    ///
    /// Returns [`ScheduleWidthError`] when a scoped offset exceeds the Morton key width.
    pub(crate) fn cut(&self, offset: Zoom) -> Result<DeliverySchedule<'_>, ScheduleWidthError> {
        match &self.data {
            ScheduleData::Corpus { extension } => {
                Ok(DeliverySchedule::corpus(&self.world).with_extension(extension))
            }
            ScheduleData::Saturated { base, extension } => base
                .cut(self.world.schedule(), offset)
                .map(|cut| cut.with_extension(extension)),
            ScheduleData::Scoped(schedule) => schedule.cut(self.world.schedule(), offset),
        }
    }
}
