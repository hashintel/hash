use alloc::borrow::Cow;

use serde::Serialize;
use type_system::url::VersionedUrl;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "op")]
pub enum EntityTypeIdDiff<'e> {
    Added { added: Cow<'e, VersionedUrl> },
    Removed { removed: Cow<'e, VersionedUrl> },
}

impl EntityTypeIdDiff<'_> {
    #[must_use]
    pub fn into_owned(self) -> EntityTypeIdDiff<'static> {
        match self {
            Self::Added { added } => EntityTypeIdDiff::Added {
                added: Cow::Owned(added.into_owned()),
            },
            Self::Removed { removed } => EntityTypeIdDiff::Removed {
                removed: Cow::Owned(removed.into_owned()),
            },
        }
    }
}
