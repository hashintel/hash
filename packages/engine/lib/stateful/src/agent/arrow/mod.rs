pub mod array;
mod batch;
mod pool;

pub use self::{
    batch::AgentBatch,
    pool::{flush_pending_columns, modify_loaded_column, AgentPool},
};

// TODO: this should be deleted, i.e. if this value is required use
//      something like `get_hidden_column_name(PREVIOUS_INDEX_FIELD_NAME)`
pub const PREVIOUS_INDEX_FIELD_KEY: &str = "_HIDDEN_0_previous_index";
