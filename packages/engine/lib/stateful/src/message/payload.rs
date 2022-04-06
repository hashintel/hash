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
pub struct GenericPayload {
    pub r#type: String,

    #[serde(deserialize_with = "value_or_string_array")]
    pub to: Vec<String>,

    pub data: Option<serde_json::Value>,
}
