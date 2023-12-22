use core::fmt;
#[cfg(feature = "postgres")]
use std::error::Error;
use std::{cmp::Ordering, marker::PhantomData, str::FromStr};

#[cfg(feature = "postgres")]
use bytes::BytesMut;
use derivative::Derivative;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, ToSql, Type};
use serde::{Deserialize, Serialize};
use time::{format_description::well_known::Iso8601, OffsetDateTime};
#[cfg(feature = "utoipa")]
use utoipa::{openapi, ToSchema};

use crate::TemporalTagged;

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
    PartialEq(bound = ""),
    Eq(bound = ""),
    Hash(bound = ""),
    Ord(bound = "")
)]
#[serde(transparent, bound = "")]
pub struct Timestamp<A> {
    #[serde(skip)]
    axis: PhantomData<A>,
    #[serde(with = "crate::serde::time")]
    time: OffsetDateTime,
}

impl<A> PartialOrd for Timestamp<A> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<A> Clone for Timestamp<A> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<A> fmt::Debug for Timestamp<A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.time, fmt)
    }
}

impl<A> fmt::Display for Timestamp<A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.time, fmt)
    }
}

impl<A> TemporalTagged for Timestamp<A> {
    type Axis = A;
    type Tagged<T> = Timestamp<T>;

    fn cast<T>(self) -> Timestamp<T> {
        Timestamp {
            axis: PhantomData,
            time: self.time,
        }
    }
}

impl<A> Timestamp<A> {
    pub const UNIX_EPOCH: Self = Self {
        axis: PhantomData,
        time: OffsetDateTime::UNIX_EPOCH,
    };

    #[must_use]
    pub fn now() -> Self {
        Self {
            axis: PhantomData,
            time: OffsetDateTime::now_utc(),
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
    type Err = time::error::Parse;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self {
            axis: PhantomData,
            time: OffsetDateTime::parse(s, &Iso8601::PARSING)?,
        })
    }
}

#[cfg(feature = "postgres")]
impl<'a, A> FromSql<'a> for Timestamp<A> {
    postgres_types::accepts!(TIMESTAMPTZ);

    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self {
            axis: PhantomData,
            time: OffsetDateTime::from_sql(ty, raw)?,
        })
    }
}

#[cfg(feature = "postgres")]
impl<A> ToSql for Timestamp<A> {
    postgres_types::accepts!(TIMESTAMPTZ);

    postgres_types::to_sql_checked!();

    fn to_sql(
        &self,
        ty: &Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn Error + Sync + Send>> {
        self.time.to_sql(ty, out)
    }
}

#[cfg(feature = "utoipa")]
impl<A> ToSchema<'_> for Timestamp<A> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "Timestamp",
            openapi::schema::ObjectBuilder::new()
                .schema_type(openapi::SchemaType::String)
                .format(Some(openapi::SchemaFormat::KnownFormat(
                    openapi::KnownFormat::DateTime,
                )))
                .into(),
        )
    }
}
