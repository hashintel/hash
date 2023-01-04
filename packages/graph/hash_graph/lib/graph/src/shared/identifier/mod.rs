use std::{
    fmt,
    ops::{Bound, RangeBounds},
    str::FromStr,
};

use chrono::{DateTime, Utc};
use postgres_protocol::types::{Range, RangeBound};
use postgres_types::{FromSql, Type};
use serde::{Deserialize, Serialize};
use serde_json;
use tokio_postgres::types::ToSql;
use type_system::uri::BaseUri;
use utoipa::{openapi, ToSchema};

use crate::identifier::{
    knowledge::{EntityEditionId, EntityId},
    ontology::OntologyTypeEditionId,
};

pub mod account;
pub mod knowledge;
pub mod ontology;

#[derive(
    Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, ToSql,
)]
#[serde(transparent)]
#[postgres(transparent)]
pub struct DecisionTimestamp(DateTime<Utc>);

impl fmt::Display for DecisionTimestamp {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> std::fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl FromStr for DecisionTimestamp {
    type Err = chrono::ParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self(DateTime::from_str(s)?))
    }
}

#[derive(
    Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, ToSql,
)]
#[serde(transparent)]
#[postgres(transparent)]
pub struct TransactionTimestamp(DateTime<Utc>);

impl TransactionTimestamp {
    #[must_use]
    pub const fn as_date_time(&self) -> DateTime<Utc> {
        self.0
    }
}

impl fmt::Display for TransactionTimestamp {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> std::fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl FromStr for TransactionTimestamp {
    type Err = chrono::ParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self(DateTime::from_str(s)?))
    }
}

// WARNING: This MUST be kept up to date with the struct names and serde attributes
//   Necessary because `DateTime` doesn't implement ToSchema
impl ToSchema for TransactionTimestamp {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .schema_type(openapi::SchemaType::String)
            .format(Some(openapi::SchemaFormat::KnownFormat(
                openapi::KnownFormat::DateTime,
            )))
            .into()
    }
}

#[derive(Debug, Copy, Clone, Hash, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct Timespan {
    start: Bound<DateTime<Utc>>,
    end: Bound<DateTime<Utc>>,
}

impl FromSql<'_> for Timespan {
    fn from_sql(_: &Type, buf: &[u8]) -> Result<Self, Box<dyn std::error::Error + Sync + Send>> {
        fn parse_bound(
            bound: &RangeBound<Option<&[u8]>>,
        ) -> Result<Bound<DateTime<Utc>>, Box<dyn std::error::Error + Send + Sync>> {
            Ok(match bound {
                RangeBound::Inclusive(None) | RangeBound::Exclusive(None) => {
                    unimplemented!("null ranges are not supported")
                }
                RangeBound::Inclusive(Some(bytes)) => {
                    let timestamp = DateTime::from_sql(&Type::TIMESTAMPTZ, bytes)?;
                    Bound::Included(timestamp)
                }
                RangeBound::Exclusive(Some(bytes)) => {
                    let timestamp = DateTime::from_sql(&Type::TIMESTAMPTZ, bytes)?;
                    Bound::Excluded(timestamp)
                }
                RangeBound::Unbounded => Bound::Unbounded,
            })
        }

        match postgres_protocol::types::range_from_sql(buf)? {
            Range::Empty => unimplemented!("Empty ranges are not supported"),
            Range::Nonempty(lower, upper) => Ok(Self {
                start: parse_bound(&lower)?,
                end: parse_bound(&upper)?,
            }),
        }
    }

    fn accepts(ty: &Type) -> bool {
        matches!(ty, &Type::TSTZ_RANGE)
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize, Deserialize)]
pub struct DecisionTimespan {
    start_bound: Bound<DecisionTimestamp>,
    end_bound: Bound<DecisionTimestamp>,
}

impl DecisionTimespan {
    #[must_use]
    pub(crate) fn new(timespan: Timespan) -> Self {
        Self {
            start_bound: timespan.start.map(DecisionTimestamp),
            end_bound: timespan.end.map(DecisionTimestamp),
        }
    }
}

impl RangeBounds<DecisionTimestamp> for DecisionTimespan {
    fn start_bound(&self) -> Bound<&DecisionTimestamp> {
        self.start_bound.as_ref()
    }

    fn end_bound(&self) -> Bound<&DecisionTimestamp> {
        self.end_bound.as_ref()
    }
}

impl<R: RangeBounds<DateTime<Utc>>> From<R> for DecisionTimespan {
    fn from(range: R) -> Self {
        Self {
            start_bound: range.start_bound().cloned().map(DecisionTimestamp),
            end_bound: range.end_bound().cloned().map(DecisionTimestamp),
        }
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransactionTimespan {
    start_bound: Bound<TransactionTimestamp>,
    end_bound: Bound<TransactionTimestamp>,
}

impl TransactionTimespan {
    #[must_use]
    pub(crate) fn new(timespan: Timespan) -> Self {
        Self {
            start_bound: timespan.start.map(TransactionTimestamp),
            end_bound: timespan.end.map(TransactionTimestamp),
        }
    }

    // TODO: Remove when exposing temporal versions to backend
    //   see https://app.asana.com/0/0/1203444301722133/f
    #[must_use]
    pub(crate) fn as_start_bound_timestamp(&self) -> TransactionTimestamp {
        let Bound::Included(timestamp) = self.start_bound() else { unreachable!("invalid bound") };
        *timestamp
    }
}

impl RangeBounds<TransactionTimestamp> for TransactionTimespan {
    fn start_bound(&self) -> Bound<&TransactionTimestamp> {
        self.start_bound.as_ref()
    }

    fn end_bound(&self) -> Bound<&TransactionTimestamp> {
        self.end_bound.as_ref()
    }
}

impl<R: RangeBounds<DateTime<Utc>>> From<R> for TransactionTimespan {
    fn from(range: R) -> Self {
        Self {
            start_bound: range.start_bound().cloned().map(TransactionTimestamp),
            end_bound: range.end_bound().cloned().map(TransactionTimestamp),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(untagged)]
pub enum GraphElementId {
    Ontology(BaseUri),
    KnowledgeGraph(EntityId),
}

// WARNING: This MUST be kept up to date with the enum variants.
//   We have to do this because utoipa doesn't understand serde untagged:
//   https://github.com/juhaku/utoipa/issues/320
impl ToSchema for GraphElementId {
    fn schema() -> openapi::Schema {
        openapi::OneOfBuilder::new()
            .item(openapi::Object::with_type(openapi::SchemaType::String))
            .example(Some(serde_json::json!(
                "6013145d-7392-4630-ab16-e99c59134cb6"
            )))
            .into()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(untagged)]
pub enum GraphElementEditionId {
    Ontology(OntologyTypeEditionId),
    KnowledgeGraph(EntityEditionId),
}

impl From<OntologyTypeEditionId> for GraphElementEditionId {
    fn from(id: OntologyTypeEditionId) -> Self {
        Self::Ontology(id)
    }
}

impl From<EntityEditionId> for GraphElementEditionId {
    fn from(id: EntityEditionId) -> Self {
        Self::KnowledgeGraph(id)
    }
}

// WARNING: This MUST be kept up to date with the enum variants.
//   We have to do this because utoipa doesn't understand serde untagged:
//   https://github.com/juhaku/utoipa/issues/320
impl ToSchema for GraphElementEditionId {
    fn schema() -> openapi::Schema {
        openapi::OneOfBuilder::new()
            .item(OntologyTypeEditionId::schema())
            .item(EntityEditionId::schema())
            .into()
    }
}
