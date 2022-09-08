use std::{error::Error as StdError, fmt};

use serde::{Deserialize, Serialize};

use crate::{
    agent::Agent,
    message::{payload, SYSTEM_MESSAGE},
    Result,
};

/// This error represents the prettified display string of any internal errors
/// encountered when parsing (preprocessing) an `Outbound` message
///
/// Debug required by From<Error> for `SimulationError`
#[derive(Debug)]
pub enum Error {
    // instead of having 2 error variants to represent a missing type, just encode it into the
    // 'got'
    InvalidMessageType(Option<String>),
    UnknownSerdeError(serde_json::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::InvalidMessageType(Some(received)) => write!(
                f,
                "I was expecting a system message type, but I got {}",
                received
            ),
            Error::InvalidMessageType(None) => write!(
                f,
                "I was expecting a system message type, but none was provided"
            ),
            Error::UnknownSerdeError(serde_error) => write!(f, "{}", serde_error),
        }
    }
}

impl StdError for Error {}

// We want Serde to deserialize a message to the correct enum variant, and to do so, we need to
// emulate tagged unions. The matter is complicated by the fact that our tag, the field "type", can
// be any string! So we want to pick the Message::CreateAgent variant if "type" is "create_agent",
// Message::RemoveAgent if "type" is "remove_agent", and Message::Generic if "type" has any other
// value.
//
// To do this, we create two enums with a single variant, CreateAgent and RemoveAgent.
// Message::CreateAgent has a field "type" of type CreateAgent: this means that serde will match it
// correctly when "type" is "create_agent"! Same holds for "remove_agent". Finally, if it cannot
// match either variant, Serde will fall back to Message::Generic.
//
// Since we are at it, I've also done the same with the "hash" id, as it is another requirement for
// Message::CreateAgent and Message::RemoveAgent.
/// A message sent by an [`Agent`].
///
/// Currently, three types of [built-in messages] are available: `"create_agent"`, `"remove_agent"`,
/// and `"stop"`. For [messages sent] to other agents, a [`Generic`] message is used.
///
/// [built-in messages]: https://hash.ai/docs/simulation/creating-simulations/agent-messages/built-in-message-handlers
/// [messages sent]: https://hash.ai/docs/simulation/creating-simulations/agent-messages/sending-messages
/// [`Generic`]: Self::Generic
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(untagged)]
#[allow(clippy::large_enum_variant)]
pub enum Message {
    /*

    TUTORIAL: ADD A NEW MESSAGE TYPE

    Messages sent to the special id "hash" are special, and you can add
    a custom message type here to handle them.

    1) Pick a name for the message. Let's say CloneAgent

    2) Add the variant inside OutboundMessage, along with the inner struct:

        CloneAgent(payload::CloneAgent)

    3) Define the inner struct:

        #[derive(Clone, Serialize, Deserialize, Debug)]
        pub struct CloneAgent {
           r#type: kind::CloneAgent,
           to: hash,
           pub data: payload::CloneAgentData,
        }

    4) Define a special, one-variant enum named CloneAgent: it will allow
       serde to deserialize to the correct message variant.

        #[derive(Clone, Serialize, Deserialize, Debug)]
        enum CloneAgent {
            #[serde(rename = "clone_agent")]
            Type,
        }

    5) Define the payload, that is, the shape of the "data" field.

        #[derive(Clone, Serialize, Deserialize, Debug)]
        pub struct CloneAgentData {
            pub agent_id: String,
            pub agent_name_prefix: String,
            // whatever you want
        }

    Done! Now a JSON message with the following shape will be deserialized
    as an OutboundMessage::CloneAgent:

        {
            "to": "hash",
            "type": "clone_agent",
            "data": {
                "agent_id": "agent_id_to_clone",
                "agent_name_prefix": "foo_"
            }
        }

    */
    /// `"create_agent"` sent to `"hash"` will create a new agent specified by its payload.
    CreateAgent(payload::CreateAgent),
    /// `"remove_agent"` sent to `"hash"` will remove the specified agent.
    RemoveAgent(payload::RemoveAgent),
    /// `"stop"` sent to `"hash"` will attempt to stop the current simulation run.
    StopSim(payload::StopSim),
    /// A message to be sent between agents with a JSON payload
    Generic(payload::Generic),
}

fn is_system_message(kind: &str) -> bool {
    kind == payload::CreateAgent::KIND || kind == payload::RemoveAgent::KIND
}

