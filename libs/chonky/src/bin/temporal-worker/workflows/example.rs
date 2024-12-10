use core::time::Duration;

use temporal_sdk::{ActivityOptions, WfContext, WfExitValue, WorkflowResult};
use temporal_sdk_core_protos::{
    coresdk::FromJsonPayloadExt as _, temporal::api::common::v1::RetryPolicy,
};

use crate::activities::example::ExampleOutputs;

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub(crate) enum WorkflowError {
    #[display("expected exactly one input, got {_0} inputs were provided")]
    #[error(ignore)]
    UnexpectedInputNumber(usize),
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("activity finished with no result")]
pub(crate) struct NoActivityOutputError;

pub(crate) const ID: &str = "example-workflow";

pub(crate) async fn example_workflow(context: WfContext) -> WorkflowResult<ExampleOutputs> {
    // We potentially could have more than one input but we only support one for now
    let [payload] = context.get_args() else {
        return Err(WorkflowError::UnexpectedInputNumber(context.get_args().len()).into());
    };

    let activity_output_payload = context
        .activity(ActivityOptions {
            activity_type: crate::activities::example::ID.to_owned(),
            // The activity is expected to take no more than 10 seconds
            schedule_to_close_timeout: Some(Duration::from_secs(10)),
            // The payload can directly be forwarded to the activity
            input: payload.clone(),
            retry_policy: Some(RetryPolicy {
                maximum_attempts: 3,
                ..RetryPolicy::default()
            }),
            ..ActivityOptions::default()
        })
        .await
        .success_payload_or_error()?
        .ok_or(NoActivityOutputError)?;
    Ok(ExampleOutputs::from_json_payload(&activity_output_payload).map(WfExitValue::Normal)?)
}
