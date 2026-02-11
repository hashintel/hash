mod array;
mod object;
mod raw;
mod validation;

use core::ptr;
use std::collections::HashSet;

use serde::ser::{Serialize, Serializer};

pub use self::{
    array::{
        ArraySchemaValidationError, ArraySchemaValidator, PropertyArraySchema, PropertyValueArray,
        ValueOrArray,
    },
    object::{
        ObjectSchemaValidationError, ObjectSchemaValidator, PropertyObjectSchema,
        PropertyValueObject,
    },
    validation::{PropertyTypeValidationError, PropertyTypeValidator},
};
use super::PropertyTypeMetadata;
use crate::ontology::{
    OntologyTypeReference, OntologyTypeSchema, VersionedUrl, data_type::schema::DataTypeReference,
    json_schema::OneOfSchema,
};

/// Defines reusable properties that can be attached to entities.
///
/// ## Core Concepts
///
/// A [`PropertyType`] defines:
///
/// - A unique identifier (`id`) as a [`VersionedUrl`]
/// - A title and optional plural title
/// - A description of the property's purpose
/// - A set of possible value structures via `one_of`
///
/// ## Property Value Structures
///
/// Property types can reference three different value structures:
///
/// 1. **Data Type References** - Direct references to data types (e.g., a string or number)
/// 2. **Property Type Objects** - Object structures with nested property type references
/// 3. **Arrays of Property Values** - Collections of property values
///
/// This flexibility allows for complex property definitions, from simple primitive values
/// to nested structures and arrays.
///
/// ## Example Use Cases
///
/// - **Simple Properties**: A "name" property referencing a text data type
/// - **Complex Properties**: A "contact" property with nested "email" and "phone" properties
/// - **Array Properties**: A "tags" property containing an array of text values
///
/// ## Validation Process
///
/// The [`PropertyTypeValidator`] validates values against property types:
///
/// 1. It checks if the value matches any of the `one_of` possibilities
/// 2. For data type references, it delegates to the data type validator
/// 3. For object structures, it validates each property against its definition
/// 4. For arrays, it validates each item against the array item definition
///
/// ## Type Resolution
///
/// Property types can reference both data types and other property types, creating
/// a network of dependencies that must be resolved during validation.
///
/// ## Example
///
/// A property type with multiple possible value types:
///
/// ```
/// use serde_json::json;
/// use type_system::ontology::property_type::schema::PropertyType;
///
/// // Define a property type that can be either a string or a number
/// let user_id_json = json!({
///   "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
///   "kind": "propertyType",
///   "$id": "https://example.com/types/property-type/user-id/v/1",
///   "title": "User ID",
///   "description": "An identifier for a user, which can be either a string or a number",
///   "oneOf": [
///     { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" },
///     { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1" }
///   ]
/// });
///
/// // Parse the property type
/// let user_id = serde_json::from_value::<PropertyType>(user_id_json).expect("Failed to parse property type");
///
/// // Check basic properties
/// assert_eq!(user_id.id.to_string(), "https://example.com/types/property-type/user-id/v/1");
/// assert_eq!(user_id.title, "User ID");
///
/// // This property type accepts multiple data types via oneOf
/// assert_eq!(user_id.one_of.len(), 2);
///
/// // Demonstrate how to check data type references
/// let data_refs = user_id.data_type_references();
/// assert_eq!(data_refs.len(), 2);
///
/// // Check there are no nested property types
/// let property_refs = user_id.property_type_references();
/// assert!(property_refs.is_empty());
/// ```
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(try_from = "raw::PropertyType")]
pub struct PropertyType {
    /// The unique identifier for this property type.
    ///
    /// This should be a versioned URL in the format
    /// `https://example.com/types/property-type/name/v/1`.
    pub id: VersionedUrl,

    /// The human-readable name of the property type.
    ///
    /// This should be concise and descriptive, e.g., "Email Address" or "Age".
    pub title: String,

    /// Optional plural form of the title.
    ///
    /// For property types representing collections, e.g., "Email Addresses".
    pub title_plural: Option<String>,

    /// A detailed description of the property type's purpose and usage.
    ///
    /// This should explain what the property represents, when it should be used,
    /// and any constraints or conventions that apply.
    pub description: String,

    /// Possible value structures for this property.
    ///
    /// A property type can accept multiple types of values, defined by the `one_of` array.
    /// Each entry represents a different valid structure:
    /// - Data type references (e.g., "text", "number")
    /// - Object structures with nested properties
    /// - Arrays of property values
    ///
    /// At least one possible value structure must be defined.
    pub one_of: Vec<PropertyValues>,
}

