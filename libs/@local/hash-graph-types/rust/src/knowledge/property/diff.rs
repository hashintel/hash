use alloc::borrow::Cow;

use serde::Serialize;
use type_system::url::VersionedUrl;

use crate::knowledge::{Property, PropertyPath};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "op")]
pub enum PropertyDiff<'e> {
    Added {
        path: PropertyPath<'e>,
        added: Cow<'e, Property>,
    },
    Removed {
        path: PropertyPath<'e>,
        removed: Cow<'e, Property>,
    },
    Changed {
        path: PropertyPath<'e>,
        old: Cow<'e, Property>,
        new: Cow<'e, Property>,
    },
}

impl PropertyDiff<'_> {
    #[must_use]
    pub fn into_owned(self) -> PropertyDiff<'static> {
        match self {
            Self::Added { path, added } => PropertyDiff::Added {
                path: path.into_owned(),
                added: Cow::Owned(added.into_owned()),
            },
            Self::Removed { path, removed } => PropertyDiff::Removed {
                path: path.into_owned(),
                removed: Cow::Owned(removed.into_owned()),
            },
            Self::Changed { path, old, new } => PropertyDiff::Changed {
                path: path.into_owned(),
                old: Cow::Owned(old.into_owned()),
                new: Cow::Owned(new.into_owned()),
            },
        }
    }
}

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
