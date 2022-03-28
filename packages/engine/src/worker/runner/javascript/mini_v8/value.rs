use std::{
    fmt,
    ops::{Deref, DerefMut},
    slice, vec,
};

use super::{Array, Function, MiniV8, Object, Ref, Result, String};

/// A JavaScript value.
///
/// `Value`s can either hold direct values (undefined, null, booleans, numbers, dates) or references
/// (strings, arrays, functions, other objects). Cloning values (via Rust's `Clone`) of the direct
/// types defers to Rust's `Copy`, while cloning values of the referential types results in a simple
/// reference clone similar to JavaScript's own "by-reference" semantics.
#[derive(Clone)]
pub enum Value<'mv8> {
    /// The JavaScript value `undefined`.
    Undefined,
    /// The JavaScript value `null`.
    Null,
    /// The JavaScript value `true` or `false`.
    Boolean(bool),
    /// A JavaScript floating point number.
    Number(f64),
    /// Elapsed milliseconds since Unix epoch.
    Date(f64),
    /// An immutable JavaScript string, managed by V8. Contains an internal reference to its parent
    /// `MiniV8`.
    String(String<'mv8>),
    /// Reference to a JavaScript arrray. Contains an internal reference to its parent `MiniV8`.
    Array(Array<'mv8>),
    /// Reference to a JavaScript function. Contains an internal reference to its parent `MiniV8`.
    Function(Function<'mv8>),
    /// Reference to a JavaScript object. Contains an internal reference to its parent `MiniV8`. If
    /// a value is a function or an array in JavaScript, it will be converted to `Value::Array` or
    /// `Value::Function` instead of `Value::Object`.
    Object(Object<'mv8>),
}

impl<'mv8> Value<'mv8> {
    /// Returns `true` if this is a `Value::Undefined`, `false` otherwise.
    pub fn is_undefined(&self) -> bool {
        matches!(*self, Value::Undefined)
    }

    /// Returns `true` if this is a `Value::Null`, `false` otherwise.
    pub fn is_null(&self) -> bool {
        matches!(*self, Value::Null)
    }

    /// Returns `true` if this is a `Value::Boolean`, `false` otherwise.
    pub fn is_boolean(&self) -> bool {
        matches!(*self, Value::Boolean(_))
    }

    /// Returns `true` if this is a `Value::Number`, `false` otherwise.
    pub fn is_number(&self) -> bool {
        matches!(*self, Value::Number(_))
    }

    /// Returns `true` if this is a `Value::Date`, `false` otherwise.
    pub fn is_date(&self) -> bool {
        matches!(*self, Value::Date(_))
    }

    /// Returns `true` if this is a `Value::String`, `false` otherwise.
    pub fn is_string(&self) -> bool {
        matches!(*self, Value::String(_))
    }

    /// Returns `true` if this is a `Value::Array`, `false` otherwise.
    pub fn is_array(&self) -> bool {
        matches!(*self, Value::Array(_))
    }

    /// Returns `true` if this is a `Value::Function`, `false` otherwise.
    pub fn is_function(&self) -> bool {
        matches!(*self, Value::Function(_))
    }

    /// Returns `true` if this is a `Value::Object`, `false` otherwise.
    pub fn is_object(&self) -> bool {
        matches!(*self, Value::Object(_))
    }

    /// Returns `Some(())` if this is a `Value::Undefined`, `None` otherwise.
    pub fn as_undefined(&self) -> Option<()> {
        if let Value::Undefined = *self {
            Some(())
        } else {
            None
        }
    }

    /// Returns `Some(())` if this is a `Value::Null`, `None` otherwise.
    pub fn as_null(&self) -> Option<()> {
        if let Value::Undefined = *self {
            Some(())
        } else {
            None
        }
    }

    /// Returns `Some` if this is a `Value::Boolean`, `None` otherwise.
    pub fn as_boolean(&self) -> Option<bool> {
        if let Value::Boolean(value) = *self {
            Some(value)
        } else {
            None
        }
    }

    /// Returns `Some` if this is a `Value::Number`, `None` otherwise.
    pub fn as_number(&self) -> Option<f64> {
        if let Value::Number(value) = *self {
            Some(value)
        } else {
            None
        }
    }

    /// Returns `Some` if this is a `Value::Date`, `None` otherwise.
    pub fn as_date(&self) -> Option<f64> {
        if let Value::Date(value) = *self {
            Some(value)
        } else {
            None
        }
    }

    /// Returns `Some` if this is a `Value::String`, `None` otherwise.
    pub fn as_string(&self) -> Option<&String<'mv8>> {
        if let Value::String(ref value) = *self {
            Some(value)
        } else {
            None
        }
    }

    /// Returns `Some` if this is a `Value::Array`, `None` otherwise.
    pub fn as_array(&self) -> Option<&Array<'mv8>> {
        if let Value::Array(ref value) = *self {
            Some(value)
        } else {
            None
        }
    }

    /// Returns `Some` if this is a `Value::Function`, `None` otherwise.
    pub fn as_function(&self) -> Option<&Function<'mv8>> {
        if let Value::Function(ref value) = *self {
            Some(value)
        } else {
            None
        }
    }

    /// Returns `Some` if this is a `Value::Object`, `None` otherwise.
    pub fn as_object(&self) -> Option<&Object<'mv8>> {
        if let Value::Object(ref value) = *self {
            Some(value)
        } else {
            None
        }
    }

    /// A wrapper around `FromValue::from_value`.
    pub fn into<T: FromValue<'mv8>>(self, mv8: &'mv8 MiniV8) -> Result<'mv8, T> {
        T::from_value(self, mv8)
    }

    pub(super) fn type_name(&self) -> &'static str {
        match *self {
            Value::Undefined => "undefined",
            Value::Null => "null",
            Value::Boolean(_) => "boolean",
            Value::Number(_) => "number",
            Value::Date(_) => "date",
            Value::Function(_) => "function",
            Value::Array(_) => "array",
            Value::Object(_) => "object",
            Value::String(_) => "string",
        }
    }

    pub(super) fn inner_ref(&self) -> Option<&Ref<'_>> {
        match *self {
            Value::Array(Array(ref r))
            | Value::Function(Function(ref r))
            | Value::Object(Object(ref r))
            | Value::String(String(ref r)) => Some(r),
            Value::Undefined
            | Value::Null
            | Value::Boolean(_)
            | Value::Number(_)
            | Value::Date(_) => None,
        }
    }
}