impl PropertyType {
    /// Returns all data type references used by this property type.
    ///
    /// This method collects all data type references from all possible value structures
    /// defined in the `one_of` field, including those nested in object and array structures.
    ///
    /// # Returns
    ///
    /// A [`HashSet`] containing references to all data types directly or indirectly referenced
    /// by this property type.
    ///
    /// # Examples
    ///
    /// ```
    /// use serde_json::json;
    /// use type_system::ontology::property_type::schema::PropertyType;
    ///
    /// let property_type_json = json!({
    ///     "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    ///     "kind": "propertyType",
    ///     "$id": "https://example.com/types/property-type/user-id/v/1",
    ///     "title": "User ID",
    ///     "description": "An identifier for a user",
    ///     "oneOf": [
    ///         { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" },
    ///         { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1" }
    ///     ]
    /// });
    ///
    /// let property_type = serde_json::from_value::<PropertyType>(property_type_json)
    ///     .expect("Failed to parse property type");
    ///
    /// let data_type_refs = property_type.data_type_references();
    /// assert_eq!(data_type_refs.len(), 2);
    /// ```
    #[must_use]
    pub fn data_type_references(&self) -> HashSet<&DataTypeReference> {
        self.one_of
            .iter()
            .flat_map(|value| value.data_type_references().into_iter())
            .collect()
    }

    /// Returns all property type references used by this property type.
    ///
    /// This method collects all property type references from all possible value structures
    /// defined in the `one_of` field, including those nested in object and array structures.
    ///
    /// # Returns
    ///
    /// A [`HashSet`] containing references to all property types directly or indirectly referenced
    /// by this property type.
    ///
    /// # Examples
    ///
    /// ```
    /// use serde_json::json;
    /// use type_system::ontology::property_type::schema::PropertyType;
    ///
    /// let property_type_json = json!({
    ///     "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    ///     "kind": "propertyType",
    ///     "$id": "https://example.com/types/property-type/contact-info/v/1",
    ///     "title": "Contact Information",
    ///     "description": "Contact details for a person or organization",
    ///     "oneOf": [
    ///         {
    ///             "type": "object",
    ///             "properties": {
    ///                 "https://example.com/types/property-type/email/": {
    ///                     "$ref": "https://example.com/types/property-type/email/v/1"
    ///                 },
    ///                 "https://example.com/types/property-type/phone/": {
    ///                     "$ref": "https://example.com/types/property-type/phone/v/1"
    ///                 }
    ///             }
    ///         }
    ///     ]
    /// });
    ///
    /// let property_type = serde_json::from_value::<PropertyType>(property_type_json)
    ///     .expect("Failed to parse property type");
    ///
    /// let property_type_refs = property_type.property_type_references();
    /// assert_eq!(property_type_refs.len(), 2);
    /// ```
    #[must_use]
    pub fn property_type_references(&self) -> HashSet<&PropertyTypeReference> {
        self.one_of
            .iter()
            .flat_map(|value| value.property_type_references().into_iter())
            .collect()
    }
}

impl Serialize for PropertyType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        raw::PropertyType::from(self).serialize(serializer)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(deny_unknown_fields)]
#[repr(transparent)]
pub struct PropertyTypeReference {
    #[serde(rename = "$ref")]
    pub url: VersionedUrl,
}

impl From<&VersionedUrl> for &PropertyTypeReference {
    fn from(url: &VersionedUrl) -> Self {
        // SAFETY: Self is `repr(transparent)`
        unsafe { &*ptr::from_ref::<VersionedUrl>(url).cast::<PropertyTypeReference>() }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(
    untagged,
    expecting = "Expected a data type reference, a property type object, or an array of property \
                 values"
)]
/// Represents possible value structures for a property type.
///
/// This enum represents the three ways a property can be structured in the Block Protocol:
///
/// 1. As a direct reference to a [`DataTypeReference`]
/// 2. As an object with its own nested property structure
/// 3. As an array of property values
///
/// The `PropertyValues` type is used in the `one_of` field of [`PropertyType`]s to define
/// the set of acceptable value structures for a property.
#[expect(clippy::use_self, reason = "Tsify does not support `Self`")]
pub enum PropertyValues {
    /// A reference to a data type.
    ///
    /// This variant represents a property that directly uses a data type like text, number,
    /// or boolean. It's the simplest form of property value.
    ///
    /// # Example JSON
    ///
    /// ```json
    /// { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" }
    /// ```
    Value(DataTypeReference),