impl Message {
    pub(in crate::message) fn new(to: &[&str], r#type: &str, data_string: &str) -> Result<Message> {
        let to_clone = to.iter().map(|v| (*v).to_string()).collect();

        Ok(Self::Generic(payload::Generic {
            to: to_clone,
            r#type: r#type.to_string(),
            data: if data_string.is_empty() {
                None
            } else {
                Some(serde_json::Value::from(data_string))
            },
        }))
    }

    fn is_json_message_remove_agent(value: &serde_json::Value) -> bool {
        if let Some(serde_json::Value::String(kind)) = value.get("type") {
            return kind == payload::RemoveAgent::KIND;
        }
        false
    }

    fn infer_remove_agent_with_state(
        value: &mut serde_json::Value,
        state: &Agent,
    ) -> Result<(), Error> {
        if value.get("data").is_none() {
            if let Some(obj) = value.as_object_mut() {
                let agent_id = state.agent_id;
                match serde_json::to_value(payload::RemoveAgentData { agent_id }) {
                    Ok(value) => {
                        obj.insert(String::from("data"), value);
                    }
                    Err(why) => return Err(Error::UnknownSerdeError(why)),
                }
            }
        }
        Ok(())
    }

    fn ensure_has_recipient(value: &mut serde_json::Value) {
        if value.get("to").is_none() {
            if let Some(obj) = value.as_object_mut() {
                obj.insert(
                    String::from("to"),
                    serde_json::Value::Array(vec![serde_json::Value::String(
                        SYSTEM_MESSAGE.to_string(),
                    )]),
                );
            }
        }
    }

    /// preprocess should be used as the main driver for the custom deserializer for
    /// outbound messages. This acts as a gate / validator for messages before they are fully
    /// parsed, providing nicer error messages and sensible, stateful defaults
    fn preprocess(value: &mut serde_json::Value, state: &Agent) -> Result<(), Error> {
        // if the message has a recipient, and the recipient is the hash engine, make sure its a
        // valid message type
        Message::ensure_has_recipient(value);
        if Message::is_hash_engine_message(value) {
            Message::ensure_is_valid_hash_engine_message(value)?;
        }
        if Message::is_json_message_remove_agent(value) {
            Message::infer_remove_agent_with_state(value, state)?;
        }
        Ok(())
    }

    fn is_hash_engine_message(value: &mut serde_json::Value) -> bool {
        if let Some(serde_json::Value::String(recipient)) = value.get("to") {
            return recipient.eq_ignore_ascii_case(SYSTEM_MESSAGE);
        }
        false
    }

    /// `ensure_is_valid_hash_engine_message` will return an error if the type of system message
    /// does not match an expected type. This is used as a nicer error alternative to
    /// serdes missing variant error
    fn ensure_is_valid_hash_engine_message(value: &serde_json::Value) -> Result<(), Error> {
        // message is intended for hash already, so only ensure type
        if let Some(serde_json::Value::String(kind)) = value.get("type") {
            // since all keys stored inside the system message types are lower case, we should also
            // lowercase the kind here too
            if is_system_message(&kind.to_ascii_lowercase()) {
                return Ok(());
            }
            // otherwise throw an error
            // we were only borrowing this data from the above message, so to be nice we copy the
            // string for our error. I'm sure as an optimization in the future seeing as how an
            // error is the end of life for message preprocessing we can just take it by value
            // instead.
            return Err(Error::InvalidMessageType(Some(kind.to_owned())));
        }
        Err(Error::InvalidMessageType(None))
    }

    /// # Errors
    /// This function will error if the provided `value` is not valid json
    /// OR if the `Outbound::preprocess` function fails.
    fn from_json_value_with_state(
        mut value: serde_json::Value,
        agent_state: &Agent,
    ) -> Result<Message, Error> {
        Message::preprocess(&mut value, agent_state)?;
        match serde_json::from_value(value) {
            Ok(msg) => Ok(msg),
            Err(serde_err) => Err(Error::UnknownSerdeError(serde_err)),
        }
    }

    /// # Errors
    /// This function will return any errors encountered by calling
    /// `Outbound::from_json_array_with_state` on each element in the provided array.
    ///
    /// This function will panic if `value` is not a valid JSON array.
    /// TODO: Make sure this function is named as unchecekd to prevent unknown panics
    pub(crate) fn from_json_array_with_state(
        value: serde_json::Value,
        agent_state: &Agent,
    ) -> Result<Vec<Message>, Error> {
        match value {
            serde_json::Value::Array(items) => {
                let mut messages = Vec::with_capacity(items.len());
                for json_value in items {
                    messages.push(Message::from_json_value_with_state(
                        json_value,
                        agent_state,
                    )?);
                }
                Ok(messages)
            }
            // this should not happen
            _ => panic!("from_json_array_with_state() called with non array json value"),
        }
    }
}
