use serde::{Deserialize, Serialize};
use utoipa::{openapi, openapi::Schema, ToSchema};

use crate::identifier::time::{
    projection::Projection, TimespanBound, UnresolvedImage, UnresolvedKernel, UnresolvedProjection,
};

/// Time axis for the decision time.
///
/// This is used as the generic argument to time-related structs and can be used as tag value.
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub enum DecisionTime {
    #[default]
    Decision,
}

/// Time axis for the transaction time.
///
/// This is used as the generic argument to time-related structs and can be used as tag value.
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub enum TransactionTime {
    #[default]
    Transaction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum UnresolvedTimeProjection {
    DecisionTime(UnresolvedProjection<TransactionTime, DecisionTime>),
    TransactionTime(UnresolvedProjection<DecisionTime, TransactionTime>),
}

impl Default for UnresolvedTimeProjection {
    fn default() -> Self {
        Self::DecisionTime(UnresolvedProjection {
            kernel: UnresolvedKernel::new(None),
            image: UnresolvedImage::new(
                Some(TimespanBound::Unbounded),
                Some(TimespanBound::Unbounded),
            ),
        })
    }
}

impl UnresolvedTimeProjection {
    #[must_use]
    pub fn resolve(self) -> TimeProjection {
        match self {
            Self::DecisionTime(projection) => TimeProjection::DecisionTime(projection.resolve()),
            Self::TransactionTime(projection) => {
                TimeProjection::TransactionTime(projection.resolve())
            }
        }
    }
}

impl ToSchema for UnresolvedTimeProjection {
    fn schema() -> Schema {
        openapi::OneOfBuilder::new()
            .item(openapi::Ref::from_schema_name(
                "UnresolvedDecisionTimeProjection",
            ))
            .item(openapi::Ref::from_schema_name(
                "UnresolvedTransactionTimeProjection",
            ))
            .into()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TimeProjection {
    DecisionTime(Projection<TransactionTime, DecisionTime>),
    TransactionTime(Projection<DecisionTime, TransactionTime>),
}

impl ToSchema for TimeProjection {
    fn schema() -> Schema {
        openapi::OneOfBuilder::new()
            .item(openapi::Ref::from_schema_name("DecisionTimeProjection"))
            .item(openapi::Ref::from_schema_name("TransactionTimeProjection"))
            .into()
    }
}
