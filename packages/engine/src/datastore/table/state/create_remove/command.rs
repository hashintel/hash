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
        mut commands: CreateRemoveCommands,
        schema: &Arc<AgentSchema>,
    ) -> Result<ProcessedCommands> {
        Ok(commands
            .try_into_processed_commands(schema)
            .map_err(|e| Error::from(format!("Error processing CreateRemoveCommands: {:?}", e)))?)
    }

    pub fn get_number_inbound(&self) -> usize {
        self.new_agents.as_ref().map(|b| b.num_rows()).unwrap_or(0)
    }
}
