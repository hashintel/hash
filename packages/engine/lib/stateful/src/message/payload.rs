use serde::{Deserialize, Deserializer, Serialize};

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
