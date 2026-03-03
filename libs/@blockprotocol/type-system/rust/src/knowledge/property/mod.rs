pub mod metadata;

mod array;
mod diff;
mod object;
mod patch;
mod path;
mod value;

use alloc::borrow::Cow;
use core::{cmp::Ordering, fmt, iter, mem};
use std::{collections::HashMap, io};

use error_stack::{Report, ResultExt as _};

use self::metadata::{
    ArrayMetadata, ObjectMetadata, PropertyArrayMetadata, PropertyMetadata, PropertyObjectMetadata,
    PropertyValueMetadata,
};
pub use self::{
    array::PropertyArrayWithMetadata,
    diff::PropertyDiff,
    object::{PropertyObject, PropertyObjectWithMetadata},
    patch::{PatchError, PropertyPatchOperation},
    path::{PropertyPath, PropertyPathElement},
    value::PropertyValueWithMetadata,
};
use super::{
    PropertyValue,
    value::{ValueMetadata, metadata::ValueProvenance},
};
use crate::ontology::{
    BaseUrl, VersionedUrl, json_schema::JsonSchemaValueType,
    property_type::schema::PropertyValueType,
};

/// Structured data that can be associated with an entity, conforming to property types defined in
/// the ontology.
///
/// The [`Property`] enum represents the hierarchical structure of data within an entity.
/// Properties are instances of [`PropertyType`]s defined in the ontology. The relationship
/// is similar to objects and classes in object-oriented programming:
/// - [`PropertyType`]s define the schema, structure, and constraints that properties must follow
/// - [`Property`] instances contain actual data conforming to those schemas
///
/// Properties can be:
///
/// - Arrays of other properties
/// - Objects (maps) with property type URLs as keys and nested properties as values
/// - Primitive values like strings, numbers, booleans, etc.
///
/// Each property in an entity:
/// - Corresponds to a specific [`PropertyType`] in the ontology
/// - May have associated metadata tracking provenance, confidence, and other contextual information
/// - Must satisfy the validation rules defined in its property type
/// - Can be addressed using a [`PropertyPath`] for targeted access and modification
///
/// Properties form the backbone of entity data representation in the system, allowing
/// for flexible and structured knowledge organization that aligns with the ontology.
///
/// [`PropertyType`]: crate::ontology::property_type::PropertyType
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged)]
pub enum Property {
    /// An ordered collection of properties.
    ///
    /// Arrays can contain heterogeneous property types, though typically they
    /// contain properties of the same structure based on the entity type definition.
    Array(#[cfg_attr(target_arch = "wasm32", tsify(type = "Property[]"))] Vec<Self>),

    /// A mapping from property type URLs to properties.
    ///
    /// Object properties use [`BaseUrl`]s as keys, which correspond to property types
    /// defined in the ontology.
    Object(
        #[cfg_attr(target_arch = "wasm32", tsify(type = "{ [key: BaseUrl]: Property }"))]
        PropertyObject,
    ),

    /// A primitive value such as a string, number, boolean, etc.
    ///
    /// Values represent the atomic units of data in the property system.
    Value(PropertyValue),
}

/// Property data combined with its corresponding metadata.
///
/// [`PropertyWithMetadata`] pairs each property with its metadata, maintaining the same
/// hierarchical structure. This unified representation enables operations that need to
/// modify both properties and their metadata consistently, such as patching operations.
///
/// The structure mirrors the [`Property`] enum, with specialized types for arrays, objects,
/// and values that maintain metadata at each level of the hierarchy.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged)]
pub enum PropertyWithMetadata {
    /// An array of properties with associated metadata.
    ///
    /// Includes both element-level metadata for each array item and metadata for the array itself.
    Array(PropertyArrayWithMetadata),

    /// An object of properties with associated metadata.
    ///
    /// Includes both field-level metadata for each property and metadata for the object itself.
    Object(PropertyObjectWithMetadata),

    /// A primitive value with associated metadata.
    ///
    /// Contains metadata such as provenance, confidence, and data type information for the value.
    Value(PropertyValueWithMetadata),
}

impl PropertyWithMetadata {
    #[must_use]
    pub const fn property_value_type(&self) -> PropertyValueType {
        match self {
            Self::Array(_) => PropertyValueType::Array,
            Self::Object(_) => PropertyValueType::Object,
            Self::Value(_) => PropertyValueType::Value,
        }
    }
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
    /// Returns an error if the patch operation failed.
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

