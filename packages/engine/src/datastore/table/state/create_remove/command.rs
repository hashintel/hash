use std::{collections::HashSet, sync::Arc};

use arrow::record_batch::RecordBatch;
use stateful::{agent::AgentSchema, field::EngineComponent};

use crate::{
    datastore::{
        error::{Error, Result},
        UUID_V4_LEN,
    },
    simulation::command::CreateRemoveCommands,
};

#[derive(Debug, Default)]
pub struct ProcessedCommands {
    pub new_agents: Option<RecordBatch>,
    pub remove_ids: HashSet<[u8; UUID_V4_LEN]>,
}

impl ProcessedCommands {
    pub fn new(
        commands: CreateRemoveCommands,
        schema: &Arc<AgentSchema<EngineComponent>>,
    ) -> Result<ProcessedCommands> {
        commands
            .try_into_processed_commands(schema)
            .map_err(|e| Error::from(format!("Error processing CreateRemoveCommands: {:?}", e)))
    }

    pub fn get_number_inbound(&self) -> usize {
        self.new_agents.as_ref().map(|b| b.num_rows()).unwrap_or(0)
    }
}
