#![feature(extend_one)]
#![feature(hash_raw_entry)]
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
use core::{borrow::Borrow, fmt::Debug, ops::Deref, ptr};

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, Json, ToSql, Type};
#[cfg(feature = "postgres")]
use serde::{Deserialize, Serialize};

pub trait Validator<V>: Sync {
    type Error;

    fn validate_ref<'v>(
        &self,
        value: &'v V,
    ) -> impl Future<Output = Result<&'v Valid<V>, Self::Error>> + Send
    where
        V: Sync;

    fn validate(&self, value: V) -> impl Future<Output = Result<Valid<V>, Self::Error>> + Send
    where
        V: Send + Sync,
    {
        async move {
            self.validate_ref(&value).await?;
            Ok(Valid { value })
        }
    }
}

impl<V, T> Validator<Arc<V>> for T
where
    V: Send + Sync,
    T: Validator<V> + Sync,
{
    type Error = T::Error;

    async fn validate_ref<'v>(&self, value: &'v Arc<V>) -> Result<&'v Valid<Arc<V>>, Self::Error>
    where
        V: Sync,
    {
        self.validate_ref(value.as_ref()).await?;
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
    T: Deserialize<'de>,
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
    T: Serialize + Debug,
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