    /// An object structure with nested property type references.
    ///
    /// This variant represents a property that contains a complex object structure with
    /// its own set of properties. This allows for nested data structures within properties.
    ///
    /// # Example JSON
    ///
    /// ```json
    /// {
    ///   "type": "object",
    ///   "properties": {
    ///     "https://example.com/types/property-type/first-name/": {
    ///       "$ref": "https://example.com/types/property-type/first-name/v/1"
    ///     },
    ///     "https://example.com/types/property-type/last-name/": {
    ///       "$ref": "https://example.com/types/property-type/last-name/v/1"
    ///     }
    ///   }
    /// }
    /// ```
    Object(PropertyValueObject<ValueOrArray<PropertyTypeReference>>),

    /// An array of property values.
    ///
    /// This variant represents a property that contains an array of values, each conforming
    /// to one of a set of possible property value structures defined in the `oneOf` field.
    /// This allows for collections of data within a single property.
    ///
    /// # Example JSON
    ///
    /// ```json
    /// {
    ///   "type": "array",
    ///   "items": {
    ///     "oneOf": [
    ///       { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" }
    ///     ]
    ///   }
    /// }
    /// ```
    Array(PropertyValueArray<OneOfSchema<PropertyValues>>),
}

/// Categorizes property value structures by their basic structural type.
///
/// This enum provides a simple classification of the different kinds of property
/// value structures in the Block Protocol type system. It's used by the
/// [`PropertyValues::property_value_type`] method to indicate which variant a particular property
/// value represents.
#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "kebab-case")]
pub enum PropertyValueType {
    /// A simple value (references a data type).
    Value,

    /// An array of values.
    Array,

    /// An object structure with properties.
    Object,
}

impl PropertyValues {
    /// Returns a collection of data type references contained in this property value structure.
    ///
    /// Collects all [`DataTypeReference`]s that are directly or indirectly referenced by this
    /// property value structure. The collection method depends on the variant:
    ///
    /// - For [`PropertyValues::Value`], returns the single reference
    /// - For [`PropertyValues::Array`], recursively collects references from all possibilities
    /// - For [`PropertyValues::Object`], returns an empty collection (objects only reference
    ///   property types)
    #[must_use]
    fn data_type_references(&self) -> Vec<&DataTypeReference> {
        match self {
            Self::Value(reference) => vec![reference],
            Self::Array(values) => values
                .items
                .possibilities
                .iter()
                .flat_map(|value| value.data_type_references().into_iter())
                .collect(),
            Self::Object(_) => vec![],
        }
    }

    /// Returns a collection of property type references contained in this property value structure.
    ///
    /// Collects all [`PropertyTypeReference`]s that are directly or indirectly referenced by this
    /// property value structure. The collection method depends on the variant:
    ///
    /// - For [`PropertyValues::Value`], returns an empty collection (data types don't reference
    ///   property types)
    /// - For [`PropertyValues::Array`], recursively collects references from all possibilities
    /// - For [`PropertyValues::Object`], collects references from all object properties
    #[must_use]
    fn property_type_references(&self) -> Vec<&PropertyTypeReference> {
        match self {
            Self::Value(_) => vec![],
            Self::Array(values) => values
                .items
                .possibilities
                .iter()
                .flat_map(Self::property_type_references)
                .collect(),
            Self::Object(object) => object
                .properties
                .values()
                .map(|value| match value {
                    ValueOrArray::Value(one) => one,
                    ValueOrArray::Array(array) => &array.items,
                })
                .collect(),
        }
    }

    /// Returns the structural type of this property value.
    ///
    /// This method categorizes the property value structure into one of three basic types:
    ///
    /// - [`PropertyValueType::Value`] for direct data type references
    /// - [`PropertyValueType::Object`] for object structures with nested properties
    /// - [`PropertyValueType::Array`] for arrays of values
    ///
    /// This classification is useful for determining how to handle the property value
    /// during validation and rendering.
    #[must_use]
    pub const fn property_value_type(&self) -> PropertyValueType {
        match self {
            Self::Value(_) => PropertyValueType::Value,
            Self::Object(_) => PropertyValueType::Object,
            Self::Array(_) => PropertyValueType::Array,
        }
    }
}

impl OntologyTypeSchema for PropertyType {
    type Metadata = PropertyTypeMetadata;

    fn id(&self) -> &VersionedUrl {
        &self.id
    }