impl fmt::Debug for Value<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Value::Undefined => write!(f, "undefined"),
            Value::Null => write!(f, "null"),
            Value::Boolean(b) => write!(f, "{:?}", b),
            Value::Number(n) => write!(f, "{}", n),
            Value::Date(d) => write!(f, "date:{}", d),
            Value::String(s) => write!(f, "{:?}", s),
            Value::Array(a) => write!(f, "{:?}", a),
            Value::Function(u) => write!(f, "{:?}", u),
            Value::Object(o) => write!(f, "{:?}", o),
        }
    }
}

/// Trait for types convertible to `Value`.
pub trait ToValue<'mv8> {
    /// Performs the conversion.
    fn to_value(self, mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>>;
}

/// Trait for types convertible from `Value`.
pub trait FromValue<'mv8>: Sized {
    /// Performs the conversion.
    fn from_value(value: Value<'mv8>, mv8: &'mv8 MiniV8) -> Result<'mv8, Self>;
}

/// A collection of multiple JavaScript values used for interacting with function arguments.
#[derive(Clone, Debug, Default)]
pub struct Values<'mv8>(Vec<Value<'mv8>>);

impl<'mv8> Values<'mv8> {
    /// Creates an empty `Values`.
    pub fn new() -> Values<'mv8> {
        Self::default()
    }

    pub fn from_vec(vec: Vec<Value<'mv8>>) -> Values<'mv8> {
        Values(vec)
    }

    pub fn into_vec(self) -> Vec<Value<'mv8>> {
        self.0
    }

    pub fn get(&self, index: usize) -> Value<'mv8> {
        self.0
            .get(index)
            .map(Clone::clone)
            .unwrap_or(Value::Undefined)
    }

    pub fn from<T: FromValue<'mv8>>(&self, mv8: &'mv8 MiniV8, index: usize) -> Result<'mv8, T> {
        T::from_value(
            self.0
                .get(index)
                .map(Clone::clone)
                .unwrap_or(Value::Undefined),
            mv8,
        )
    }

    pub fn into<T: FromValues<'mv8>>(self, mv8: &'mv8 MiniV8) -> Result<'mv8, T> {
        T::from_values(self, mv8)
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn iter<'a>(&'a self) -> impl Iterator<Item = &'a Value<'mv8>> {
        self.0.iter()
    }
}

