#![feature(extend_one)]
#![expect(unsafe_code)]
#![cfg_attr(
    target_arch = "wasm32",
    expect(unreachable_pub, reason = "Used in the generated TypeScript types")
)]

extern crate alloc;

pub mod url;

pub mod schema;
mod utils;

use alloc::sync::Arc;
#[cfg(feature = "postgres")]
use core::error::Error;
use core::{
    borrow::Borrow,
    fmt::{self, Debug},
    ops::Deref,
    ptr,
};
use std::collections::HashMap;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
use hash_codec::numeric::Real;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, Json, ToSql, Type};
use serde::Serialize as _;

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged)]
pub enum Value {
    Null,
    Bool(bool),
    String(String),
    Number(Real),
    Array(Vec<Self>),
    Object(HashMap<String, Self>),
}

impl fmt::Display for Value {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for Value {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::<Self>::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for Value {
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

pub trait Validator<V>: Sync {
    type Error;

    /// Validates a reference and return [`&Valid<V>`] if it is valid.
    ///
    /// [`&Valid<V>`]: Valid
    ///
    /// # Errors
    ///
    /// Returns an error if the value is invalid.
    fn validate_ref<'v>(&self, value: &'v V) -> Result<&'v Valid<V>, Self::Error>;

    /// Validates a value and return [`Valid<V>`] if it is valid.
    ///
    /// [`Valid<V>`]: Valid
    ///
    /// # Errors
    ///
    /// Returns an error if the value is invalid.
    fn validate(&self, value: V) -> Result<Valid<V>, Self::Error> {
        self.validate_ref(&value)?;
        Ok(Valid { value })
    }
}

impl<V, T> Validator<Arc<V>> for T
where
    V: Send + Sync,
    T: Validator<V> + Sync,
{
    type Error = T::Error;

    fn validate_ref<'v>(&self, value: &'v Arc<V>) -> Result<&'v Valid<Arc<V>>, Self::Error>
    where
        V: Sync,
    {
        self.validate_ref(value.as_ref())?;
        Ok(Valid::new_ref_unchecked(value))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
#[repr(transparent)]
pub struct Valid<T> {
    value: T,
}

impl<T> Valid<T> {
    pub const fn new_unchecked(value: T) -> Self {
        Self { value }
    }

    pub const fn new_ref_unchecked(value: &T) -> &Self {
        // SAFETY: Self is `repr(transparent)`
        unsafe { &*ptr::from_ref(value).cast::<Self>() }
    }

    pub fn into_inner(self) -> T {
        self.value
    }
}

impl<T> Deref for Valid<T> {
    type Target = T;

    fn deref(&self) -> &T {
        &self.value
    }
}

impl<T> Borrow<T> for Valid<T> {
    fn borrow(&self) -> &T {
        &self.value
    }
}

impl<T> AsRef<T> for Valid<T> {
    fn as_ref(&self) -> &T {
        self.borrow()
    }
}

#[cfg(feature = "postgres")]
impl<'de, 'a: 'de, T> FromSql<'a> for Valid<T>
where
    T: serde::Deserialize<'de>,
{
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self {
            value: Json::from_sql(ty, raw)?.0,
        })
    }

    fn accepts(ty: &Type) -> bool {
        <Json<T> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl<T> ToSql for Valid<T>
where
    T: serde::Serialize + Debug,
{
    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        Json(&**self).to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<T> as ToSql>::accepts(ty)
    }
}
