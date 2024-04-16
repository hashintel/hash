use std::collections::HashMap;
#[cfg(feature = "postgres")]
use std::error::Error;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
use error_stack::{Report, ResultExt};
use json_patch::{
    AddOperation, CopyOperation, MoveOperation, PatchOperation, RemoveOperation, ReplaceOperation,
    TestOperation,
};
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, ToSql, Type};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use type_system::url::BaseUrl;
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;

use crate::knowledge::{
    property::{PatchError, Property},
    PropertyDiff, PropertyPatchOperation, PropertyPath, PropertyPathElement,
};

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
pub struct PropertyObject(HashMap<BaseUrl, Property>);

impl PropertyObject {
    #[must_use]
    pub const fn new(properties: HashMap<BaseUrl, Property>) -> Self {
        Self(properties)
    }

    #[must_use]
    pub fn empty() -> Self {
        Self::default()
    }

    #[must_use]
    pub const fn properties(&self) -> &HashMap<BaseUrl, Property> {
        &self.0
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.0.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = (&BaseUrl, &Property)> {
        self.0.iter()
    }

    pub fn diff<'a>(
        &'a self,
        other: &'a Self,
        path: &mut PropertyPath<'a>,
    ) -> impl Iterator<Item = PropertyDiff<'_>> {
        Property::diff_object(self.properties(), other.properties(), path)
    }

    #[must_use]
    pub fn path_exists(&self, path: &PropertyPath<'_>) -> bool {
        let mut path_iter = path.iter();
        let Some(first) = path_iter.next() else {
            return true;
        };

        let first_key = match first {
            PropertyPathElement::Property(key) => key,
            PropertyPathElement::Index(_) => return false,
        };
        self.0
            .get(first_key)
            .map_or(false, |property| property.get(path_iter).is_some())
    }

    /// Applies the given patch operations to the object.
    ///
    /// # Errors
    ///
    /// Returns an error if the patch operation failed
    pub fn patch(
        &mut self,
        operations: &[PropertyPatchOperation],
    ) -> Result<(), Report<PatchError>> {
        let patches = operations
            .iter()
            .map(|operation| {
                Ok(match operation {
                    PropertyPatchOperation::Add {
                        path,
                        value,
                        confidence: _,
                    } => PatchOperation::Add(AddOperation {
                        path: path.to_json_pointer(),
                        value: serde_json::to_value(value).change_context(PatchError)?,
                    }),
                    PropertyPatchOperation::Remove { path } => {
                        PatchOperation::Remove(RemoveOperation {
                            path: path.to_json_pointer(),
                        })
                    }
                    PropertyPatchOperation::Replace {
                        path,
                        value,
                        confidence: _,
                    } => PatchOperation::Replace(ReplaceOperation {
                        path: path.to_json_pointer(),
                        value: serde_json::to_value(value).change_context(PatchError)?,
                    }),
                    PropertyPatchOperation::Move {
                        from,
                        path,
                        confidence: _,
                    } => PatchOperation::Move(MoveOperation {
                        from: from.to_json_pointer(),
                        path: path.to_json_pointer(),
                    }),
                    PropertyPatchOperation::Copy {
                        from,
                        path,
                        confidence: _,
                    } => PatchOperation::Copy(CopyOperation {
                        from: from.to_json_pointer(),
                        path: path.to_json_pointer(),
                    }),
                    PropertyPatchOperation::Test { path, value } => {
                        PatchOperation::Test(TestOperation {
                            path: path.to_json_pointer(),
                            value: serde_json::to_value(value).change_context(PatchError)?,
                        })
                    }
                })
            })
            .collect::<Result<Vec<_>, Report<PatchError>>>()?;

        // TODO: Implement more efficient patching without serialization
        let mut this = serde_json::to_value(&self).change_context(PatchError)?;
        json_patch::patch(&mut this, &patches).change_context(PatchError)?;
        *self = serde_json::from_value(this).change_context(PatchError)?;
        Ok(())
    }
}

impl PartialEq<JsonValue> for PropertyObject {
    fn eq(&self, other: &JsonValue) -> bool {
        let JsonValue::Object(other_object) = other else {
            return false;
        };

        self.0.len() == other_object.len()
            && self.0.iter().all(|(key, value)| {
                other_object
                    .get(key.as_str())
                    .map_or(false, |other_value| value == other_value)
            })
    }
}

#[cfg(feature = "postgres")]
impl ToSql for PropertyObject {
    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        postgres_types::Json(&self).to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool
    where
        Self: Sized,
    {
        <postgres_types::Json<Self> as ToSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for PropertyObject {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        let json = postgres_types::Json::from_sql(ty, raw)?;
        Ok(json.0)
    }

    fn accepts(ty: &Type) -> bool
    where
        Self: Sized,
    {
        <postgres_types::Json<Self> as ToSql>::accepts(ty)
    }
}
