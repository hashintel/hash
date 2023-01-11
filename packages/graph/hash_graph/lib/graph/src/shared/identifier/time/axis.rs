use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TimeAxis {
    DecisionTime,
    TransactionTime,
}

/// Time axis for the projected image time.
///
/// This is used as the generic argument to time-related structs.
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ProjectedTime;
