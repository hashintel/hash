#[cfg(feature = "postgres")]
use std::error::Error;
use std::{
    borrow::Cow,
    collections::{hash_map, HashMap},
};

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, Json, ToSql, Type};
use serde::{ser::SerializeSeq, Deserialize, Serialize};
#[cfg(feature = "utoipa")]
use utoipa::{
    openapi::{self, ToArray},
    ToSchema,
};

use crate::knowledge::{
    property::provenance::PropertyProvenance, Confidence, PropertyPatchOperation, PropertyPath,
};

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub struct PropertyMetadata {
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<Confidence>,
    #[serde(default, skip_serializing_if = "PropertyProvenance::is_empty")]
    pub provenance: PropertyProvenance,
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for PropertyMetadata {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for PropertyMetadata {
    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        Json(self).to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as ToSql>::accepts(ty)
    }
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct PropertyMetadataMap<'p> {
    values: HashMap<PropertyPath<'p>, PropertyMetadata>,
}

#[cfg(feature = "utoipa")]
impl ToSchema<'_> for PropertyMetadataMap<'_> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "PropertyMetadataMap",
            PropertyMetadataMapRepr::schema().1.to_array().into(),
        )
    }
}

impl<'p> Serialize for PropertyMetadataMap<'p> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut seq = serializer.serialize_seq(Some(self.values.len()))?;
        for (path, metadata) in &self.values {
            seq.serialize_element(&PropertyMetadataMapRepr {
                path: Cow::Borrowed(path),
                metadata: Cow::Borrowed(metadata),
            })?;
        }
        seq.end()
    }
}

impl<'de> Deserialize<'de> for PropertyMetadataMap<'_> {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(Self {
            values: Vec::<PropertyMetadataMapRepr>::deserialize(deserializer)?
                .into_iter()
                .map(|value| (value.path.into_owned(), value.metadata.into_owned()))
                .collect(),
        })
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
struct PropertyMetadataMapRepr<'p> {
    path: Cow<'p, PropertyPath<'p>>,
    metadata: Cow<'p, PropertyMetadata>,
}

impl<'p> PropertyMetadataMap<'p> {
    #[must_use]
    pub const fn new(values: HashMap<PropertyPath<'p>, PropertyMetadata>) -> Self {
        Self { values }
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.values.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn iter(&self) -> impl Iterator<Item = (&PropertyPath<'p>, &PropertyMetadata)> {
        self.values.iter()
    }

    fn insert(
        &mut self,
        path: &PropertyPath<'p>,
        confidence: Option<Confidence>,
        provenance: &PropertyProvenance,
    ) {
        if confidence.is_some() || !provenance.is_empty() {
            self.values.insert(
                path.clone(),
                PropertyMetadata {
                    confidence,
                    provenance: provenance.clone(),
                },
            );
        }
    }

    pub fn patch(&mut self, operations: &[PropertyPatchOperation]) {
        for operation in operations {
            match operation {
                PropertyPatchOperation::Remove { path } => {
                    self.values.retain(|key, _| !key.starts_with(path));
                }
                PropertyPatchOperation::Add {
                    path,
                    value: _,
                    confidence,
                    provenance,
                }
                | PropertyPatchOperation::Copy {
                    from: _,
                    path,
                    confidence,
                    provenance,
                }
                | PropertyPatchOperation::Replace {
                    path,
                    value: _,
                    confidence,
                    provenance,
                } => {
                    self.values.retain(|key, _| !key.starts_with(path));
                    self.insert(path, *confidence, provenance);
                }
                PropertyPatchOperation::Move {
                    from,
                    path,
                    confidence,
                    provenance,
                } => {
                    self.values
                        .retain(|key, _| !key.starts_with(from) && !key.starts_with(path));
                    self.insert(path, *confidence, provenance);
                }
                PropertyPatchOperation::Test { path: _, value: _ } => {}
            }
        }
    }
}

impl<'p> IntoIterator for PropertyMetadataMap<'p> {
    type IntoIter = hash_map::IntoIter<PropertyPath<'p>, PropertyMetadata>;
    type Item = (PropertyPath<'p>, PropertyMetadata);

    fn into_iter(self) -> Self::IntoIter {
        self.values.into_iter()
    }
}

impl<'p, 'a> IntoIterator for &'a PropertyMetadataMap<'p> {
    type IntoIter = hash_map::Iter<'a, PropertyPath<'p>, PropertyMetadata>;
    type Item = (&'a PropertyPath<'p>, &'a PropertyMetadata);

    fn into_iter(self) -> Self::IntoIter {
        self.values.iter()
    }
}

impl<'p> FromIterator<(PropertyPath<'p>, PropertyMetadata)> for PropertyMetadataMap<'p> {
    fn from_iter<T: IntoIterator<Item = (PropertyPath<'p>, PropertyMetadata)>>(iter: T) -> Self {
        Self {
            values: iter.into_iter().collect(),
        }
    }
}