impl<'mv8> FromIterator<Value<'mv8>> for Values<'mv8> {
    fn from_iter<I: IntoIterator<Item = Value<'mv8>>>(iter: I) -> Self {
        Values::from_vec(Vec::from_iter(iter))
    }
}

impl<'mv8> IntoIterator for Values<'mv8> {
    type IntoIter = vec::IntoIter<Value<'mv8>>;
    type Item = Value<'mv8>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl<'a, 'mv8> IntoIterator for &'a Values<'mv8> {
    type IntoIter = slice::Iter<'a, Value<'mv8>>;
    type Item = &'a Value<'mv8>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.iter()
    }
}

/// Trait for types convertible to any number of JavaScript values.
///
/// This is a generalization of `ToValue`, allowing any number of resulting JavaScript values
/// instead of just one. Any type that implements `ToValue` will automatically implement this trait.
pub trait ToValues<'mv8> {
    /// Performs the conversion.
    fn to_values(self, mv8: &'mv8 MiniV8) -> Result<'mv8, Values<'mv8>>;
}

/// Trait for types that can be created from an arbitrary number of JavaScript values.
///
/// This is a generalization of `FromValue`, allowing an arbitrary number of JavaScript values to
/// participate in the conversion. Any type that implements `FromValue` will automatically implement
/// this trait.
pub trait FromValues<'mv8>: Sized {
    /// Performs the conversion.
    ///
    /// In case `values` contains more values than needed to perform the conversion, the excess
    /// values should be ignored. Similarly, if not enough values are given, conversions should
    /// assume that any missing values are undefined.
    fn from_values(values: Values<'mv8>, mv8: &'mv8 MiniV8) -> Result<'mv8, Self>;
}

/// Wraps a variable number of `T`s.
///
/// Can be used to work with variadic functions more easily. Using this type as the last argument of
/// a Rust callback will accept any number of arguments from JavaScript and convert them to the type
/// `T` using [`FromValue`]. `Variadic<T>` can also be returned from a callback, returning a
/// variable number of values to JavaScript.
#[derive(Clone, Debug)]
pub struct Variadic<T>(pub(super) Vec<T>);

impl<T> Default for Variadic<T> {
    fn default() -> Self {
        Self(Vec::new())
    }
}

impl<T> Variadic<T> {
    /// Creates an empty `Variadic` wrapper containing no values.
    pub fn new() -> Variadic<T> {
        Self::default()
    }

    pub fn from_vec(vec: Vec<T>) -> Variadic<T> {
        Self(vec)
    }

    pub fn into_vec(self) -> Vec<T> {
        self.0
    }
}

impl<T> FromIterator<T> for Variadic<T> {
    fn from_iter<I: IntoIterator<Item = T>>(iter: I) -> Self {
        Variadic(Vec::from_iter(iter))
    }
}

impl<T> IntoIterator for Variadic<T> {
    type IntoIter = <Vec<T> as IntoIterator>::IntoIter;
    type Item = T;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl<T> Deref for Variadic<T> {
    type Target = Vec<T>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<T> DerefMut for Variadic<T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}
