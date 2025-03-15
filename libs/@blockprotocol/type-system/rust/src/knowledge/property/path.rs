//! Navigation and addressing of hierarchical property structures.
//!
//! This module provides types for addressing and traversing nested property structures,
//! enabling operations like property access, modification, and diffing.

use alloc::borrow::Cow;

use serde::{Deserialize, Serialize};
#[cfg(feature = "utoipa")]
use utoipa::{ToSchema, openapi};

use crate::ontology::BaseUrl;

/// An element in a property path that identifies a specific property location.
///
/// [`PropertyPathElement`] represents a single step in navigating a property hierarchy,
/// addressing either:
/// - A specific property by its type URL (for object properties)
/// - A specific index (for array properties)
///
/// These elements can be chained together to form a [`PropertyPath`] that addresses
/// deeply nested properties within the property hierarchy.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(untagged)]
pub enum PropertyPathElement<'k> {
    /// A property key that addresses a specific field in an object property.
    ///
    /// The key is a [`BaseUrl`] that corresponds to a property type URL.
    Property(Cow<'k, BaseUrl>),

    /// An array index that addresses a specific element in an array property.
    Index(usize),
}

impl From<usize> for PropertyPathElement<'_> {
    fn from(index: usize) -> Self {
        PropertyPathElement::Index(index)
    }
}

impl From<BaseUrl> for PropertyPathElement<'_> {
    fn from(key: BaseUrl) -> Self {
        PropertyPathElement::Property(Cow::Owned(key))
    }
}

impl<'k> From<&'k BaseUrl> for PropertyPathElement<'k> {
    fn from(key: &'k BaseUrl) -> Self {
        PropertyPathElement::Property(Cow::Borrowed(key))
    }
}

impl PropertyPathElement<'_> {
    #[must_use]
    pub fn into_owned(self) -> PropertyPathElement<'static> {
        match self {
            PropertyPathElement::Property(key) => {
                PropertyPathElement::Property(Cow::Owned(key.into_owned()))
            }
            PropertyPathElement::Index(index) => PropertyPathElement::Index(index),
        }
    }
}

/// A sequence of path elements that identifies a specific property within a nested hierarchy.
///
/// [`PropertyPath`] combines multiple [`PropertyPathElement`]s to create a navigation path
/// through the property hierarchy. This allows addressing and manipulating deeply nested
/// properties within complex entity structures.
///
/// Paths are used throughout the system for operations like:
/// - Accessing specific properties within an entity
/// - Applying targeted updates to nested properties
/// - Identifying property changes in diffing operations
/// - Defining property validation constraints
///
/// A path can be empty (representing the root property) or contain any number of elements
/// representing navigation through objects and arrays.
#[derive(Debug, Default, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(transparent)]
pub struct PropertyPath<'k> {
    /// The sequence of path elements that make up this property path.
    elements: Vec<PropertyPathElement<'k>>,
}

impl<'k> AsRef<[PropertyPathElement<'k>]> for PropertyPath<'k> {
    fn as_ref(&self) -> &[PropertyPathElement<'k>] {
        &self.elements
    }
}

impl<'k> PropertyPath<'k> {
    pub fn push(&mut self, element: impl Into<PropertyPathElement<'k>>) {
        self.elements.push(element.into());
    }

    pub fn pop(&mut self) -> Option<PropertyPathElement<'k>> {
        self.elements.pop()
    }

    #[must_use]
    pub const fn len(&self) -> usize {
        self.elements.len()
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.elements.is_empty()
    }

    pub fn iter(&'k self) -> impl Iterator<Item = PropertyPathElement<'k>> {
        <&Self as IntoIterator>::into_iter(self)
    }

    #[must_use]
    pub fn starts_with(&self, other: &Self) -> bool {
        self.elements.starts_with(&other.elements)
    }

    pub fn into_owned(self) -> PropertyPath<'static> {
        PropertyPath {
            elements: self
                .elements
                .into_iter()
                .map(PropertyPathElement::into_owned)
                .collect(),
        }
    }
}

impl<'k> FromIterator<PropertyPathElement<'k>> for PropertyPath<'k> {
    fn from_iter<T: IntoIterator<Item = PropertyPathElement<'k>>>(iter: T) -> Self {
        Self {
            elements: iter.into_iter().collect(),
        }
    }
}

impl<'k> IntoIterator for PropertyPath<'k> {
    type IntoIter = alloc::vec::IntoIter<Self::Item>;
    type Item = PropertyPathElement<'k>;

    fn into_iter(self) -> Self::IntoIter {
        self.elements.into_iter()
    }
}

impl<'k> IntoIterator for &'k PropertyPath<'k> {
    type Item = PropertyPathElement<'k>;

    type IntoIter = impl ExactSizeIterator<Item = Self::Item>;

    fn into_iter(self) -> Self::IntoIter {
        self.elements.iter().map(|element| match element {
            PropertyPathElement::Property(key) => PropertyPathElement::Property(Cow::Borrowed(key)),
            PropertyPathElement::Index(index) => PropertyPathElement::Index(*index),
        })
    }
}

#[cfg(feature = "utoipa")]
impl ToSchema<'_> for PropertyPath<'_> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "PropertyPath",
            openapi::Ref::from_schema_name("PropertyPathElement")
                .to_array_builder()
                .into(),
        )
    }
}