    /// Returns the property at the given path.
    ///
    /// # Errors
    ///
    /// - If the path does not point to a property.
    pub fn get_mut(
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
                Some(PropertyMetadata::Array(PropertyArrayMetadata {
                    value: metadata_elements,
                    metadata,
                })),
            ) => Ok(Self::Array(PropertyArrayWithMetadata {
                value: metadata_elements
                    .into_iter()
                    .map(Some)
                    .chain(iter::repeat_with(|| None))
                    .zip(properties)
                    .map(|(metadata, property)| Self::from_parts(property, metadata))
                    .collect::<Result<_, _>>()?,
                metadata,
            })),
            (Property::Array(properties), None) => Ok(Self::Array(PropertyArrayWithMetadata {
                value: properties
                    .into_iter()
                    .map(|property| Self::from_parts(property, None))
                    .collect::<Result<_, _>>()?,
                metadata: ArrayMetadata::default(),
            })),
            (
                Property::Object(properties),
                Some(PropertyMetadata::Object(PropertyObjectMetadata {
                    value: mut metadata_elements,
                    metadata,
                })),
            ) => Ok(Self::Object(PropertyObjectWithMetadata {
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
            (Property::Object(properties), None) => Ok(Self::Object(PropertyObjectWithMetadata {
                value: properties
                    .into_iter()
                    .map(|(key, property)| {
                        Ok::<_, Report<PropertyPathError>>((key, Self::from_parts(property, None)?))
                    })
                    .collect::<Result<_, _>>()?,
                metadata: ObjectMetadata::default(),
            })),
            (
                Property::Value(value),
                Some(PropertyMetadata::Value(PropertyValueMetadata { metadata })),
            ) => Ok(Self::Value(PropertyValueWithMetadata { value, metadata })),
            (Property::Value(value), None) => Ok(Self::Value(PropertyValueWithMetadata {
                value,
                metadata: ValueMetadata {
                    provenance: ValueProvenance::default(),
                    confidence: None,
                    data_type_id: None,
                    original_data_type_id: None,
                    canonical: HashMap::new(),
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
                    PropertyMetadata::Array(PropertyArrayMetadata {
                        value: metadata_elements,
                        metadata: array.metadata,
                    }),
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
                    PropertyMetadata::Object(PropertyObjectMetadata {
                        value: metadata_properties,
                        metadata: object.metadata,
                    }),
                )
            }
            Self::Value(property) => (
                Property::Value(property.value),
                PropertyMetadata::Value(PropertyValueMetadata {
                    metadata: property.metadata,
                }),
            ),
        }
    }
}

impl Property {
    // TODO: Replace with `gen fn`
    pub fn properties(&self) -> impl Iterator<Item = (PropertyPath<'_>, &PropertyValue)> {
        let mut vec = Vec::new();
        let mut elements = PropertyPath::default();
        match self {
            Self::Array(array) => {
                for (index, property) in array.iter().enumerate() {
                    elements.push(index);
                    for yielded in property.properties() {
                        // yield yielded;
                        vec.push(yielded);
                    }
                    elements.pop();
                }
            }
            Self::Object(object) => {
                for (key, property) in object.properties() {
                    elements.push(key);
                    for yielded in property.properties() {
                        // yield yielded;
                        vec.push(yielded);
                    }
                    elements.pop();
                }
            }
            Self::Value(property) => {
                // yield (elements.clone(), property)
                vec.push((elements.clone(), property));
            }
        }
        vec.into_iter()
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
                        Self::Array(_) | Self::Value(_) => return None,
                    };
                }
                PropertyPathElement::Index(index) => {
                    value = match value {
                        Self::Array(array) => array.get(index)?,
                        Self::Object(_) | Self::Value(_) => return None,
                    };
                }
            }
        }
        Some(value)
    }

