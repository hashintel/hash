use alloc::borrow::Cow;
#[cfg(feature = "postgres")]
use core::error::Error;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
use hash_graph_temporal_versioning::{TemporalInterval, Timestamp};
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, ToSql, Type, WasNull};
use type_system::knowledge::PropertyValue;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum CursorField<'a> {
    Bool(bool),
    I32(i32),
    F64(f64),
    #[serde(borrow)]
    String(Cow<'a, str>),
    Timestamp(Timestamp<()>),
    TimeInterval(TemporalInterval<()>),
    Json(PropertyValue),
    Uuid(#[serde(with = "hash_codec::serde::valid_uuid")] Uuid),
}

impl CursorField<'_> {
    #[must_use]
    pub fn into_owned(self) -> CursorField<'static> {
        match self {
            Self::Bool(value) => CursorField::Bool(value),
            Self::I32(value) => CursorField::I32(value),
            Self::F64(value) => CursorField::F64(value),
            Self::String(value) => CursorField::String(Cow::Owned(value.into_owned())),
            Self::Timestamp(value) => CursorField::Timestamp(value),
            Self::TimeInterval(value) => CursorField::TimeInterval(value),
            Self::Json(value) => CursorField::Json(value),
            Self::Uuid(value) => CursorField::Uuid(value),
        }
    }
}

#[cfg(feature = "postgres")]
impl FromSql<'_> for CursorField<'static> {
    tokio_postgres::types::accepts!(
        BOOL,
        INT4,
        FLOAT8,
        TEXT,
        VARCHAR,
        TIMESTAMPTZ,
        TSTZ_RANGE,
        JSONB,
        UUID
    );

    fn from_sql(ty: &Type, raw: &[u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        match *ty {
            Type::BOOL => Ok(Self::Bool(bool::from_sql(ty, raw)?)),
            Type::INT4 => Ok(Self::I32(i32::from_sql(ty, raw)?)),
            Type::FLOAT8 => Ok(Self::F64(f64::from_sql(ty, raw)?)),
            Type::TEXT | Type::VARCHAR => Ok(Self::String(Cow::Owned(String::from_sql(ty, raw)?))),
            Type::TIMESTAMPTZ => Ok(Self::Timestamp(Timestamp::from_sql(ty, raw)?)),
            Type::TSTZ_RANGE => Ok(Self::TimeInterval(TemporalInterval::from_sql(ty, raw)?)),
            Type::JSONB => Ok(Self::Json(PropertyValue::from_sql(ty, raw)?)),
            Type::UUID => Ok(Self::Uuid(Uuid::from_sql(ty, raw)?)),
            _ => Err(format!("Unsupported type: {ty}").into()),
        }
    }

    fn from_sql_null(ty: &Type) -> Result<Self, Box<dyn Error + Sync + Send>> {
        match *ty {
            Type::JSONB => Ok(Self::Json(PropertyValue::Null)),
            _ => Err(Box::new(WasNull)),
        }
    }
}

#[cfg(feature = "postgres")]
impl ToSql for CursorField<'_> {
    tokio_postgres::types::accepts!(
        BOOL,
        INT4,
        FLOAT8,
        TEXT,
        VARCHAR,
        TIMESTAMPTZ,
        TSTZ_RANGE,
        JSONB,
        UUID
    );

    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        match self {
            Self::Bool(value) => value.to_sql(ty, out),
            Self::I32(value) => value.to_sql(ty, out),
            Self::F64(value) => value.to_sql(ty, out),
            Self::String(value) => value.to_sql(ty, out),
            Self::Timestamp(value) => value.to_sql(ty, out),
            Self::TimeInterval(value) => value.to_sql(ty, out),
            Self::Json(value) => value.to_sql(ty, out),
            Self::Uuid(value) => value.to_sql(ty, out),
        }
    }
}
