//! Derived values a [`World`](super::World) computes once from its fitted artifacts.
//!
//! The base cascade depends on the layout alone, and every
//! [saturated scope](crate::serve::schedule::ViewSchedule::of) shares it. Deriving it at first use
//! rather than at open keeps a world that never serves a saturated scope from paying for one.

use alloc::sync::Arc;
use std::sync::OnceLock;

use super::Layout;
use crate::serve::schedule::ScopeSchedule;

/// Lazily derived values of one world, each computed at most once.
#[derive(Debug)]
pub(super) struct Cache {
    /// The complete base cascade, absent until the first saturated scope asks for it.
    base_scope_schedule: OnceLock<Arc<ScopeSchedule>>,
}

impl Cache {
    /// Creates a cache with nothing derived yet.
    pub(super) const fn new() -> Self {
        Self {
            base_scope_schedule: OnceLock::new(),
        }
    }

    /// Returns the complete base cascade over `layout`, deriving it on the first call.
    ///
    /// Concurrent first calls block on one derivation and share its result. Every call passes the
    /// world's own layout, and the first derivation answers every later call.
    ///
    /// # Panics
    ///
    /// Panics during the first derivation if a base node has no position or priority, the
    /// condition [`ScopeSchedule::from_base`] refuses. Opening samples the layout's reverse
    /// columns rather than checking every row, and a malformed entry at an unsampled row reaches
    /// this derivation.
    pub(super) fn base_scope_schedule(&self, layout: &Layout) -> &Arc<ScopeSchedule> {
        self.base_scope_schedule
            .get_or_init(|| Arc::new(ScopeSchedule::from_base(layout)))
    }
}
