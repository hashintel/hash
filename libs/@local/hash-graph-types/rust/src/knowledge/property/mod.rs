pub mod visitor;

pub use self::{
    array::PropertyWithMetadataArray,
    diff::PropertyDiff,
    metadata::{
        ArrayMetadata, ObjectMetadata, PropertyMetadata, PropertyMetadataObject,
        PropertyProvenance, PropertyWithMetadataValue, ValueMetadata,
    },
    object::{PropertyObject, PropertyWithMetadataObject},
    patch::{PatchError, PropertyPatchOperation},
    path::{PropertyPath, PropertyPathElement},
};

mod array;
mod diff;
mod metadata;
mod object;
mod patch;
mod path;

use alloc::borrow::Cow;
use core::{cmp::Ordering, fmt, iter, mem};
use std::{collections::HashMap, io};

use error_stack::{Report, ResultExt};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use type_system::{
    schema::JsonSchemaValueType,
    url::{BaseUrl, VersionedUrl},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged)]
pub enum Property {
    Array(Vec<Self>),
    Object(PropertyObject),
    Value(serde_json::Value),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged, deny_unknown_fields)]
pub enum PropertyWithMetadata {
    Array(PropertyWithMetadataArray),
    Object(PropertyWithMetadataObject),
    Value(PropertyWithMetadataValue),
}

#[derive(Debug, thiserror::Error)]
pub enum PropertyPathError {
    #[error("Property path is empty")]
    EmptyPath,
    #[error("Property path index `{index}` is out of bounds, length is `{len}`")]
    IndexOutOfBounds { index: usize, len: usize },
    #[error("Property path key `{key}` does not exist")]
    InvalidKey { key: BaseUrl },
    #[error("Expected object but got array index `{index}`")]
    UnexpectedIndex { index: usize },
    #[error("Expected array but got object key `{key}`")]
    UnexpectedKey { key: BaseUrl },
    #[error("Tried to add value to existing value")]
    UnexpectedValue,
    #[error("Properties and metadata do not match")]
    PropertyMetadataMismatch,
}

impl PropertyWithMetadata {
    #[must_use]
    pub fn json_type(&self) -> JsonSchemaValueType {
        match self {
            Self::Array { .. } => JsonSchemaValueType::Array,
            Self::Object { .. } => JsonSchemaValueType::Object,
            Self::Value(property) => JsonSchemaValueType::from(&property.value),
        }
    }

    #[must_use]
    pub const fn data_type_id(&self) -> Option<&VersionedUrl> {
        if let Self::Value(property) = self {
            property.metadata.data_type_id.as_ref()
        } else {
            None
        }
    }

    /// Modify the properties and confidence values of the entity.
    ///
    /// # Errors
    ///
    /// Returns an error if the patch operation failed
    pub fn patch(
        &mut self,
        operations: impl IntoIterator<Item = PropertyPatchOperation>,
    ) -> Result<(), Report<PatchError>> {
        for operation in operations {
            match operation {
                PropertyPatchOperation::Add { path, property } => {
                    self.add(path, property).change_context(PatchError)?;
                }
                PropertyPatchOperation::Remove { path } => {
                    self.remove(&path).change_context(PatchError)?;
                }
                PropertyPatchOperation::Replace { path, property } => {
                    self.replace(&path, property).change_context(PatchError)?;
                }
            }
        }

        Ok(())
    }

