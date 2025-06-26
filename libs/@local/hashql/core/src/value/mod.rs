mod dict;
mod list;

mod opaque;
mod r#struct;
mod tuple;

pub use self::{dict::Dict, list::List, opaque::Opaque, r#struct::Struct, tuple::Tuple};
use self::{r#struct::StructError, tuple::TupleError};
use crate::{literal::LiteralKind, symbol::Symbol};

/// Errors that can occur when accessing fields on values.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display)]
pub enum FieldAccessError<'heap> {
    /// A struct field access error.
    Struct(StructError<'heap>),
    /// A tuple field access error.
    Tuple(TupleError<'heap>),
    /// The value type does not support field access.
    #[display("Cannot access field `{_1}` on `{_0}`")]
    UnableToAccess(&'static str, Symbol<'heap>),
}

impl core::error::Error for FieldAccessError<'_> {}

/// Errors that can occur when accessing values by index.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display)]
pub enum IndexAccessError {
    /// The provided index type is not valid for list access.
    #[display("Unable to access list with index type `{_0}`")]
    InvalidListIndexType(&'static str),
    /// The requested key was not found in the collection.
    #[display("Key not found")]
    KeyNotFound,
    /// The value type does not support index access.
    #[display("Unable to index `{_0}`")]
    UnableToAccess(&'static str),
}

impl core::error::Error for IndexAccessError {}

/// A value in HashQL
///
/// Represents all data types in HashQL, from atomic primitives to composite
/// collections. All values are immutable and support structural equality,
/// ordering, and hashing operations.
///
/// # Examples
///
/// ```
/// use hashql_core::{
///     heap::Heap,
///     literal::LiteralKind,
///     symbol::Symbol,
///     value::{Dict, List, Struct, Tuple, Value},
/// };
///
/// let heap = Heap::new();
///
/// // Primitive values
/// let number = Value::Primitive(LiteralKind::Integer(42.into()));
/// let text = Value::Primitive(LiteralKind::String("hello".into()));
/// let flag = Value::Primitive(LiteralKind::Boolean(true));
///
/// // Collections
/// let list = Value::List(List::from_values([number.clone(), text.clone()]));
/// let tuple = Value::Tuple(Tuple::from_values([flag.clone(), number.clone()]));
///
/// // Structured data
/// let person = Value::Struct(Struct::from_fields(
///     &heap,
///     [
///         (Symbol::from("name"), text.clone()),
///         (Symbol::from("age"), number.clone()),
///     ],
/// ));
///
/// let config = Value::Dict(Dict::from_entries([
///     (Value::from("debug"), flag),
///     (Value::from("port"), number),
/// ]));
/// ```
#[derive(Debug, Clone, PartialOrd, Ord, PartialEq, Eq, Hash, derive_more::From)]
pub enum Value<'heap> {
    /// A primitive literal value (null, boolean, integer, float, or string).
    Primitive(LiteralKind<'heap>),
    /// A structured value with named fields.
    Struct(Struct<'heap>),
    /// A fixed-size sequence of values accessed by position.
    Tuple(Tuple<'heap>),
    /// A variable-size sequence of values.
    List(List<'heap>),
    /// A key-value mapping.
    Dict(Dict<'heap>),
    /// An opaque nominal value with a name and a value.
    Opaque(Opaque<'heap>),
}

impl<'heap> Value<'heap> {
    /// Returns the type name of this value as a static string.
    ///
    /// This provides a human-readable representation of the value's type,
    /// useful for error messages and debugging.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{literal::LiteralKind, value::Value};
    ///
    /// let number = Value::Primitive(LiteralKind::Integer(42.into()));
    /// assert_eq!(number.type_name(), "integer");
    ///
    /// let text = Value::Primitive(LiteralKind::String("hello".into()));
    /// assert_eq!(text.type_name(), "string");
    ///
    /// let flag = Value::Primitive(LiteralKind::Boolean(true));
    /// assert_eq!(flag.type_name(), "boolean");
    /// ```
    #[must_use]
    pub const fn type_name(&self) -> &'static str {
        match self {
            Self::Primitive(LiteralKind::Null) => "null",
            Self::Primitive(LiteralKind::Boolean(_)) => "boolean",
            Self::Primitive(LiteralKind::Integer(_)) => "integer",
            Self::Primitive(LiteralKind::Float(_)) => "float",
            Self::Primitive(LiteralKind::String(_)) => "string",
            Self::Struct(_) => "struct",
            Self::Tuple(_) => "tuple",
            Self::List(_) => "list",
            Self::Dict(_) => "dict",
            Self::Opaque(_) => "opaque",
        }
    }

    /// Accesses a field on this value using the provided symbol.
    ///
    /// This method provides uniform field access across different value types.
    /// For structs, it accesses named fields. For tuples, it parses the symbol
    /// as an integer index.
    ///
    /// # Errors
    ///
    /// Returns [`FieldAccessError::Struct`] if struct field access fails.
    /// Returns [`FieldAccessError::Tuple`] if tuple field access fails.
    /// Returns [`FieldAccessError::UnableToAccess`] if the value type doesn't support field access.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     symbol::Symbol,
    ///     value::{FieldAccessError, Struct, Tuple, Value},
    /// };
    ///
    /// let heap = Heap::new();
    ///
    /// // Struct field access
    /// let person = Value::Struct(Struct::from_fields(
    ///     &heap,
    ///     [(Symbol::from("name"), Value::from("Alice"))],
    /// ));
    /// let name_field = Symbol::from("name");
    /// assert_eq!(
    ///     person.access_by_field(name_field).unwrap(),
    ///     &Value::from("Alice")
    /// );
    ///
    /// // Tuple field access (using string index)
    /// let point = Value::Tuple(Tuple::from_values([Value::from(1), Value::from(2)]));
    /// let index_0 = Symbol::from("0");
    /// assert_eq!(point.access_by_field(index_0).unwrap(), &Value::from(1));
    ///
    /// // Error case - field access on primitive
    /// let number = Value::from(42);
    /// let field = Symbol::from("invalid");
    /// assert!(matches!(
    ///     number.access_by_field(field),
    ///     Err(FieldAccessError::UnableToAccess("integer", _))
    /// ));
    /// ```
    pub fn access_by_field(&self, field: Symbol<'heap>) -> Result<&Self, FieldAccessError<'heap>> {
        match self {
            Self::Struct(r#struct) => r#struct.get(field).map_err(FieldAccessError::Struct),
            Self::Tuple(tuple) => tuple.get(field).map_err(FieldAccessError::Tuple),
            Self::Opaque(opaque) => opaque.value().access_by_field(field),
            _ => Err(FieldAccessError::UnableToAccess(self.type_name(), field)),
        }
    }

    /// Accesses an element in this value using the provided index.
    ///
    /// This method provides uniform index access across different collection types.
    /// For lists, the index must be an integer or float that converts to integer.
    /// For dicts, any value can be used as a key.
    ///
    /// Returns [`Some`] with a reference to the value if found, [`None`] if the
    /// index is valid but no value exists at that position.
    ///
    /// # Errors
    ///
    /// Returns [`IndexAccessError::InvalidListIndexType`] if the index type is not valid for list
    /// access. Returns [`IndexAccessError::UnableToAccess`] if the value type doesn't support
    /// index access.
    ///
    /// # Examples
    ///
    /// ```
    /// use core::assert_matches::assert_matches;
    /// use hashql_core::{
    ///     literal::LiteralKind,
    ///     value::{Dict, IndexAccessError, List, Value},
    /// };
    ///
    /// // List index access
    /// let list = Value::List(List::from_values([
    ///     Value::from("first"),
    ///     Value::from("second"),
    /// ]));
    /// let index = Value::Primitive(LiteralKind::Integer(0.into()));
    /// assert_eq!(
    ///     list.access_by_index(&index).unwrap(),
    ///     Some(&Value::from("first"))
    /// );
    ///
    /// // Dict key access
    /// let dict = Value::Dict(Dict::from_entries([(
    ///     Value::from("key"),
    ///     Value::from("value"),
    /// )]));
    /// let key = Value::from("key");
    /// assert_eq!(
    ///     dict.access_by_index(&key).unwrap(),
    ///     Some(&Value::from("value"))
    /// );
    ///
    /// // Error case - invalid index type for list
    /// let invalid_index = Value::from("not_a_number");
    /// assert_matches!(
    ///     list.access_by_index(&invalid_index),
    ///     Err(IndexAccessError::InvalidListIndexType(_))
    /// ));
    ///
    /// // Error case - index access on primitive
    /// let number = Value::from(42);
    /// assert_matches!(
    ///     number.access_by_index(&index),
    ///     Err(IndexAccessError::UnableToAccess("integer"))
    /// );
    /// ```
    pub fn access_by_index(&self, index: &Self) -> Result<Option<&Self>, IndexAccessError> {
        match self {
            Value::List(list) => {
                let integer = match index {
                    &Self::Primitive(LiteralKind::Integer(integer)) => integer,
                    Self::Primitive(LiteralKind::Float(float))
                        if let Some(integer) = float.as_integer() =>
                    {
                        integer
                    }
                    _ => return Err(IndexAccessError::InvalidListIndexType(self.type_name())),
                };

                let Some(index) = integer.as_usize() else {
                    return Ok(None);
                };

                Ok(list.get(index))
            }
            Value::Dict(dict) => Ok(dict.get(index)),
            Value::Opaque(opaque) => opaque.value().access_by_index(index),
            _ => Err(IndexAccessError::UnableToAccess(self.type_name())),
        }
    }
}
