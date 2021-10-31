use crate::datastore::{table::references::MessageMap, UUID_V4_LEN};

use super::{indices::AgentMessageIndices, *};

/// Columnar native representation of indicies to messages
#[derive(Debug)]
pub struct Messages {
    pub indices: Vec<AgentMessageIndices>,
    /// Number of messages in total
    pub total_count: usize,
}

impl Messages {
    pub fn gather<'a>(
        message_map: &MessageMap,
        ids_and_names: impl Iterator<Item = (&'a [u8; UUID_V4_LEN], Option<&'a str>)>,
        num_agents: usize,
    ) -> Result<Messages> {
        let mut total_count = 0;
        //TODO[4](optimization) parallelism
        let indices = ids_and_names
            .map(|(agent_id, agent_name)| {
                let by_id = message_map.get_msg_refs(
                    &uuid::Uuid::from_slice(agent_id)?
                        .to_hyphenated_ref()
                        .to_string(), //TODO[6](optimization) lose the string creation
                );

                let by_name =
                    agent_name.and_then(|val| Some(message_map.get_msg_refs(&val.to_lowercase())));

                let mut indices = AgentMessageIndices::new();
                indices.add(by_id);
                if let Some(by_name) = by_name {
                    indices.add(by_name);
                }
                total_count += by_id.len() + by_name.map(|m| m.len()).unwrap_or(0);
                Ok(indices)
            })
            .collect::<Result<_>>()?;

        Ok(Messages {
            indices,
            total_count,
        })
    }
}
