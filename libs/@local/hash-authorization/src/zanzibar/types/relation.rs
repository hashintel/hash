use serde::{Deserialize, Serialize};

use crate::zanzibar::types::Resource;

/// Encapsulates the relationship between an [`Resource`] and a [`Subject`].
///
/// [`Subject`]: crate::zanzibar::types::Subject
pub trait Relation<O: Resource> {}
impl<O: Resource> Relation<O> for ! {}

#[derive(
    Debug, Default, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize,
)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub struct LeveledRelation<N> {
    pub name: N,
    pub level: u8,
}
