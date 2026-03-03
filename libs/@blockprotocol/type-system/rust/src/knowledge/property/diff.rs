//! Differential comparison of properties.
//!
//! This module provides functionality for computing and representing differences between
//! property structures, allowing efficient detection and analysis of property changes.

use alloc::borrow::Cow;

use serde::Serialize;

use crate::knowledge::property::{Property, PropertyPath};

/// A representation of a difference between two property structures.
///
/// [`PropertyDiff`] captures the nature of a change between two property values,
/// including the path where the change occurred and the relevant property values
/// (added, removed, or changed). This structure enables precise tracking of
/// property modifications throughout the system.
///
/// When comparing two property hierarchies, multiple diffs may be generated to
/// represent all changes, with each diff capturing a specific modification at a
/// particular path.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", tag = "op")]
pub enum PropertyDiff<'e> {
    /// A property was added at the specified path.
    ///
    /// This variant indicates that a property that didn't exist in the original
    /// structure was added in the new one.
    Added {
        /// The path where the property was added.
        path: PropertyPath<'e>,

        /// The property value that was added.
        added: Cow<'e, Property>,
    },

    /// A property was removed from the specified path.
    ///
    /// This variant indicates that a property that existed in the original
    /// structure was removed in the new one.
    Removed {
        /// The path where the property was removed.
        path: PropertyPath<'e>,

        /// The property value that was removed.
        removed: Cow<'e, Property>,
    },

    /// A property at the specified path changed value.
    ///
    /// This variant indicates that a property existed in both structures
    /// but had different values.
    Changed {
        /// The path where the property changed.
        path: PropertyPath<'e>,

        /// The original property value.
        old: Cow<'e, Property>,

        /// The new property value.
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
