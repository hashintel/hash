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

/// Time axis for the [`Image`] used in [`TimeProjection`]s.
///
/// This is used as the generic argument to time-related structs. Please refer to the documentation
/// of [`TimeProjection`] for more information.
///
/// [`Image`]: crate::identifier::time::VariableTemporalAxis
/// [`TimeProjection`]: crate::identifier::time::TemporalAxes
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ProjectedTime;

pub trait TemporalTagged {
    type Axis;
    type Tagged<A>: TemporalTagged<Axis = A>;

    fn cast<A>(self) -> Self::Tagged<A>;
}
