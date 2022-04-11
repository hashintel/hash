use serde::{Deserialize, Serialize};

use crate::message;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Inbound {
    pub from: String,
    #[serde(flatten)]
    pub message: message::Message,
}

impl Inbound {
    // TODO: UNUSED: Needs triage
    #[must_use]
    pub fn r#type(&self) -> String {
        match &self.message {
            message::Message::Generic(msg) => msg.r#type.clone(),
            _ => String::new(),
        }
    }

    // TODO: UNUSED: Needs triage
    #[must_use]
    pub fn data(&self) -> serde_json::Value {
        match &self.message {
            message::Message::Generic(msg) => match &msg.data {
                Some(data) => data.clone(),
                None => serde_json::Value::Null,
            },
            _ => serde_json::Value::Null,
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{agent::Agent, message, Result};

    #[test]
    // the goal of this test is to check whether or not 'remove_agent' messages automatically
    // have their data (agent to remove's id and hash system recipient) filled out during
    // json_decoding
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
        if let Some(message::Message::RemoveAgent(message::payload::RemoveAgent { data, .. })) =
            state.messages.get(0)
        {
            assert_eq!(state.agent_id, data.agent_id);
        }
        Ok(())
    }
}