    fn references(&self) -> Vec<OntologyTypeReference<'_>> {
        self.property_type_references()
            .into_iter()
            .map(OntologyTypeReference::PropertyTypeReference)
            .chain(
                self.data_type_references()
                    .into_iter()
                    .map(OntologyTypeReference::DataTypeReference),
            )
            .collect()
    }
}

/// Trait for types that define a set of possible property value structures.
///
/// This trait is implemented by types that contain a collection of [`PropertyValues`]
/// variants, representing the set of possible structures a property value can take.
/// This allows for polymorphic access to property value definitions across different
/// schema types.
pub trait PropertyValueSchema {
    /// Returns a slice of all possible property value structures.
    ///
    /// The returned slice contains all valid [`PropertyValues`] structures that
    /// can be used for this property.
    fn possibilities(&self) -> &[PropertyValues];
}

impl PropertyValueSchema for &PropertyType {
    /// Returns the possible property value structures from the property type's `one_of` field.
    ///
    /// For a [`PropertyType`], the possible value structures are defined directly
    /// in its `one_of` field as a collection of [`PropertyValues`] variants.
    fn possibilities(&self) -> &[PropertyValues] {
        &self.one_of
    }
}

impl PropertyValueSchema for OneOfSchema<PropertyValues> {
    /// Returns the possible property value structures from the [`OneOfSchema::possibilities`]
    /// field.
    fn possibilities(&self) -> &[PropertyValues] {
        &self.possibilities
    }
}

#[cfg(test)]
mod tests {
    use core::str::FromStr as _;

    use serde_json::json;

    use super::*;
    use crate::{
        ontology::BaseUrl,
        utils::tests::{
            JsonEqualityCheck, ensure_failed_deserialization, ensure_failed_validation,
            ensure_validation_from_str,
        },
    };

    fn test_property_type_data_refs(
        property_type: &PropertyType,
        urls: impl IntoIterator<Item = &'static str>,
    ) {
        let expected_data_type_references = urls
            .into_iter()
            .map(|url| VersionedUrl::from_str(url).expect("invalid URL"))
            .collect::<HashSet<_>>();

        let data_type_references = property_type
            .data_type_references()
            .into_iter()
            .map(|data_type_ref| &data_type_ref.url)
            .cloned()
            .collect::<HashSet<_>>();

        assert_eq!(data_type_references, expected_data_type_references);
    }

    fn test_property_type_property_refs(
        property_type: &PropertyType,
        urls: impl IntoIterator<Item = &'static str>,
    ) {
        let expected_property_type_references = urls
            .into_iter()
            .map(|url| VersionedUrl::from_str(url).expect("invalid URL"))
            .collect::<HashSet<_>>();

        let property_type_references = property_type
            .property_type_references()
            .into_iter()
            .map(|property_type_ref| property_type_ref.url.clone())
            .collect::<HashSet<_>>();

        assert_eq!(property_type_references, expected_property_type_references);
    }

