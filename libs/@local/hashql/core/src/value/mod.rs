mod dict;
mod list;

mod opaque;
mod primitive;
mod r#struct;
mod tuple;

pub use self::{
    dict::Dict,
    list::List,
    opaque::Opaque,
    primitive::{Float, Integer, Primitive, String},
    r#struct::{Struct, StructError},
    tuple::{Tuple, TupleError},
};
use crate::symbol::Symbol;

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

/// A value in HashQL.
///
/// Values are immutable and can be primitives (null, boolean, integer, float, string) or
/// collections (struct, tuple, list, dict, opaque).
///
/// # Examples
///
/// ```
/// use hashql_core::{
///     heap::Heap,
///     value::{Dict, Integer, List, Primitive, String, Struct, Tuple, Value},
/// };
///
/// let heap = Heap::new();
/// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
/// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
/// # let boolean = |value: bool| Value::Primitive(Primitive::Boolean(value));
///
/// // Primitive values
/// let number = integer("42");
/// let text = string("hello");
/// let flag = boolean(true);
///
/// // Collections
/// let list = Value::List(List::from_values([number.clone(), text.clone()]));
/// let tuple = Value::Tuple(Tuple::from_values([flag.clone(), number.clone()]));
///
/// // Structured data
/// let person = Value::Struct(Struct::from_fields(
///     &heap,
///     [
///         (heap.intern_symbol("name"), text.clone()),
///         (heap.intern_symbol("age"), number.clone()),
///     ],
/// ));
///
/// let config = Value::Dict(Dict::from_entries([
///     (string("debug"), flag),
///     (string("port"), number),
/// ]));
/// ```
#[derive(Debug, Clone, PartialOrd, Ord, PartialEq, Eq, Hash, derive_more::From)]
pub enum Value<'heap> {
    /// A primitive literal value (null, boolean, integer, float, or string).
    Primitive(Primitive<'heap>),
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
    /// Returns the type name of this value.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Integer, Primitive, String, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    /// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
    ///
    /// let number = integer("42");
    /// assert_eq!(number.type_name(), "integer");
    ///
    /// let text = string("hello");
    /// assert_eq!(text.type_name(), "string");
    ///
    /// let flag = Value::Primitive(Primitive::Boolean(true));
    /// assert_eq!(flag.type_name(), "boolean");
    /// ```
    #[must_use]
    pub const fn type_name(&self) -> &'static str {
        match self {
            Self::Primitive(Primitive::Null) => "null",
            Self::Primitive(Primitive::Boolean(_)) => "boolean",
            Self::Primitive(Primitive::Integer(_)) => "integer",
            Self::Primitive(Primitive::Float(_)) => "float",
            Self::Primitive(Primitive::String(_)) => "string",
            Self::Struct(_) => "struct",
            Self::Tuple(_) => "tuple",
            Self::List(_) => "list",
            Self::Dict(_) => "dict",
            Self::Opaque(_) => "opaque",
        }
    }

    /// Accesses a field by symbol name.
    ///
    /// For structs, accesses named fields. For tuples, parses the symbol as an integer index.
    ///
    /// # Errors
    ///
    /// Returns an error if the field doesn't exist or the value type doesn't support field access.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(assert_matches)]
    /// # use core::assert_matches;
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{FieldAccessError, Integer, Primitive, String, Struct, Tuple, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    /// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
    ///
    /// // Struct field access
    /// let person = Value::Struct(Struct::from_fields(
    ///     &heap,
    ///     [(heap.intern_symbol("name"), string("Alice"))],
    /// ));
    /// let name_field = heap.intern_symbol("name");
    /// assert_eq!(
    ///     person.access_by_field(name_field).unwrap(),
    ///     &string("Alice")
    /// );
    ///
    /// // Tuple field access (using string index)
    /// let point = Value::Tuple(Tuple::from_values([integer("1"), integer("2")]));
    /// let index_0 = heap.intern_symbol("0");
    /// assert_eq!(point.access_by_field(index_0).unwrap(), &integer("1"));
    ///
    /// // Error case - field access on primitive
    /// let number = integer("42");
    /// let field = heap.intern_symbol("invalid");
    /// assert_matches!(
    ///     number.access_by_field(field),
    ///     Err(FieldAccessError::UnableToAccess("integer", _))
    /// );
    /// ```
    pub fn access_by_field(&self, field: Symbol<'heap>) -> Result<&Self, FieldAccessError<'heap>> {
        match self {
            Self::Struct(r#struct) => r#struct.get(field).map_err(FieldAccessError::Struct),
            Self::Tuple(tuple) => tuple.get(field).map_err(FieldAccessError::Tuple),
            Self::Opaque(opaque) => opaque.value().access_by_field(field),
            Self::Primitive(_) | Self::List(_) | Self::Dict(_) => {
                Err(FieldAccessError::UnableToAccess(self.type_name(), field))
            }
        }
    }

    /// Accesses an element by index or key.
    ///
    /// For lists, the index must be an integer. For dicts, any value can be used as a key.
    ///
    /// # Errors
    ///
    /// Returns an error if the index type is invalid or the value type doesn't support indexing.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(assert_matches)]
    /// # use core::assert_matches;
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Dict, IndexAccessError, Integer, List, Primitive, String, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    /// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
    ///
    /// // List index access
    /// let list = Value::List(List::from_values([
    ///     string("first"),
    ///     string("second"),
    /// ]));
    /// let index = integer("0");
    /// assert_eq!(
    ///     list.access_by_index(&index).unwrap(),
    ///     Some(&string("first"))
    /// );
    ///
    /// // Dict key access
    /// let dict = Value::Dict(Dict::from_entries([
    ///     (string("key"), string("value"))
    /// ]));
    /// let key = string("key");
    /// assert_eq!(
    ///     dict.access_by_index(&key).unwrap(),
    ///     Some(&string("value"))
    /// );
    ///
    /// // Error case - invalid index type for list
    /// let invalid_index = string("not_a_number");
    /// assert_matches!(
    ///     list.access_by_index(&invalid_index),
    ///     Err(IndexAccessError::InvalidListIndexType(_))
    /// );
    ///
    /// // Error case - index access on primitive
    /// let number = integer("42");
    /// assert_matches!(
    ///     number.access_by_index(&index),
    ///     Err(IndexAccessError::UnableToAccess("integer"))
    /// );
    /// ```
    pub fn access_by_index(&self, index: &Self) -> Result<Option<&Self>, IndexAccessError> {
        match self {
            Value::List(list) => {
                let integer = match index {
                    &Self::Primitive(Primitive::Integer(integer)) => integer,
                    Self::Primitive(Primitive::Float(float))
                        if let Some(integer) = float.as_integer() =>
                    {
                        integer
                    }
                    Self::Primitive(_)
                    | Self::Struct(_)
                    | Self::Tuple(_)
                    | Self::List(_)
                    | Self::Dict(_)
                    | Self::Opaque(_) => {
                        return Err(IndexAccessError::InvalidListIndexType(index.type_name()));
                    }
                };

                let Some(index) = integer.as_usize() else {
                    return Ok(None);
                };

                Ok(list.get(index))
            }
            Value::Dict(dict) => Ok(dict.get(index)),
            Value::Opaque(opaque) => opaque.value().access_by_index(index),
            Value::Primitive(_) | Value::Struct(_) | Value::Tuple(_) => {
                Err(IndexAccessError::UnableToAccess(self.type_name()))
            }
        }
    }
}
