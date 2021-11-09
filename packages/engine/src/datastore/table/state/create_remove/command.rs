use std::collections::HashSet;
use std::sync::Arc;

use arrow::record_batch::RecordBatch;

use crate::datastore::schema::state::AgentSchema;
use crate::{
    datastore::{prelude::*, UUID_V4_LEN},
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
        schema: &Arc<AgentSchema>,
    ) -> Result<ProcessedCommands> {
        let new_agents = commands.get_agent_batch(schema)?;
        let remove_ids = commands.get_remove_ids();

        Ok(ProcessedCommands {
            new_agents,
            remove_ids,
        })
    }

    pub fn get_number_inbound(&self) -> usize {
        self.new_agents.as_ref().map(|b| b.num_rows()).unwrap_or(0)
    }
}