    #[tokio::test]
    async fn favorite_quote() {
        let property_type = ensure_validation_from_str::<PropertyType, _>(
            hash_graph_test_data::property_type::FAVORITE_QUOTE_V1,
            PropertyTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_data_refs(
            &property_type,
            ["https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );

        test_property_type_property_refs(&property_type, []);
    }

    #[tokio::test]
    async fn age() {
        let property_type = ensure_validation_from_str::<PropertyType, _>(
            hash_graph_test_data::property_type::AGE_V1,
            PropertyTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_data_refs(
            &property_type,
            ["https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1"],
        );

        test_property_type_property_refs(&property_type, []);
    }

    #[tokio::test]
    async fn user_id() {
        let property_type = ensure_validation_from_str::<PropertyType, _>(
            hash_graph_test_data::property_type::USER_ID_V2,
            PropertyTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_data_refs(
            &property_type,
            [
                "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            ],
        );

        test_property_type_property_refs(&property_type, []);
    }

    #[tokio::test]
    async fn contact_information() {
        let property_type = ensure_validation_from_str::<PropertyType, _>(
            hash_graph_test_data::property_type::CONTACT_INFORMATION_V1,
            PropertyTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_data_refs(&property_type, []);

        test_property_type_property_refs(
            &property_type,
            [
                "https://blockprotocol.org/@alice/types/property-type/email/v/1",
                "https://blockprotocol.org/@alice/types/property-type/phone-number/v/1",
            ],
        );
    }

    #[tokio::test]
    async fn interests() {
        let property_type = ensure_validation_from_str::<PropertyType, _>(
            hash_graph_test_data::property_type::INTERESTS_V1,
            PropertyTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_data_refs(&property_type, []);

        test_property_type_property_refs(
            &property_type,
            [
                "https://blockprotocol.org/@alice/types/property-type/favorite-film/v/1",
                "https://blockprotocol.org/@alice/types/property-type/favorite-song/v/1",
                "https://blockprotocol.org/@alice/types/property-type/hobby/v/1",
            ],
        );
    }

    #[tokio::test]
    async fn numbers() {
        let property_type = ensure_validation_from_str::<PropertyType, _>(
            hash_graph_test_data::property_type::NUMBERS_V1,
            PropertyTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_data_refs(
            &property_type,
            ["https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1"],
        );

        test_property_type_property_refs(&property_type, []);
    }

    #[tokio::test]
    async fn contrived_property() {
        let property_type = ensure_validation_from_str::<PropertyType, _>(
            hash_graph_test_data::property_type::CONTRIVED_PROPERTY_V1,
            PropertyTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_data_refs(
            &property_type,
            ["https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1"],
        );

        test_property_type_property_refs(&property_type, []);
    }

    #[test]
    fn invalid_id() {
        ensure_failed_deserialization::<PropertyType>(
            json!(
                {
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
                  "kind": "propertyType",
                  "$id": "https://blockprotocol.org/@alice/types/property-type/age/v/",
                  "title": "Age",
                  "description": "The age of a person.",
                  "oneOf": [
                    {
                      "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1"
                    }
                  ]
                }
            ),
            &"missing version",
        );
    }

    #[test]
    fn invalid_metaschema() {
        let invalid_schema_url = "https://blockprotocol.org/types/modules/graph/0.3/schema/foo";
        ensure_failed_deserialization::<PropertyType>(
            json!(
                {
                  "$schema": invalid_schema_url,
                  "kind": "propertyType",
                  "$id": "https://blockprotocol.org/@alice/types/property-type/age/v/1",
                  "title": "Age",
                  "description": "The age of a person.",
                  "oneOf": [
                    {
                      "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1"
                    }
                  ]
                }
            ),
            &"unknown variant `https://blockprotocol.org/types/modules/graph/0.3/schema/foo`, expected `https://blockprotocol.org/types/modules/graph/0.3/schema/property-type`",
        );
    }

    #[test]
    fn invalid_reference() {
        ensure_failed_deserialization::<PropertyType>(
            json!(
                {
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
                  "kind": "propertyType",
                  "$id": "https://blockprotocol.org/@alice/types/property-type/age/v/1",
                  "title": "Age",
                  "description": "The age of a person.",
                  "oneOf": [
                    {
                      "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number"
                    }
                  ]
                }
            ),
            &"Expected a data type reference, a property type object, or an array of property \
              values",
        );
    }

    #[tokio::test]
    async fn empty_one_of() {
        assert!(matches!(
            ensure_failed_validation::<PropertyType, _>(
                json!({
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
                  "kind": "propertyType",
                  "$id": "https://blockprotocol.org/@alice/types/property-type/age/v/1",
                  "title": "Age",
                  "description": "The age of a person.",
                  "oneOf": []
                }),
                PropertyTypeValidator,
                JsonEqualityCheck::Yes
            )
            .await,
            PropertyTypeValidationError::OneOfValidationFailed(_)
        ));
    }

    #[tokio::test]
    async fn invalid_property_object() {
        let key = BaseUrl::new(
            "https://blockprotocol.org/@alice/types/property-type/phone-numbers/".to_owned(),
        )
        .expect("invalid URL");
        let versioned_url = VersionedUrl::from_str(
            "https://blockprotocol.org/@alice/types/property-type/phone-number/v/1",
        )
        .expect("invalid URL");

        assert!(matches!(
            ensure_failed_validation::<PropertyType, _>(
                json!({
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
                  "kind": "propertyType",
                  "$id": "https://blockprotocol.org/@alice/types/property-type/contact-information/v/1",
                  "title": "Contact Information",
                  "description": "A contact information property type that can be either an email or a phone number.",
                  "oneOf": [
                    {
                      "type": "object",
                      "properties": {
                        key.to_string(): {
                          "$ref": versioned_url.to_string()
                        }
                      }
                    }
                  ]
                }),
                PropertyTypeValidator,
                JsonEqualityCheck::Yes
            )
            .await,
            PropertyTypeValidationError::InvalidPropertyReference { base_url, reference } if key == base_url && reference.url == versioned_url
        ));
    }
}
