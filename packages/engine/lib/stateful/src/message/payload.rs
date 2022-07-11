//! Contains the payload used in [`Message`]s.
//!
//! [`Message`]: crate::message::Message

use serde::{Deserialize, Deserializer, Serialize};

use crate::{
    agent::{Agent, AgentId},
    message,
};

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

// should the weird CreateAgent type hack be deprecated in favor of a custom serializer?
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct CreateAgent {
    pub r#type: message::CreateAgent,
    #[serde(deserialize_with = "value_or_string_array")]
    pub to: Vec<String>,
    pub data: Agent,
}

impl CreateAgent {
    pub const KIND: &'static str = "create_agent";
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
pub struct RemoveAgentData {
    pub agent_id: AgentId,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
pub struct RemoveAgent {
    pub r#type: message::RemoveAgent,
    #[serde(deserialize_with = "value_or_string_array")]
    pub to: Vec<String>,
    pub data: RemoveAgentData,
}

impl RemoveAgent {
    pub const KIND: &'static str = "remove_agent";
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
pub struct StopSim {
    pub r#type: message::StopSim,
    #[serde(deserialize_with = "value_or_string_array")]
    pub to: Vec<String>,
    pub data: Option<serde_json::Value>,
}

impl StopSim {
    pub const KIND: &'static str = "stop";
}

/// Payload for arbitrary JSON data.
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
pub struct Generic {
    pub r#type: String,

    #[serde(deserialize_with = "value_or_string_array")]
    pub to: Vec<String>,

    pub data: Option<serde_json::Value>,
}
