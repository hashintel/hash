use std::{collections::HashSet, sync::Arc};

use crate::hash_types::{message::RemoveAgentPayload, Agent};
use arrow::record_batch::RecordBatch;
use rayon::iter::{
    IndexedParallelIterator, IntoParallelIterator, IntoParallelRefIterator, ParallelIterator,
};
use uuid::Uuid;

use super::{Error, Result};

use crate::datastore::schema::{state::AgentSchema, FieldKey};
use crate::datastore::{
    error::Result as DataStoreResult,
    table::{pool::message::MessagePoolRead, references::MessageMap},
    UUID_V4_LEN,
};

//TODO[9](docs) Update docs to reflect that these variants are only allowed
static HASH: [&str; 3] = ["hash", "Hash", "HASH"];

enum HashMessageType {
    Create,
    Remove,
}

struct CreateCommand {
    agent: Agent,
}

struct RemoveCommand {
    uuid: Uuid,
}

#[derive(Default)]
pub struct CreateRemoveCommands {
    create: Vec<CreateCommand>,
    remove: Vec<RemoveCommand>,
    merged: Vec<CreateRemoveCommands>,
}

impl CreateRemoveCommands {
    pub fn add_create(&mut self, agent: Agent) {
        self.create.push(CreateCommand { agent });
    }

    pub fn add_remove(&mut self, uuid: Uuid) {
        self.remove.push(RemoveCommand { uuid });
    }

    pub fn verify(&self, schema: &Arc<AgentSchema>) -> Result<()> {
        let field_spec_map = &schema.field_spec_map; // Fields for entire simulation.

        // TODO[2](optimization): Convert `fields` HashMap to perfect hash set here if it makes lookups faster.
        for create in &self.create {
            for field in create.agent.custom.keys() {
                // Hopefully branch prediction will make this not as slow as it looks.
                if !field_spec_map.contains_key(&FieldKey::new_agent_scoped(field)?) {
                    return Err(Error::CreateAgentField(field.clone(), create.agent.clone()));
                }
            }
        }
        self.merged
            .par_iter()
            .try_for_each(|cmds| cmds.verify(schema))?;
        Ok(())
    }

    pub fn merge(&mut self, other: CreateRemoveCommands) {
        self.merged.push(other);
    }

    pub fn from_hash_messages<'a>(
        message_map: &MessageMap,
        message_pool: &MessagePoolRead<'a>,
    ) -> Result<CreateRemoveCommands> {
        let message_reader = message_pool.get_reader();

        let mut refs = Vec::with_capacity(HASH.len());
        for hash_recipient in &HASH {
            refs.push(message_map.get_msg_refs(*hash_recipient))
        }

        let res: CreateRemoveCommands =
            refs.into_par_iter()
                .map(|refs| {
                    // TODO[5](optimization) see if collecting type information before (to avoid cache misses on large batches)
                    // yields better results
                    let hash_message_types = message_pool.type_iter(&message_reader, refs).map(
                        |type_str| match type_str {
                            "create_agent" => Ok(HashMessageType::Create),
                            "remove_agent" => Ok(HashMessageType::Remove),
                            _ => Err(Error::UnexpectedSystemMessage {
                                message_type: type_str.into(),
                            }),
                        },
                    );

                    let res: Result<CreateRemoveCommands> = message_pool
                        .data_iter(&message_reader, refs)
                        .zip_eq(message_pool.from_iter(&message_reader, refs))
                        .zip_eq(hash_message_types)
                        .try_fold(
                            CreateRemoveCommands::default,
                            |mut cmds, ((data, from), message_type)| {
                                handle_hash_message(&mut cmds, message_type?, data, from)?;
                                Ok(cmds)
                            },
                        )
                        .try_reduce(CreateRemoveCommands::default, |mut a, b| {
                            a.merge(b);
                            Ok(a)
                        });
                    res
                })
                .try_reduce(CreateRemoveCommands::default, |mut a, b| {
                    a.merge(b);
                    Ok(a)
                })?;
        Ok(res)
    }

    // TODO OS[27] - RUNTIME BLOCK - Unimplemented methods
    pub fn get_agent_batch(&self) -> DataStoreResult<Option<RecordBatch>> {
        todo!();
    }

    pub fn get_remove_ids(&self) -> DataStoreResult<HashSet<[u8; UUID_V4_LEN]>> {
        todo!();
    }
}

fn handle_hash_message(
    cmds: &mut CreateRemoveCommands,
    message_type: HashMessageType,
    data: &str,
    from: &[u8; UUID_V4_LEN],
) -> Result<()> {
    match message_type {
        // See https://docs.hash.ai/core/agent-messages/built-in-message-handlers
        HashMessageType::Create => {
            cmds.add_create(
                serde_json::from_str(data)
                    .map_err(|e| Error::CreateAgentPayload(e, data.to_string()))?,
            );
        }
        HashMessageType::Remove => {
            handle_remove_data(cmds, data, from)?;
        }
    }
    Ok(())
}

fn handle_remove_data(
    cmds: &mut CreateRemoveCommands,
    data: &str,
    from: &[u8; UUID_V4_LEN],
) -> Result<()> {
    let uuid = if data == "null" {
        Ok(uuid::Uuid::from_bytes(from.clone()))
    } else {
        match serde_json::from_str::<RemoveAgentPayload>(data) {
            Ok(payload) => Ok(uuid::Uuid::parse_str(&payload.agent_id)?),
            Err(_) => {
                if data == "null"
                    || data == ""
                    || serde_json::from_str::<std::collections::HashMap<String, String>>(data)
                        .is_ok()
                {
                    Ok(uuid::Uuid::from_bytes(from.clone()))
                } else {
                    Err(Error::RemoveAgentMessage(data.to_string()))
                }
            }
        }
    }?;

    cmds.add_remove(uuid);
    Ok(())
}
