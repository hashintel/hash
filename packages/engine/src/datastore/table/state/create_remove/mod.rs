mod action;
mod batch;
mod command;
mod distribution;
mod plan;
mod planner;

pub use command::ProcessedCommands;
pub use plan::MigrationPlan;
pub use planner::CreateRemovePlanner;

use crate::datastore::prelude::*;

type AgentIndex = crate::datastore::batch::migration::IndexAction;
type BatchIndex = usize;
type WorkerIndex = usize;
