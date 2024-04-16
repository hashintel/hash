#[cfg(feature = "postgres")]
use std::error::Error;
use std::{borrow::Cow, iter::once};

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, ToSql, Type};
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};
use type_system::url::{BaseUrl, ParseBaseUrlError};
#[cfg(feature = "utoipa")]
use utoipa::{openapi, ToSchema};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
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

#[derive(Debug, Default, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PropertyPath<'k> {
    elements: Vec<PropertyPathElement<'k>>,
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

    pub fn iter(&'k self) -> impl Iterator<Item = &'k PropertyPathElement<'k>> {
        <&Self as IntoIterator>::into_iter(self)
    }

    #[must_use]
    pub fn starts_with(&self, other: &Self) -> bool {
        self.elements.starts_with(&other.elements)
    }

    /// Creates a new `PropertyPath` from a JSON Pointer.
    ///
    /// # Errors
    ///
    /// - `ParseBaseUrlError` if the JSON Pointer contains an invalid [`BaseUrl`].
    pub fn from_json_pointer(json_patch: &str) -> Result<Self, ParseBaseUrlError> {
        Ok(Self {
            elements: json_patch
                .split('/')
                .skip(1)
                .map(|element| {
                    if let Ok(index) = element.parse() {
                        Ok(PropertyPathElement::Index(index))
                    } else {
                        Ok(PropertyPathElement::Property(Cow::Owned(BaseUrl::new(
                            element.replace("~1", "/").replace("~0", "~"),
                        )?)))
                    }
                })
                .collect::<Result<Vec<_>, ParseBaseUrlError>>()?,
        })
    }

    #[must_use]
    pub fn to_json_pointer(&self) -> String {
        once(String::new())
            .chain(self.elements.iter().map(|element| match element {
                PropertyPathElement::Property(key) => {
                    key.as_str().replace('~', "~0").replace('/', "~1")
                }
                PropertyPathElement::Index(index) => index.to_string(),
            }))
            .collect::<Vec<_>>()
            .join("/")
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
    type IntoIter = std::vec::IntoIter<Self::Item>;
    type Item = PropertyPathElement<'k>;

    fn into_iter(self) -> Self::IntoIter {
        self.elements.into_iter()
    }
}

impl<'k> IntoIterator for &'k PropertyPath<'k> {
    type IntoIter = std::slice::Iter<'k, PropertyPathElement<'k>>;
    type Item = &'k PropertyPathElement<'k>;

    fn into_iter(self) -> Self::IntoIter {
        self.elements.iter()
    }
}

impl Serialize for PropertyPath<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.to_json_pointer().serialize(serializer)
    }
}

impl<'de, 'a: 'de> Deserialize<'de> for PropertyPath<'a> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        Self::from_json_pointer(&String::deserialize(deserializer)?).map_err(de::Error::custom)
    }
}

#[cfg(feature = "utoipa")]
impl ToSchema<'_> for PropertyPath<'_> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "PropertyPath",
            openapi::Schema::Object(openapi::schema::Object::with_type(
                openapi::SchemaType::String,
            ))
            .into(),
        )
    }
}

#[cfg(feature = "postgres")]
impl ToSql for PropertyPath<'_> {
    postgres_types::to_sql_checked!();

    fn to_sql(
        &self,
        ty: &Type,
        out: &mut BytesMut,
    ) -> Result<IsNull, Box<dyn Error + Sync + Send>> {
        self.to_json_pointer().to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool {
        <&str as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl<'k> FromSql<'k> for PropertyPath<'k> {
    fn from_sql(ty: &Type, raw: &'k [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self::from_json_pointer(<&str as FromSql>::from_sql(
            ty, raw,
        )?)?)
    }

    fn accepts(ty: &Type) -> bool {
        <&str as FromSql>::accepts(ty)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_json_pointer(
        path: impl IntoIterator<Item = PropertyPathElement<'static>>,
        pointer: &str,
    ) -> PropertyPath<'static> {
        let path = path.into_iter().collect::<PropertyPath>();
        assert_eq!(path.to_json_pointer(), pointer);
        assert_eq!(
            PropertyPath::from_json_pointer(pointer).expect("Invalid JSON Pointer"),
            path
        );
        path
    }

    #[test]
    fn empty() {
        let path = test_json_pointer([], "");
        assert!(path.is_empty());
    }

    #[test]
    fn index() {
        let path = test_json_pointer([PropertyPathElement::Index(0)], "/0");
        assert_eq!(path.len(), 1);
    }

    #[test]
    fn property() {
        let path = test_json_pointer(
            [PropertyPathElement::Property(Cow::Owned(
                BaseUrl::new("http://example.com/".to_owned()).expect("Invalid BaseUrl"),
            ))],
            "/http:~1~1example.com~1",
        );
        assert_eq!(path.len(), 1);
    }

    #[test]
    fn mixed() {
        let path = test_json_pointer(
            [
                PropertyPathElement::Property(Cow::Owned(
                    BaseUrl::new("http://example.com/".to_owned()).expect("Invalid BaseUrl"),
                )),
                PropertyPathElement::Index(0),
                PropertyPathElement::Property(Cow::Owned(
                    BaseUrl::new("http://example.org/".to_owned()).expect("Invalid BaseUrl"),
                )),
            ],
            "/http:~1~1example.com~1/0/http:~1~1example.org~1",
        );
        assert_eq!(path.len(), 3);
    }
}
