mod field;
mod name;
mod schema;

pub use self::{
    field::{AgentStateField, BUILTIN_FIELDS},
    name::AgentName,
    schema::AgentSchema,
};
