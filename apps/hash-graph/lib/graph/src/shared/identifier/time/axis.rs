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

/// Time axis for the variable temporal axis used in [`TimeProjection`]s.
///
/// This is used as the generic argument to time-related structs. Please refer to the documentation
/// of [`TemporalAxes`] for more information.
///
/// [`TemporalAxes`]: crate::identifier::time::TemporalAxes
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash)]
pub struct VariableAxis;

/// Time axis for the pinned temporal axis used in [`TimeProjection`]s.
///
/// This is used as the generic argument to time-related structs. Please refer to the documentation
/// of [`TemporalAxes`] for more information.
///
/// [`TemporalAxes`]: crate::identifier::time::TemporalAxes
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash)]
pub struct PinnedAxis;

pub trait TemporalTagged {
    type Axis;
    type Tagged<A>: TemporalTagged<Axis = A>;

    fn cast<A>(self) -> Self::Tagged<A>;
}
