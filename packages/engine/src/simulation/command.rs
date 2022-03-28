//! Logic around the HASH commands exposed to simulation authors. Namely the ability for agents
//! to:
//! * Dynamically request the creation of agents
//! * Dynamically request the deletion of agents
//! * Dynamically request stopping of the simulation run

use std::{collections::HashSet, sync::Arc};

use rayon::iter::{IndexedParallelIterator, IntoParallelIterator, ParallelIterator};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    datastore::{
        arrow::{
            batch_conversion::IntoRecordBatch,
            message::{CREATE_AGENT, REMOVE_AGENT, STOP_SIM},
        },
        batch::MessageBatch,
        schema::{state::AgentSchema, FieldKey},
        table::{
            pool::proxy::PoolReadProxy, references::MessageMap,
            state::create_remove::ProcessedCommands,
        },
        UUID_V4_LEN,
    },
    hash_types::{message::RemoveAgentPayload, Agent},
    simulation::{Error, Result},
};

/// Variations of the protected message-target that is associated with the engine. If an agent
/// sends a message to one of these variations, it's interpreted as a command rather than a message
/// to be forwarded to another agent.
///
/// This array also forms the list of the **only** acceptable variants, e.g. `hAsH` is not allowed
static HASH: [&str; 3] = ["hash", "Hash", "HASH"];

/// The commands available to simulation agents
enum HashMessageType {
    /// Create an agent
    Create,
    /// Remove an Agent
    Remove,
    /// Stop the simulation
    Stop,
}

#[derive(Debug)]
struct CreateCommand {
    agent: Agent,
}

#[derive(Debug)]
struct RemoveCommand {
    uuid: Uuid,
}

/// Status of the stop message that occurred.
///
/// See the [HASH-documentation] for more information.
///
/// [HASH-documentation]: https://hash.ai/docs/simulation/creating-simulations/agent-messages/built-in-message-handlers#Stopping-a-simulation
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StopStatus {
    Success,
    Warning,
    Error,
}

impl Default for StopStatus {
    fn default() -> Self {
        Self::Warning
    }
}

/// Command to stop the simulation.
///
/// Stores the [`StopMessage`] and the agent's UUID.
#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct StopCommand {
    pub message: StopMessage,
    pub agent: Uuid,
}

/// Stop message sent from an agent.
///
/// See the [HASH-documentation] for more information.
///
/// [HASH-documentation]: https://hash.ai/docs/simulation/creating-simulations/agent-messages/built-in-message-handlers#Stopping-a-simulation
#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct StopMessage {
    pub status: StopStatus,
    pub reason: Option<String>,
}

/// Collection of queued commands for the creation and deletion of agents.
#[derive(Debug, Default)]
pub struct CreateRemoveCommands {
    create: Vec<CreateCommand>,
    remove: Vec<RemoveCommand>,
}

/// Commands queued by agents
#[derive(Debug, Default)]
pub struct Commands {
    pub create_remove: CreateRemoveCommands,
    pub stop: Vec<StopCommand>,
}

impl Commands {
    /// Push a command for the request of the creation of an agent
    pub fn add_create(&mut self, agent: Agent) {
        self.create_remove.create.push(CreateCommand { agent });
    }

    /// Push a command for the request of the deletion of the agent associated with the given UUID
    pub fn add_remove(&mut self, uuid: Uuid) {
        self.create_remove.remove.push(RemoveCommand { uuid });
    }

    /// Ensures that all agent-creation commands contain valid agent fields.
    ///
    /// Returns an error if a creation command is for an agent that has a field that hasn't been
    /// defined in the schema
    pub fn verify(&self, schema: &Arc<AgentSchema>) -> Result<()> {
        let field_spec_map = &schema.field_spec_map; // Fields for entire simulation.

        // TODO[2](optimization): Convert `fields` HashMap to perfect hash set here if it makes
        //   lookups faster.
        for create in &self.create_remove.create {
            for field in create.agent.custom.keys() {
                // Hopefully branch prediction will make this not as slow as it looks.
                if !field_spec_map.contains_key(&FieldKey::new_agent_scoped(field)?) {
                    return Err(Error::CreateAgentField(field.clone(), create.agent.clone()));
                }
            }
        }
        Ok(())
    }

    pub fn merge(&mut self, mut other: Commands) {
        self.create_remove
            .create
            .append(&mut other.create_remove.create);
        self.create_remove
            .remove
            .append(&mut other.create_remove.remove);
        self.stop.append(&mut other.stop);
    }

