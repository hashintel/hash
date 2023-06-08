use alloc::{borrow::Cow, vec, vec::Vec};
use core::ops::Deref;

use serde_json::Value;

#[derive(Debug, serde::Serialize)]
#[serde(untagged)]
enum Id<'a> {
    Static(&'static [&'static str]),
    Vector(Vec<&'a str>),
}

impl<'a> Deref for Id<'a> {
    type Target = [&'a str];

    fn deref(&self) -> &Self::Target {
        match self {
            Id::Static(slice) => slice,
            Id::Vector(slice) => slice.as_slice(),
        }
    }
}

impl PartialEq<Self> for Id<'_> {
    fn eq(&self, other: &Self) -> bool {
        **self == **other
    }
}

impl Eq for Id<'_> {}

#[derive(Debug, serde::Serialize, Eq, PartialEq)]
pub struct BareError<'a> {
    namespace: &'a str,
    id: Id<'a>,
    properties: Cow<'a, Value>,
}

impl BareError<'static> {
    #[must_use]
    pub const fn new_static(
        namespace: &'static str,
        id: &'static [&'static str],
        properties: Value,
    ) -> Self {
        Self {
            namespace,
            id: Id::Static(id),
            properties: Cow::Owned(properties),
        }
    }
}

impl<'a> BareError<'a> {
    fn from_value(value: &'a Value) -> Option<Self> {
        let object = value.as_object()?;
        let namespace = object.get("namespace")?.as_str()?;

        let id = object
            .get("id")?
            .as_array()?
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>();

        let properties = object.get("properties")?;

        _ = object.get("message")?;

        // ensure that there are exactly 4 properties
        if object.len() != 4 {
            return None;
        }

        Some(Self {
            namespace,
            id: Id::Vector(id),
            properties: Cow::Borrowed(properties),
        })
    }
}

#[derive(Debug, serde::Serialize, Eq, PartialEq)]
pub struct ErrorVec<'a>(Vec<BareError<'a>>);

impl<'a> ErrorVec<'a> {
    pub fn new<T: Into<BareError<'a>>>(errors: impl IntoIterator<Item = T>) -> Self {
        Self(errors.into_iter().map(Into::into).collect())
    }

    pub(crate) fn from_value(value: &'a Value) -> Option<Self> {
        let array = value.as_array()?;

        let mut errors = vec![];
        for value in array {
            errors.push(BareError::from_value(value)?);
        }

        Some(Self(errors))
    }
}

#[macro_export]
macro_rules! error {
    ([$($tt:tt),*]) => {
        deer_desert::error::ErrorVec::new([$(error!(@internal $tt)),*])
    };
    {
        ns: $namespace:literal,
        id: [$($id:literal),*],
        properties: $($properties:tt)*
    } => {
        error!([{ns: $namespace, id: [$($id),*], properties: $($properties)*}])
    };
    (@internal {
        ns: $namespace:literal,
        id: [$($id:literal),*],
        properties: $($properties:tt)*
    }) => {
        deer_desert::error::BareError::new_static($namespace, &[$($id),*], json!($($properties)*))
    }
}
