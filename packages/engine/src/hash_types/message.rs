use std::{collections::HashMap, fmt};

use serde::{de::Deserializer, Deserialize, Serialize};

use super::{error::Result, state::Agent};
use crate::datastore::arrow::message::{CREATE_AGENT, REMOVE_AGENT, SYSTEM_MESSAGE};

/*
 * We want Serde to deserialize a message to the correct enum variant,
 * and to do so, we need to emulate tagged unions. The matter is complicated
 * by the fact that our tag, the field "type", can be any string! So we want
 * to pick the Message::CreateAgent variant if "type" is "create_agent",
 * Message::RemoveAgent if "type" is "remove_agent", and Message::Generic if
 * "type" has any other value.
 *
 * To do this, we create two enums with a single variant, CreateAgent and
 * RemoveAgent. Message::CreateAgent has a field "type" of type CreateAgent:
 * this means that serde will match it correctly when "type" is "create_agent"!
 * Same holds for "remove_agent". Finally, if it cannot match either variant,
 * Serde will fall back to Message::Generic.
 *
 * Since we are at it, I've also done the same with the "hash" id, as it is
 * another requirement for Message::CreateAgent and Message::RemoveAgent.
 */
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(untagged)]
pub enum Outbound {
    /*

    TUTORIAL: ADD A NEW MESSAGE TYPE

    Messages sent to the special id "hash" are special, and you can add
    a custom message type here to handle them.

    1) Pick a name for the message. Let's say CloneAgent

    2) Add the variant inside OutboundMessage, alongh with the inner struct:

        CloneAgent(OutboundCloneAgentMessage)

    3) Define the inner struct:

        #[derive(Clone, Serialize, Deserialize, Debug)]
        pub struct OutboundCloneAgentMessage {
           r#type: CloneAgent,
           to: hash,
           pub data: CloneAgentPayload,
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
        pub struct CloneAgentPayload {
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
    CreateAgent(OutboundCreateAgentPayload),
    RemoveAgent(OutboundRemoveAgentPayload),
    StopSim(OutboundStopSimPayload),
    Generic(GenericPayload),
}

#[test]
// the goal of this test is to check whether or not 'remove_agent' messages automatically
// have their data (agent to remove's id and hash system recipient) filled out during json_decoding
fn ensure_blank_remove_agent_is_inferred() -> Result<()> {
    let state: Agent = serde_json::from_str(
        r#"
        {
            "agent_name": "0",
            "messages": [
                {
                    "type": "remove_agent"
                }
            ]
        }
        "#,
    )?;
    if let Some(Outbound::RemoveAgent(OutboundRemoveAgentPayload { data, .. })) =
        state.messages.get(0)
    {
        assert_eq!(state.agent_id, data.agent_id);
    }
    Ok(())
}

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

fn is_system_message(kind: &str) -> bool {
    kind == CREATE_AGENT || kind == REMOVE_AGENT
}

impl Outbound {
    #[must_use]
    pub fn new(msg: GenericPayload) -> Outbound {
        Outbound::Generic(msg)
    }

    fn is_json_message_remove_agent(value: &serde_json::Value) -> bool {
        if let Some(serde_json::Value::String(kind)) = value.get("type") {
            return kind == REMOVE_AGENT;
        }
        false
    }

    fn infer_remove_agent_with_state(
        value: &mut serde_json::Value,
        state: &Agent,
    ) -> Result<(), Error> {
        if value.get("data").is_none() {
            if let Some(obj) = value.as_object_mut() {
                let agent_id = state.agent_id.clone();
                match serde_json::to_value(RemoveAgentPayload { agent_id }) {
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
        Outbound::ensure_has_recipient(value);
        if Outbound::is_hash_engine_message(value) {
            Outbound::ensure_is_valid_hash_engine_message(value)?;
        }
        if Outbound::is_json_message_remove_agent(value) {
            Outbound::infer_remove_agent_with_state(value, state)?;
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
        if let Some(serde_json::Value::String(kind /* is a &String */)) = value.get("type") {
            // since all keys stored inside the system message types are lower case, we should also
            // lowercase the kind here too
            let kind: &String = &kind.to_ascii_lowercase();
            // contains needs a &str, our type is a &String, so
            // 1. *&String -> String
            // 2. *String -> &str
            // 3. (wrap in a temp ref, for std::borrow::Borrow), thus &**
            if is_system_message(&**kind) {
                return Ok(());
            }
            // otherwise throw an error
            // we were only borrowing this data from the above message, so to be nice we copy the
            // string for our error. I'm sure as an optimization in the future seeing as how an
            // error is the end of life for message preprocessing we can just take it by value
            // instead.
            return Err(Error::InvalidMessageType(Some(kind.to_string())));
        }
        Err(Error::InvalidMessageType(None))
    }

    /// # Errors
    /// This function will error if the provided `value` is not valid json
    /// OR if the `Outbound::preprocess` function fails.
    pub fn from_json_value_with_state(
        mut value: serde_json::Value,
        agent_state: &Agent,
    ) -> Result<Outbound, Error> {
        Outbound::preprocess(&mut value, agent_state)?;
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
    pub fn from_json_array_with_state(
        value: serde_json::Value,
        agent_state: &Agent,
    ) -> Result<Vec<Outbound>, Error> {
        match value {
            serde_json::Value::Array(items) => {
                let mut messages = Vec::with_capacity(items.len());
                for json_value in items {
                    messages.push(Outbound::from_json_value_with_state(
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

    #[must_use]
    // TODO: UNUSED: Needs triage
    pub fn unchecked_from_json_value_with_state(
        value: serde_json::Value,
        agent_state: &Agent,
    ) -> Outbound {
        match Outbound::from_json_value_with_state(value, agent_state) {
            Ok(m) => m,
            Err(e) => panic!("{}", e),
        }
    }
}

// should the weird CreateAgent type hack be deprecated in favor of a custom serializer?
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct OutboundCreateAgentPayload {
    pub r#type: CreateAgent,
    #[serde(deserialize_with = "value_or_string_array")]
    pub to: Vec<String>,
    pub data: Agent,
}

impl OutboundCreateAgentPayload {
    pub const KIND: &'static str = "create_agent";
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub enum CreateAgent {
    #[serde(rename = "create_agent")]
    Type,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct OutboundRemoveAgentPayload {
    pub r#type: RemoveAgent,
    #[serde(deserialize_with = "value_or_string_array")]
    pub to: Vec<String>,
    pub data: RemoveAgentPayload,
}

impl OutboundRemoveAgentPayload {
    pub const KIND: &'static str = "remove_agent";
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub enum RemoveAgent {
    // one bad thing about serde is how we still have to retype literals
    #[serde(rename = "remove_agent")]
    Type,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct RemoveAgentPayload {
    pub agent_id: String,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub enum StopSim {
    #[serde(rename = "stop")]
    Type,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct OutboundStopSimPayload {
    pub r#type: StopSim,
    #[serde(deserialize_with = "value_or_string_array")]
    pub to: Vec<String>,
    pub data: Option<serde_json::Value>,
}

impl OutboundStopSimPayload {
    pub const KIND: &'static str = "stop";
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct GenericPayload {
    pub r#type: String,

    #[serde(deserialize_with = "value_or_string_array")]
    pub to: Vec<String>,

    pub data: Option<serde_json::Value>,
}

fn value_or_string_array<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum ValueOrStringArray {
        String(String),
        Number(i64),
        Vec(Vec<String>),
    }

    match ValueOrStringArray::deserialize(deserializer)? {
        ValueOrStringArray::String(s) => Ok(vec![s]),
        ValueOrStringArray::Number(i) => Ok(vec![i.to_string()]),
        ValueOrStringArray::Vec(v) => Ok(v),
    }
}

// TODO: UNUSED: Needs triage
pub type Map = HashMap<String, Vec<Incoming>>;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Incoming {
    pub from: String,
    #[serde(flatten)]
    pub message: Outbound,
}

impl Incoming {
    // TODO: UNUSED: Needs triage
    #[must_use]
    pub fn r#type(&self) -> String {
        match &self.message {
            Outbound::Generic(msg) => msg.r#type.clone(),
            _ => String::new(),
        }
    }

    // TODO: UNUSED: Needs triage
    #[must_use]
    pub fn data(&self) -> serde_json::Value {
        match &self.message {
            Outbound::Generic(msg) => match &msg.data {
                Some(data) => data.clone(),
                None => serde_json::Value::Null,
            },
            _ => serde_json::Value::Null,
        }
    }
}
