pub mod metadata;

#[cfg(feature = "postgres")]
use core::error::Error;
use core::fmt::{self, Debug};
use std::collections::HashMap;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
use hash_codec::numeric::Real;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, Json, ToSql, Type};
use serde::Serialize as _;

pub use self::metadata::ValueMetadata;

/// A JSON-compatible value type that can represent any valid JSON structure, conforming to data
/// types defined in the ontology.
///
/// This enum is the fundamental data unit in the type system and is used throughout
/// the validation process. [`PropertyValue`]s are instances of [`DataType`]s defined in the
/// ontology. The relationship is similar to values and types in typed programming languages:
/// - [`DataType`]s define the validation rules, constraints, and format a value must follow
/// - [`PropertyValue`] instances contain actual data conforming to those data types
///
/// Each value in an entity:
/// - Corresponds to a specific [`DataType`] in the ontology (referenced in its metadata)
/// - May have associated metadata tracking provenance, confidence, and other contextual information
/// - Must satisfy the validation rules defined by its data type
/// - Serves as the atomic unit of knowledge within the property system
///
/// # Examples
///
/// ```
/// use std::collections::HashMap;
///
/// use type_system::knowledge::PropertyValue;
///
/// // Create a simple string value
/// let string_value = PropertyValue::String("Hello, world!".to_string());
///
/// // Create a more complex object value
/// let mut obj = HashMap::new();
/// obj.insert(
///     "greeting".to_string(),
///     PropertyValue::String("Hello".to_string()),
/// );
/// obj.insert("count".to_string(), PropertyValue::Number(42_i32.into()));
/// let object_value = PropertyValue::Object(obj);
/// ```
///
/// [`DataType`]: crate::ontology::data_type::DataType
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, specta::Type)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[serde(untagged)]
pub enum PropertyValue {
    Null,
    Bool(bool),
    String(String),
    Number(#[cfg_attr(target_arch = "wasm32", tsify(type = "number"))] Real),
    Array(#[cfg_attr(target_arch = "wasm32", tsify(type = "PropertyValue[]"))] Vec<Self>),
    Object(
        #[cfg_attr(
            target_arch = "wasm32",
            tsify(type = "{ [key: string]: PropertyValue }")
        )]
        HashMap<String, Self>,
    ),
}

impl fmt::Display for PropertyValue {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for PropertyValue {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::<Self>::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for PropertyValue {
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
