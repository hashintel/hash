//! TODO, rework when we do separation of crates, probably remove table module
//! This is about a single simulation's data, conceptually we have Tables for agent state, context,
//! message state
pub mod context;
pub mod create_remove;
pub mod sync;
pub mod task_shared_store;
