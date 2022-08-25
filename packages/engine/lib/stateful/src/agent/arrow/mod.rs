//! Low-level interface to [`AgentBatch`].

pub(crate) mod array;
pub(crate) mod boolean;

/// todo: should this be in [`memory::arrow`] rather than here?
pub(crate) mod arrow_conversion;
mod batch;
mod iterator;
mod pool;
mod record_batch;

pub use self::{
    array::IntoRecordBatch,
    batch::AgentBatch,
    iterator::{
        agent_id_iter, agent_name_iter, bool_iter, exists_iter, f64_iter, index_iter,
        json_serialized_value_iter, json_value_iter_cols, position_iter, search_radius_iter,
        str_iter,
    },
    pool::AgentBatchPool,
};

// TODO: this should be deleted, i.e. if this value is required use
//      something like `get_hidden_column_name(PREVIOUS_INDEX_FIELD_NAME)`
pub const PREVIOUS_INDEX_FIELD_KEY: &str = "_HIDDEN_0_previous_index";
