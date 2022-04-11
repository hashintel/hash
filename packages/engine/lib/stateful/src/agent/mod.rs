// TODO: DOC: Add module level docs for describing the high level concept of agents

mod field;
mod name;
mod pool;
mod references;
mod schema;

// temporarily public
pub mod arrow;

pub use self::{
    arrow::AgentBatch,
    field::{Agent, AgentStateField, BUILTIN_FIELDS},
    name::AgentName,
    pool::{flush_pending_columns, modify_loaded_column, AgentPool},
    references::MessageReference,
    schema::AgentSchema,
};
