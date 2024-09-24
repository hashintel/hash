use alloc::borrow::Cow;

use serde::{Deserialize, Serialize};
use type_system::url::BaseUrl;
#[cfg(feature = "utoipa")]
use utoipa::{ToSchema, openapi};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged)]
pub enum PropertyPathElement<'k> {
    Property(Cow<'k, BaseUrl>),
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

#[derive(Debug, Default, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct PropertyPath<'k> {
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
    pub fn len(&self) -> usize {
        self.elements.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
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
