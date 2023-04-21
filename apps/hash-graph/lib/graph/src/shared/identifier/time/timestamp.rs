use core::fmt;
use std::{error::Error, marker::PhantomData, str::FromStr, time::SystemTime};

use derivative::Derivative;
use postgres_types::{private::BytesMut, FromSql, ToSql, Type};
use serde::{Deserialize, Serialize};
use time::{format_description::well_known::Iso8601, serde::iso8601, OffsetDateTime};
use utoipa::{openapi, ToSchema};

use crate::identifier::time::axis::TemporalTagged;

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
    #[serde(with = "iso8601")]
    time: OffsetDateTime,
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

impl<'a> FromSql<'a> for Timestamp<()> {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self {
            axis: PhantomData,
            time: OffsetDateTime::from_sql(ty, raw)?,
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
