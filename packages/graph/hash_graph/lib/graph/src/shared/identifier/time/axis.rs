use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::identifier::time::{
    timestamp::Timestamp, version::VersionTimespan, Image, Kernel, Projection, ResolvedProjection,
    TimespanBound,
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

pub type DecisionTimestamp = Timestamp<DecisionTime>;
pub type DecisionTimeVersionTimespan = VersionTimespan<DecisionTime>;
pub type DecisionTimeProjection = Projection<TransactionTime, DecisionTime>;
pub type ResolvedDecisionTimeProjection = ResolvedProjection<TransactionTime, DecisionTime>;

/// Time axis for the transaction time.
///
/// This is used as the generic argument to time-related structs and can be used as tag value.
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub enum TransactionTime {
    #[default]
    Transaction,
}

pub type TransactionTimestamp = Timestamp<TransactionTime>;
pub type TransactionTimeVersionTimespan = VersionTimespan<TransactionTime>;
pub type TransactionTimeProjection = Projection<DecisionTime, TransactionTime>;
pub type ResolvedTransactionTimeProjection = ResolvedProjection<DecisionTime, TransactionTime>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum TimeProjection {
    DecisionTime(DecisionTimeProjection),
    TransactionTime(TransactionTimeProjection),
}

impl Default for TimeProjection {
    fn default() -> Self {
        Self::DecisionTime(Projection {
            kernel: Kernel::new(None),
            image: Image::new(
                Some(TimespanBound::Unbounded),
                Some(TimespanBound::Unbounded),
            ),
        })
    }
}

impl TimeProjection {
    #[must_use]
    pub fn resolve(self) -> ResolvedTimeProjection {
        match self {
            Self::DecisionTime(projection) => {
                ResolvedTimeProjection::DecisionTime(projection.resolve())
            }
            Self::TransactionTime(projection) => {
                ResolvedTimeProjection::TransactionTime(projection.resolve())
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum ResolvedTimeProjection {
    DecisionTime(ResolvedDecisionTimeProjection),
    TransactionTime(ResolvedTransactionTimeProjection),
}
