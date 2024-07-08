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

#[cfg(feature = "postgres")]
use core::error::Error;
use core::{borrow::Borrow, fmt::Debug, ops::Deref, ptr};

#[cfg(feature = "postgres")]
use postgres_types::{private::BytesMut, FromSql, IsNull, Json, ToSql, Type};
#[cfg(feature = "postgres")]
use serde::{Deserialize, Serialize};

pub use self::schema::{
    ClosedEntityType, DataType, DataTypeReference, EntityType, EntityTypeReference, PropertyType,
    PropertyTypeReference,
};

pub trait Validator<V>: Sync {
    type Error;
    type Validated: Sized + From<V>;

    fn validate_ref<'v>(
        &self,
        value: &'v V,
    ) -> impl Future<Output = Result<&'v Valid<V>, Self::Error>> + Send
    where
        V: Sync;

    fn validate(
        &self,
        value: V,
    ) -> impl Future<Output = Result<Valid<Self::Validated>, Self::Error>> + Send
    where
        V: Send + Sync,
    {
        async move {
            self.validate_ref(&value).await?;
            Ok(Valid {
                value: value.into(),
            })
        }
    }
}

// impl<T, V, R, E> Validator<V> for T
// where
//     T: Fn(&V) -> R,
//     R: Future<Output = Result<(), E>>,
// {
//     type Error = E;
//     type Validated = V;
//
//     async fn validate_ref(&self, value: &V) -> Result<Valid<&V>, Self::Error> {
//         self(value).await?;
//         Ok(Valid { value })
//     }
// }

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
