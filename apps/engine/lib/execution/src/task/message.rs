use std::hint::unreachable_unchecked;

use serde::{Deserialize, Serialize};

use crate::{
    package::simulation::{
        context::ContextTaskMessage, init::InitTaskMessage, output::OutputTaskMessage,
        state::StateTaskMessage,
    },
    runner::MessageTarget,
    Result,
};

// TODO: Possibly come up with a better interface for distinguishing between types of TaskMessages
/// The possible variants of messages passed as part of a [`Task`]'s execution.
///
/// Refer to the [`Task`] docs for more information on how this is implemented, and how these
/// variants are defined.
///
/// [`Task`]: crate::task::Task
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum TaskMessage {
    Init(InitTaskMessage),
    Context(ContextTaskMessage),
    State(StateTaskMessage),
    Output(OutputTaskMessage),
}

/// A [`TaskMessage`] to be forwarded to the given [`MessageTarget`] as part of the execution of a
/// [`Task`].
///
/// [`Task`]: crate::task::Task
pub struct TargetedTaskMessage {
    pub target: MessageTarget,
    pub payload: TaskMessage,
}

/// Marks either the final [`TaskMessage`] of a [`Task`]'s execution chain, or indicates a
/// cancellation.
///
/// [`Task`]: crate::task::Task
#[derive(Debug, Clone)]
pub enum TaskResultOrCancelled {
    Result(TaskMessage),
    Cancelled,
}

impl TaskMessage {
    /// Removes contextually redundant information by extracting the inner [`TaskMessage`] type that
    /// is defined by a package.
    ///
    /// # Returns: `(inner, wrapper)`
    ///
    ///   * `inner` - The interior TaskMessage objects defined by a package
    ///   * `wrapper` - The two levels of nesting that were unwrapped from the inner
    ///
    ///
    /// # Reasoning:
    ///
    /// To have a flexible interface we use an enumeration to have a hierarchy of task message
    /// types. This causes complications when looking at serializing or deserializing as
    /// an enum effectively transforms the variants of [`TaskMessage`] into wrapper types
    /// like `Variant(inner)`. Because of this, the serialization causes multiple nested JSON
    /// objects.
    ///
    /// Due to the design, we can guarantee that the top *two* levels are redundant
    /// information for the recipients and senders of the messages themselves. [`TaskMessage`]
    /// acts as the root  object and is therefore not labelled within the JSON. The package-type
    /// variant, e.g. `InitTaskMessage` and the package variant, e.g. `JsPyInitTaskMessage`,
    /// will appear within the JSON object and can be removed. These two wrapping levels are
    /// returned alongside the nested JSON object.
    pub fn extract_inner_msg_with_wrapper(self) -> Result<(serde_json::Value, serde_json::Value)> {
        let json_val = serde_json::to_value(self)?;
        let (wrapper, inner_msg) = _swap_doubly_nested_val(json_val, serde_json::Value::Null);
        Ok((inner_msg, wrapper))
    }

    /// Tries to create a TaskMessage from a deserialized variant of a package's task message, and a
    /// wrapper JSON object like the one produced by [`extract_inner_msg_with_wrapper()`]. It does
    /// this by swapping the given value with the one that's doubly nested within the wrapper
    /// object.
    ///
    /// [`extract_inner_msg_with_wrapper()`]: Self::extract_inner_msg_with_wrapper
    ///
    /// # Parameters:
    ///
    ///  * `inner_msg`: The deserialized inner task message. The serialization of this should be
    ///    something like the following (take note that message type is not the root object or
    ///    serialization will fail):
    ///
    ///    ```json
    ///    { "Success": { "agent_json": "some_json" } }
    ///    ```
    ///
    ///   * `wrapper`: A (possibly incomplete) value representing a serialized `TaskMessage`.
    ///     Structure should match something like the following (take note that `"TaskMessage"` is
    ///     the root object and therefore does not appear as a key within the JSON):
    ///
    ///     ```json
    ///     { "askMessage": { "JsPyInitTaskMessage": null } }
    ///     ```
    ///
    ///
    /// ## Notes
    ///
    /// The somewhat confusing inconsistency with root objects is for ergonomics when using these
    /// functions within the context they were designed for, that is:
    ///
    ///   * Getting a [`TaskMessage`]
    ///   * Serializing the [`TaskMessage`]
    ///   * Extracting the inner to send to package-implemented runner code, and saving the wrapper
    ///   * Receiving a response, and using the previous wrapper to rewrap response
    ///   * Deserializing the response
    pub fn try_from_inner_msg_and_wrapper(
        inner_msg: serde_json::Value,
        wrapper: serde_json::Value,
    ) -> Result<Self> {
        let (json_val, _) = _swap_doubly_nested_val(wrapper, inner_msg);
        Ok(serde_json::from_value(json_val)?)
    }
}

fn _get_singleton_inner(
    object: &mut serde_json::Value,
) -> &mut serde_json::Map<String, serde_json::Value> {
    match object {
        serde_json::Value::Object(inner) => {
            debug_assert_eq!(inner.len(), 1);
            inner
        }
        _ => unreachable!(),
    }
}

/// Takes in a `serde_json::Value` with the assumption that its structure is doubly nested in
/// single-childrened objects with arbitrary keys:
// TODO: reenable test
/// ```ignore
/// SerdeValue::Object({
///     "some_key1": SerdeValue::Object({
///         "some_key2": SerdeValue::Object({
///             "some_key_3": inner_value
///         }),
///     }),
/// })
/// ```
/// It then swaps the inner_value with a given serde_json::Value, returning the resultant Object
/// and extracted nested inner
fn _swap_doubly_nested_val(
    mut object_map: serde_json::Value,
    mut value_to_swap: serde_json::Value,
) -> (serde_json::Value, serde_json::Value) {
    let inner = _get_singleton_inner(&mut object_map);
    let nested_val = if let Some((_, nested_val)) = inner.iter_mut().next() {
        nested_val
    } else {
        debug_assert!(false);
        // safe as we check in get_singleton_inner that len == 1
        unsafe { unreachable_unchecked() }
    };

    let second_nested_val = _get_singleton_inner(nested_val);
    let key = second_nested_val.keys().next().unwrap().to_owned();

    second_nested_val
        .entry(key)
        .and_modify(|val| std::mem::swap(val, &mut value_to_swap));

    (object_map, value_to_swap)
}