    fn get_mut(
        &mut self,
        path: &[PropertyPathElement<'_>],
    ) -> Result<&mut Self, Report<PropertyPathError>> {
        let mut value = self;
        for path_element in path {
            match (value, path_element) {
                (Self::Array(array), PropertyPathElement::Index(index)) => {
                    let len = array.value.len();
                    value = array
                        .value
                        .get_mut(*index)
                        .ok_or(PropertyPathError::IndexOutOfBounds { index: *index, len })?;
                }
                (Self::Array(_), PropertyPathElement::Property(key)) => {
                    return Err(Report::new(PropertyPathError::UnexpectedKey {
                        key: key.clone().into_owned(),
                    }));
                }
                (Self::Object(object), PropertyPathElement::Property(key)) => {
                    value = object.value.get_mut(key.as_ref()).ok_or_else(|| {
                        PropertyPathError::InvalidKey {
                            key: key.clone().into_owned(),
                        }
                    })?;
                }
                (Self::Object(_), PropertyPathElement::Index(index)) => {
                    return Err(Report::new(PropertyPathError::UnexpectedIndex {
                        index: *index,
                    }));
                }
                (Self::Value(_), _) => {
                    return Err(Report::new(PropertyPathError::UnexpectedValue));
                }
            }
        }

        Ok(value)
    }

    /// Adds a new property to the object or array at the given path.
    ///
    /// # Errors
    ///
    /// - If the path is empty.
    /// - If the value cannot be added to the parent, e.g. when attempting to add an index to an
    ///   object or the index is out of bounds.
    /// - The path to the last element is not valid.
    pub fn add(
        &mut self,
        mut path: PropertyPath<'_>,
        value: Self,
    ) -> Result<(), Report<PropertyPathError>> {
        let Some(last) = path.pop() else {
            return Err(Report::new(PropertyPathError::EmptyPath));
        };

        let parent = self.get_mut(path.as_ref())?;
        match (parent, last) {
            (Self::Array(array), PropertyPathElement::Index(index)) => {
                if index <= array.value.len() {
                    array.value.insert(index, value);
                    Ok(())
                } else {
                    Err(Report::new(PropertyPathError::IndexOutOfBounds {
                        index,
                        len: array.value.len(),
                    }))
                }
            }
            (Self::Array(_), PropertyPathElement::Property(key)) => {
                Err(Report::new(PropertyPathError::UnexpectedKey {
                    key: key.clone().into_owned(),
                }))
            }
            (Self::Object(object), PropertyPathElement::Property(key)) => {
                object.value.insert(key.into_owned(), value);
                Ok(())
            }
            (Self::Object(_), PropertyPathElement::Index(index)) => {
                Err(Report::new(PropertyPathError::UnexpectedIndex { index }))
            }
            (Self::Value(_), _) => Err(Report::new(PropertyPathError::UnexpectedValue)),
        }
    }

    /// Replaces the property at the given path with the given value.
    ///
    /// # Errors
    ///
    /// - If the path does not point to a property.
    /// - If the value cannot be replaced in the parent, e.g. when attempting to replace an index in
    ///   an object or the index is out of bounds.
    pub fn replace(
        &mut self,
        path: &PropertyPath<'_>,
        value: Self,
    ) -> Result<Self, Report<PropertyPathError>> {
        Ok(mem::replace(self.get_mut(path.as_ref())?, value))
    }

    /// Removes the property at the given path.
    ///
    /// # Errors
    ///
    /// - If the path is empty.
    /// - If the value cannot be removed from the parent, e.g. when attempting to remove an index
    ///   from an object or the index is out of bounds.
    /// - The path to the last element is not valid.
    pub fn remove(&mut self, path: &PropertyPath<'_>) -> Result<(), Report<PropertyPathError>> {
        let [path @ .., last] = path.as_ref() else {
            return Err(Report::new(PropertyPathError::EmptyPath));
        };
        let parent = self.get_mut(path)?;
        match (parent, last) {
            (Self::Array(array), PropertyPathElement::Index(index)) => {
                if *index <= array.value.len() {
                    array.value.remove(*index);
                    Ok(())
                } else {
                    Err(Report::new(PropertyPathError::IndexOutOfBounds {
                        index: *index,
                        len: array.value.len(),
                    }))
                }
            }
            (Self::Array(_), PropertyPathElement::Property(key)) => {
                Err(Report::new(PropertyPathError::UnexpectedKey {
                    key: key.clone().into_owned(),
                }))
            }
            (Self::Object(object), PropertyPathElement::Property(key)) => {
                object.value.remove(key);
                Ok(())
            }
            (Self::Object { .. }, PropertyPathElement::Index(index)) => {
                Err(Report::new(PropertyPathError::UnexpectedIndex {
                    index: *index,
                }))
            }
            (Self::Value { .. }, _) => Err(Report::new(PropertyPathError::UnexpectedValue)),
        }
    }

    /// Creates a unified representation of the property and its metadata.
    ///
    /// # Errors
    ///
    /// - If the property and metadata types do not match.
    pub fn from_parts(
        property: Property,
        metadata: Option<PropertyMetadata>,
    ) -> Result<Self, Report<PropertyPathError>> {
        match (property, metadata) {
            (
                Property::Array(properties),
                Some(PropertyMetadata::Array {
                    value: metadata_elements,
                    metadata,
                }),
            ) => Ok(Self::Array(PropertyWithMetadataArray {
                value: metadata_elements
                    .into_iter()
                    .map(Some)
                    .chain(iter::repeat_with(|| None))
                    .zip(properties)
                    .map(|(metadata, property)| Self::from_parts(property, metadata))
                    .collect::<Result<_, _>>()?,
                metadata,
            })),
            (Property::Array(properties), None) => Ok(Self::Array(PropertyWithMetadataArray {
                value: properties
                    .into_iter()
                    .map(|property| Self::from_parts(property, None))
                    .collect::<Result<_, _>>()?,
                metadata: ArrayMetadata::default(),
            })),
            (
                Property::Object(properties),
                Some(PropertyMetadata::Object {
                    value: mut metadata_elements,
                    metadata,
                }),
            ) => Ok(Self::Object(PropertyWithMetadataObject {
                value: properties
                    .into_iter()
                    .map(|(key, property)| {
                        let metadata = metadata_elements.remove(&key);
                        Ok::<_, Report<PropertyPathError>>((
                            key,
                            Self::from_parts(property, metadata)?,
                        ))
                    })
                    .collect::<Result<_, _>>()?,
                metadata,
            })),
            (Property::Object(properties), None) => Ok(Self::Object(PropertyWithMetadataObject {
                value: properties
                    .into_iter()
                    .map(|(key, property)| {
                        Ok::<_, Report<PropertyPathError>>((key, Self::from_parts(property, None)?))
                    })
                    .collect::<Result<_, _>>()?,
                metadata: ObjectMetadata::default(),
            })),
            (Property::Value(value), Some(PropertyMetadata::Value { metadata })) => {
                Ok(Self::Value(PropertyWithMetadataValue { value, metadata }))
            }
            (Property::Value(value), None) => Ok(Self::Value(PropertyWithMetadataValue {
                value,
                metadata: ValueMetadata {
                    provenance: PropertyProvenance::default(),
                    confidence: None,
                    data_type_id: None,
                },
            })),
            _ => Err(Report::new(PropertyPathError::PropertyMetadataMismatch)),
        }
    }

    pub fn into_parts(self) -> (Property, PropertyMetadata) {
        match self {
            Self::Array(array) => {
                let (properties, metadata_elements) =
                    array.value.into_iter().map(Self::into_parts).unzip();
                (
                    Property::Array(properties),
                    PropertyMetadata::Array {
                        value: metadata_elements,
                        metadata: array.metadata,
                    },
                )
            }
            Self::Object(object) => {
                let (properties, metadata_properties) = object
                    .value
                    .into_iter()
                    .map(|(base_url, property_with_metadata)| {
                        let (property, metadata) = property_with_metadata.into_parts();
                        ((base_url.clone(), property), (base_url, metadata))
                    })
                    .unzip();
                (
                    Property::Object(PropertyObject::new(properties)),
                    PropertyMetadata::Object {
                        value: metadata_properties,
                        metadata: object.metadata,
                    },
                )
            }
            Self::Value(property) => (
                Property::Value(property.value),
                PropertyMetadata::Value {
                    metadata: property.metadata,
                },
            ),
        }
    }
}

impl Property {
    pub gen fn properties(&self) -> (PropertyPath<'_>, &JsonValue) {
        let mut elements = PropertyPath::default();
        match self {
            Self::Array(array) => {
                for (index, property) in array.iter().enumerate() {
                    elements.push(index);
                    for yielded in Box::new(property.properties()) {
                        yield yielded;
                    }
                    elements.pop();
                }
            }
            Self::Object(object) => {
                for (key, property) in object.properties() {
                    elements.push(key);
                    for yielded in Box::new(property.properties()) {
                        yield yielded;
                    }
                    elements.pop();
                }
            }
            Self::Value(property) => yield (elements.clone(), property),
        }
    }

