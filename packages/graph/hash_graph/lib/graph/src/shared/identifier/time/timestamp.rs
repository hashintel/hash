use core::fmt;
use std::{
    any::type_name, collections::Bound, error::Error, marker::PhantomData, str::FromStr,
    time::SystemTime,
};

use chrono::{DateTime, Utc};
use derivative::Derivative;
use interval_ops::LowerBound;
use postgres_types::{private::BytesMut, FromSql, ToSql, Type};
use serde::{Deserialize, Serialize};
use utoipa::{openapi, ToSchema};

/// Opaque structure to represent a single point in time.
///
/// The type parameter `A` is the time axis to distinguish between different time axes at compile
/// time.
// A generic parameter is used here to avoid implementing the same struct multiple times or using
// macros. It's reused in other time-related structs as well. This implies that trait bounds are
// not required for trait implementations.
#[derive(Derivative, Serialize, Deserialize)]
#[derivative(
    Copy(bound = ""),
    Clone(bound = ""),
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = ""),
    PartialOrd(bound = ""),
    Ord(bound = "")
)]
#[serde(transparent, bound = "")]
pub struct Timestamp<A> {
    #[serde(skip)]
    axis: PhantomData<A>,
    time: DateTime<Utc>,
}

impl<A> LowerBound<Self> for Timestamp<A> {
    fn as_bound(&self) -> Bound<&Self> {
        Bound::Included(self)
    }

    fn into_bound(self) -> Bound<Self> {
        Bound::Included(self)
    }

    fn from_bound(bound: Bound<Self>) -> Self {
        match bound {
            Bound::Included(timestamp) => timestamp,
            Bound::Excluded(_) => {
                unimplemented!(
                    "Excluded bounds are not permitted as lower bounds for version intervals"
                )
            }
            Bound::Unbounded => {
                unimplemented!(
                    "Unbounded bounds are not permitted as lower bounds for version intervals"
                )
            }
        }
    }
}

impl<A> fmt::Debug for Timestamp<A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("timestamp")
            .field("axis", &type_name::<A>())
            .field("time", &self.time)
            .finish()
    }
}

impl<A> fmt::Display for Timestamp<A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.time, fmt)
    }
}

impl<A> Timestamp<A> {
    #[must_use]
    pub fn now() -> Self {
        Self {
            axis: PhantomData,
            time: DateTime::from(SystemTime::now()),
        }
    }

    #[must_use]
    pub const fn cast<T>(self) -> Timestamp<T> {
        Timestamp {
            axis: PhantomData,
            time: self.time,
        }
    }

    #[must_use]
    pub const fn from_anonymous(time: Timestamp<()>) -> Self {
        Self {
            axis: PhantomData,
            time: time.time,
        }
    }
}

impl<A> FromStr for Timestamp<A> {
    type Err = chrono::ParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self {
            axis: PhantomData,
            time: DateTime::from_str(s)?,
        })
    }
}

impl<'a> FromSql<'a> for Timestamp<()> {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self {
            axis: PhantomData,
            time: DateTime::from_sql(ty, raw)?,
        })
    }

    fn accepts(ty: &Type) -> bool {
        <SystemTime as FromSql>::accepts(ty)
    }
}

impl<A> ToSql for Timestamp<A> {
    fn to_sql(
        &self,
        ty: &Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn Error + Sync + Send>> {
        self.time.to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool {
        <SystemTime as ToSql>::accepts(ty)
    }

    fn to_sql_checked(
        &self,
        ty: &Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn Error + Sync + Send>> {
        self.time.to_sql_checked(ty, out)
    }
}

impl<A> ToSchema for Timestamp<A> {
    fn schema() -> openapi::RefOr<openapi::Schema> {
        openapi::schema::ObjectBuilder::new()
            .schema_type(openapi::SchemaType::String)
            .format(Some(openapi::SchemaFormat::KnownFormat(
                openapi::KnownFormat::DateTime,
            )))
            .into()
    }
}
