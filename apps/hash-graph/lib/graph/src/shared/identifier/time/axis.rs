use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Time axis for the decision time.
///
/// This is used as the generic argument to time-related structs and can be used as tag value.
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub enum DecisionTime {
    #[default]
    DecisionTime,
}

/// Time axis for the transaction time.
///
/// This is used as the generic argument to time-related structs and can be used as tag value.
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub enum TransactionTime {
    #[default]
    TransactionTime,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TimeAxis {
    DecisionTime,
    TransactionTime,
}

pub trait TemporalTagged {
    type Axis;
    type Tagged<A>: TemporalTagged<Axis = A>;

    fn cast<A>(self) -> Self::Tagged<A>;
}

/// Marker trait for any temporal axis.
///
/// Contains useful metadata about the temporal axis.
pub trait TemporalAxis {
    /// The name of the temporal axis.
    fn noun() -> &'static str;
}

impl TemporalAxis for DecisionTime {
    fn noun() -> &'static str {
        "Decision"
    }
}

impl TemporalAxis for TransactionTime {
    fn noun() -> &'static str {
        "Transaction"
    }
}
