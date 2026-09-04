use alloc::sync::Arc;
use std::sync::OnceLock;

use crate::serve::schedule::ScopeSchedule;

pub struct Cache {
    saturated_scope_schedule: OnceLock<Arc<ScopeSchedule>>,
}

impl Cache {
    pub(crate) const fn new() -> Self {
        Self {
            saturated_scope_schedule: OnceLock::new(),
        }
    }
}