    #[must_use]
    pub fn get<'a>(
        &self,
        path: impl IntoIterator<Item = PropertyPathElement<'a>>,
    ) -> Option<&Self> {
        let mut value = self;
        for element in path {
            match element {
                PropertyPathElement::Property(key) => {
                    value = match value {
                        Self::Object(object) => object.properties().get(&key)?,
                        _ => return None,
                    };
                }
                PropertyPathElement::Index(index) => {
                    value = match value {
                        Self::Array(array) => array.get(index)?,
                        _ => return None,
                    };
                }
            }
        }
        Some(value)
    }

    gen fn diff_array<'a>(
        lhs: &'a [Self],
        rhs: &'a [Self],
        path: &mut PropertyPath<'a>,
    ) -> PropertyDiff<'a> {
        for (index, (lhs, rhs)) in lhs.iter().zip(rhs).enumerate() {
            path.push(index);
            for yielded in Box::new(lhs.diff(rhs, path)) {
                yield yielded;
            }
            path.pop();
        }

        match lhs.len().cmp(&rhs.len()) {
            Ordering::Less => {
                for (index, property) in rhs.iter().enumerate().skip(lhs.len()) {
                    path.push(index);
                    yield PropertyDiff::Added {
                        path: path.clone(),
                        added: Cow::Borrowed(property),
                    };
                    path.pop();
                }
            }
            Ordering::Equal => {}
            Ordering::Greater => {
                for (index, property) in lhs.iter().enumerate().skip(rhs.len()) {
                    path.push(index);
                    yield PropertyDiff::Removed {
                        path: path.clone(),
                        removed: Cow::Borrowed(property),
                    };
                    path.pop();
                }
            }
        }
    }

    gen fn diff_object<'a>(
        lhs: &'a HashMap<BaseUrl, Self>,
        rhs: &'a HashMap<BaseUrl, Self>,
        path: &mut PropertyPath<'a>,
    ) -> PropertyDiff<'a> {
        for (key, property) in lhs {
            path.push(key);
            let other_property = rhs.get(key);
            if let Some(other_property) = other_property {
                for yielded in Box::new(property.diff(other_property, path)) {
                    yield yielded;
                }
            } else {
                yield PropertyDiff::Removed {
                    path: path.clone(),
                    removed: Cow::Borrowed(property),
                };
            }
            path.pop();
        }
        for (key, property) in rhs {
            if !lhs.contains_key(key) {
                path.push(key);
                yield PropertyDiff::Added {
                    path: path.clone(),
                    added: Cow::Borrowed(property),
                };
                path.pop();
            }
        }
    }

    pub gen fn diff<'a>(
        &'a self,
        other: &'a Self,
        path: &mut PropertyPath<'a>,
    ) -> PropertyDiff<'a> {
        let mut changed = false;
        match (self, other) {
            (Self::Array(lhs), Self::Array(rhs)) => {
                for yielded in Self::diff_array(lhs, rhs, path) {
                    changed = true;
                    yield yielded;
                }
            }
            (Self::Object(lhs), Self::Object(rhs)) => {
                for yielded in Self::diff_object(lhs.properties(), rhs.properties(), path) {
                    changed = true;
                    yield yielded;
                }
            }
            (lhs, rhs) => {
                changed = lhs != rhs;
            }
        }

        if changed {
            yield PropertyDiff::Changed {
                path: path.clone(),
                old: Cow::Borrowed(self),
                new: Cow::Borrowed(other),
            };
        }
    }
}