    /// Reads the messages of a simulation step, and identifies, transforms, and collects the
    /// commands.
    pub fn from_hash_messages(
        message_map: &MessageMap,
        message_proxies: PoolReadProxy<MessageBatch>,
    ) -> Result<Commands> {
        let message_reader = message_proxies.get_reader()?;

        let mut refs = Vec::with_capacity(HASH.len());
        for hash_recipient in &HASH {
            refs.push(message_map.get_msg_refs(*hash_recipient))
        }

        let res: Commands = refs
            .into_par_iter()
            .map(|refs| {
                // TODO: OPTIM See if collecting type information before (to avoid cache
                //       misses on large batches) yields better results.
                let hash_message_types =
                    message_reader
                        .type_iter(refs)
                        .map(|type_str| match type_str {
                            CREATE_AGENT => Ok(HashMessageType::Create),
                            REMOVE_AGENT => Ok(HashMessageType::Remove),
                            // TODO: When implementing "mapbox" don't forget to update module docs.
                            "mapbox" => todo!(),
                            STOP_SIM => Ok(HashMessageType::Stop),
                            _ => Err(Error::UnexpectedSystemMessage {
                                message_type: type_str.into(),
                            }),
                        });

                let res: Result<Commands> = message_reader
                    .data_iter(refs)
                    .zip_eq(message_reader.from_iter(refs))
                    .zip_eq(hash_message_types)
                    .try_fold(
                        Commands::default,
                        |mut cmds, ((data, from), message_type)| {
                            handle_hash_message(&mut cmds, message_type?, data, from)?;
                            Ok(cmds)
                        },
                    )
                    .try_reduce(Commands::default, |mut a, b| {
                        a.merge(b);
                        Ok(a)
                    });
                res
            })
            .try_reduce(Commands::default, |mut a, b| {
                a.merge(b);
                Ok(a)
            })?;
        Ok(res)
    }
}

impl CreateRemoveCommands {
    /// Processes the commands by creating a new AgentBatch from the create commands, and returning
    /// that alongside a set of Agent UUIDs to be removed from state.
    pub fn try_into_processed_commands(
        mut self,
        schema: &Arc<AgentSchema>,
    ) -> Result<ProcessedCommands> {
        let new_agents = if !self.create.is_empty() {
            Some(
                self.create
                    .drain(..)
                    .map(|create_cmd| create_cmd.agent)
                    .collect::<Vec<_>>()
                    .as_slice()
                    .into_agent_batch(schema)?,
            )
        } else {
            None
        };

        let remove_ids: HashSet<[u8; UUID_V4_LEN]> = self
            .remove
            .drain(..)
            .map(|remove_cmd| *remove_cmd.uuid.as_bytes())
            .collect::<HashSet<_>>();

        Ok(ProcessedCommands {
            new_agents,
            remove_ids,
        })
    }
}

/// Extends a given [`CreateRemoveCommands`] with a new command created and parsed depending on the
/// given HashMessageType
fn handle_hash_message(
    cmds: &mut Commands,
    message_type: HashMessageType,
    data: &str,
    from: &[u8; UUID_V4_LEN],
) -> Result<()> {
    match message_type {
        // See https://hash.ai/docs/simulation/creating-simulations/agent-messages/built-in-message-handlers
        HashMessageType::Create => {
            cmds.add_create(
                serde_json::from_str(data)
                    .map_err(|e| Error::CreateAgentPayload(e, data.to_string()))?,
            );
        }
        HashMessageType::Remove => {
            handle_remove_data(cmds, data, from)?;
        }
        HashMessageType::Stop => {
            cmds.stop.push(StopCommand {
                message: serde_json::from_str(data)?,
                agent: uuid::Uuid::from_bytes(*from),
            });
        }
    }
    Ok(())
}

/// Adds a [`RemoveCommand`], reading the UUID either from the payload, or using the from field on
/// the message if the payload is missing.
fn handle_remove_data(cmds: &mut Commands, data: &str, from: &[u8; UUID_V4_LEN]) -> Result<()> {
    let uuid = if data == "null" {
        Ok(uuid::Uuid::from_bytes(*from))
    } else {
        match serde_json::from_str::<RemoveAgentPayload>(data) {
            Ok(payload) => Ok(uuid::Uuid::parse_str(&payload.agent_id)?),
            Err(_) => {
                if data == "null"
                    || data.is_empty()
                    || serde_json::from_str::<std::collections::HashMap<String, String>>(data)
                        .is_ok()
                {
                    Ok(uuid::Uuid::from_bytes(*from))
                } else {
                    Err(Error::RemoveAgentMessage(data.to_string()))
                }
            }
        }
    }?;

    cmds.add_remove(uuid);
    Ok(())
}
