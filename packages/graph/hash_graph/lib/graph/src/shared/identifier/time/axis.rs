use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::identifier::time::{timestamp::Timestamp, version::VersionTimespan};

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