impl fmt::Display for Property {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Inspired by `serde_json`
        struct WriterFormatter<'a, 'b: 'a>(&'a mut fmt::Formatter<'b>);

        impl io::Write for WriterFormatter<'_, '_> {
            fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
                self.0
                    .write_str(&String::from_utf8_lossy(buf))
                    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
                Ok(buf.len())
            }

            fn flush(&mut self) -> io::Result<()> {
                Ok(())
            }
        }

        if fmt.alternate() {
            serde_json::to_writer_pretty(WriterFormatter(fmt), &self).map_err(|_ignored| fmt::Error)
        } else {
            serde_json::to_writer(WriterFormatter(fmt), &self).map_err(|_ignored| fmt::Error)
        }
    }
}

impl PartialEq<JsonValue> for Property {
    fn eq(&self, other: &JsonValue) -> bool {
        match self {
            Self::Array(lhs) => {
                let JsonValue::Array(rhs) = other else {
                    return false;
                };

                lhs == rhs
            }
            Self::Object(lhs) => {
                let JsonValue::Object(rhs) = other else {
                    return false;
                };

                lhs.len() == rhs.len()
                    && lhs.iter().all(|(key, value)| {
                        rhs.get(key.as_str())
                            .map_or(false, |other_value| value == other_value)
                    })
            }
            Self::Value(lhs) => lhs == other,
        }
    }
}