    // TODO: Replace with `gen fn`
    fn diff_array<'a>(
        lhs: &'a [Self],
        rhs: &'a [Self],
        path: &mut PropertyPath<'a>,
    ) -> impl Iterator<Item = PropertyDiff<'a>> {
        let mut vec = Vec::new();
        for (index, (lhs, rhs)) in lhs.iter().zip(rhs).enumerate() {
            path.push(index);
            for yielded in lhs.diff(rhs, path) {
                // yield yielded;
                vec.push(yielded);
            }
            path.pop();
        }

        match lhs.len().cmp(&rhs.len()) {
            Ordering::Less => {
                for (index, property) in rhs.iter().enumerate().skip(lhs.len()) {
                    path.push(index);
                    // yield PropertyDiff::Added {
                    //     path: path.clone(),
                    //     added: Cow::Borrowed(property),
                    // };
                    vec.push(PropertyDiff::Added {
                        path: path.clone(),
                        added: Cow::Borrowed(property),
                    });
                    path.pop();
                }
            }
            Ordering::Equal => {}
            Ordering::Greater => {
                for (index, property) in lhs.iter().enumerate().skip(rhs.len()) {
                    path.push(index);
                    // yield PropertyDiff::Removed {
                    //     path: path.clone(),
                    //     removed: Cow::Borrowed(property),
                    // };
                    vec.push(PropertyDiff::Removed {
                        path: path.clone(),
                        removed: Cow::Borrowed(property),
                    });
                    path.pop();
                }
            }
        }
        vec.into_iter()
    }

    // TODO: Replace with `gen fn`
    fn diff_object<'a>(
        lhs: &'a HashMap<BaseUrl, Self>,
        rhs: &'a HashMap<BaseUrl, Self>,
        path: &mut PropertyPath<'a>,
    ) -> impl Iterator<Item = PropertyDiff<'a>> {
        let mut vec = Vec::new();
        for (key, property) in lhs {
            path.push(key);
            let other_property = rhs.get(key);
            if let Some(other_property) = other_property {
                for yielded in property.diff(other_property, path) {
                    // yield yielded;
                    vec.push(yielded);
                }
            } else {
                // yield PropertyDiff::Removed {
                //     path: path.clone(),
                //     removed: Cow::Borrowed(property),
                // };
                vec.push(PropertyDiff::Removed {
                    path: path.clone(),
                    removed: Cow::Borrowed(property),
                });
            }
            path.pop();
        }
        for (key, property) in rhs {
            if !lhs.contains_key(key) {
                path.push(key);
                // yield PropertyDiff::Added {
                //     path: path.clone(),
                //     added: Cow::Borrowed(property),
                // };
                vec.push(PropertyDiff::Added {
                    path: path.clone(),
                    added: Cow::Borrowed(property),
                });

                path.pop();
            }
        }
        vec.into_iter()
    }

    // TODO: Replace with `gen fn`
    pub fn diff<'a>(
        &'a self,
        other: &'a Self,
        path: &mut PropertyPath<'a>,
    ) -> impl Iterator<Item = PropertyDiff<'a>> {
        let mut vec = Vec::new();
        let mut changed = false;
        match (self, other) {
            (Self::Array(lhs), Self::Array(rhs)) => {
                for yielded in Self::diff_array(lhs, rhs, path) {
                    changed = true;
                    // yield yielded;
                    vec.push(yielded);
                }
            }
            (Self::Object(lhs), Self::Object(rhs)) => {
                for yielded in Self::diff_object(lhs.properties(), rhs.properties(), path) {
                    changed = true;
                    // yield yielded;
                    vec.push(yielded);
                }
            }
            (lhs, rhs) => {
                changed = lhs != rhs;
            }
        }

        if changed {
            // yield PropertyDiff::Changed {
            //     path: path.clone(),
            //     old: Cow::Borrowed(self),
            //     new: Cow::Borrowed(other),
            // };
            vec.push(PropertyDiff::Changed {
                path: path.clone(),
                old: Cow::Borrowed(self),
                new: Cow::Borrowed(other),
            });
        }
        vec.into_iter()
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
                    .map_err(io::Error::other)?;
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

impl PartialEq<PropertyValue> for Property {
    fn eq(&self, other: &PropertyValue) -> bool {
        match self {
            Self::Array(lhs) => {
                let PropertyValue::Array(rhs) = other else {
                    return false;
                };

                lhs == rhs
            }
            Self::Object(lhs) => {
                let PropertyValue::Object(rhs) = other else {
                    return false;
                };

                lhs.len() == rhs.len()
                    && lhs.iter().all(|(key, value)| {
                        rhs.get(key.as_str())
                            .is_some_and(|other_value| value == other_value)
                    })
            }
            Self::Value(lhs) => lhs == other,
        }
    }
}
