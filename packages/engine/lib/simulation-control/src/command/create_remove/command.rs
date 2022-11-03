use std::{collections::HashSet, sync::Arc};

use memory::arrow::record_batch::RecordBatch;
use stateful::{agent::AgentSchema, field::UUID_V4_LEN};

use crate::command::{CreateRemoveCommands, Error, Result};

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
        commands
            .try_into_processed_commands(schema)
            .map_err(|e| Error::from(format!("Error processing CreateRemoveCommands: {:?}", e)))
    }

    pub fn get_number_inbound(&self) -> usize {
        self.new_agents.as_ref().map(|b| b.num_rows()).unwrap_or(0)
    }
}
