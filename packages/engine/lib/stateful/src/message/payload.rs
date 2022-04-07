use serde::{Deserialize, Deserializer, Serialize};

use crate::{agent::Agent, message};

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
pub struct OutboundCreateAgent {
    pub r#type: message::CreateAgent,
    #[serde(deserialize_with = "value_or_string_array")]
    pub to: Vec<String>,
    pub data: Agent,
}

impl OutboundCreateAgent {
    pub const KIND: &'static str = "create_agent";
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct OutboundRemoveAgentData {
    pub agent_id: String,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct OutboundRemoveAgent {
    pub r#type: message::RemoveAgent,
    #[serde(deserialize_with = "value_or_string_array")]
    pub to: Vec<String>,
    pub data: OutboundRemoveAgentData,
}

impl OutboundRemoveAgent {
    pub const KIND: &'static str = "remove_agent";
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct OutboundStopSim {
    pub r#type: message::StopSim,
    #[serde(deserialize_with = "value_or_string_array")]
    pub to: Vec<String>,
    pub data: Option<serde_json::Value>,
}

impl OutboundStopSim {
    pub const KIND: &'static str = "stop";
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct Generic {
    pub r#type: String,

    #[serde(deserialize_with = "value_or_string_array")]
    pub to: Vec<String>,

    pub data: Option<serde_json::Value>,
}
