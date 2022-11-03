use super::{error::JavaScriptResult, utils::new_js_string, Object};
use crate::runner::{JavaScriptError, MessageTarget};

pub(in crate::runner::javascript) fn get_next_task<'s>(
    scope: &mut v8::HandleScope<'s>,
    return_val: Object<'s>,
) -> JavaScriptResult<(MessageTarget, String)> {
    let target = new_js_string(scope, "target");

    let target = if let Some(target) = return_val.get(scope, target.into()) {
        if let Ok(target) = target.try_into() {
            let target: v8::Local<'s, v8::String> = target;
            let target = target.to_rust_string_lossy(scope);

            match target.as_str() {
                "JavaScript" => MessageTarget::JavaScript,
                "Python" => MessageTarget::Python,
                "Rust" => MessageTarget::Rust,
                "Dynamic" => MessageTarget::Dynamic,
                "Main" => MessageTarget::Main,
                _ => return Err(JavaScriptError::UnknownTarget(target)),
            }
        } else {
            // If no target was specified, go back to simulation main loop by default.
            MessageTarget::Main
        }
    } else {
        // If no target was specified, go back to simulation main loop by default.
        MessageTarget::Main
    };

    let task = new_js_string(scope, "task");

    let next_task_payload = if let Some(task) = return_val.get(scope, task.into()) {
        if let Ok(task) = task.try_into() {
            let task: v8::Local<'s, v8::String> = task;
            task.to_rust_string_lossy(scope)
        } else {
            // TODO: Don't silently ignore non-string, non-null-or-undefined payloads
            "{}".to_string()
        }
    } else {
        // TODO: Don't silently ignore non-string, non-null-or-undefined payloads
        "{}".to_string()
    };

    Ok((target, next_task_payload))
}
