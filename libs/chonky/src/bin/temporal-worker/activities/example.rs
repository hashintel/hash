use core::time::Duration;

use temporal_sdk::{ActContext, ActivityError};
use tokio::time::sleep;

pub(crate) const ID: &str = "example-activity";

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Operator {
    Add,
    Sub,
    Mul,
    Div,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub(crate) struct ExampleInputs {
    pub lhs: f64,
    pub rhs: f64,
    pub operator: Operator,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub(crate) struct ExampleOutputs {
    result: f64,
}

pub(crate) async fn example_activity(
    _context: ActContext,
    inputs: ExampleInputs,
) -> Result<ExampleOutputs, ActivityError> {
    sleep(Duration::from_secs(5)).await;
    Ok(ExampleOutputs {
        #[expect(clippy::float_arithmetic)]
        result: match inputs.operator {
            Operator::Add => inputs.lhs + inputs.rhs,
            Operator::Sub => inputs.lhs - inputs.rhs,
            Operator::Mul => inputs.lhs * inputs.rhs,
            Operator::Div => inputs.lhs / inputs.rhs,
        },
    })
}
