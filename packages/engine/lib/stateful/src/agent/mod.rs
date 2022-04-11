// TODO: DOC: Add module level docs for describing the high level concept of agents

mod field;
mod name;
mod references;
mod schema;

// temporarily public
pub mod arrow;

pub use self::{
    arrow::{flush_pending_columns, modify_loaded_column, AgentBatch, AgentPool},
    field::{Agent, AgentStateField, BUILTIN_FIELDS},
    name::AgentName,
    references::MessageReference,
    schema::AgentSchema,
};
