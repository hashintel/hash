use std::sync::Arc;

use arrow2::datatypes::Schema;

/// Due to flushing, need batches and schemas in both Rust and [JS | PY].
///
/// This is because when we flush (write changes to shared memory segment) the
/// schema might change.
pub struct SimState {
    pub agent_schema: Arc<Schema>,
    pub msg_schema: Arc<Schema>,
}
