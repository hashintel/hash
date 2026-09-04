use alloc::sync::Arc;
use std::sync::OnceLock;

use crate::serve::schedule::ScopeSchedule;

pub struct Cache {
    saturated_scope_schedule: OnceLock<Arc<ScopeSchedule>>,
}
