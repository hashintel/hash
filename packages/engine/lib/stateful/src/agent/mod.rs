//!

mod field;
mod into_agent;
mod name;
mod references;
mod required;
mod schema;

// temporarily public
pub mod arrow;

pub use self::{
    arrow::{AgentBatch, AgentPool},
    field::{Agent, AgentStateField},
    into_agent::IntoAgents,
    name::AgentName,
    references::MessageReference,
    schema::AgentSchema,
};
pub(crate) use self::{field::BUILTIN_FIELDS, required::IsRequired};
