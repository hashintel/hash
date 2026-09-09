use alloc::sync::Arc;
use std::sync::OnceLock;

use super::Layout;
use crate::serve2::schedule::ScopeSchedule;

#[derive(Debug)]
pub(super) struct Cache {
    base_scope_schedule: OnceLock<Arc<ScopeSchedule>>,
}

impl Cache {
    pub(super) const fn new() -> Self {
        Self {
            base_scope_schedule: OnceLock::new(),
        }
    }

    pub(super) fn base_scope_schedule(&self, layout: &Layout) -> &Arc<ScopeSchedule> {
        self.base_scope_schedule
            .get_or_init(|| Arc::new(ScopeSchedule::from_base(layout)))
    }
}
