//! Shared components for ontology producers (`DataType`, `PropertyType`, etc.).
//!
//! This module provides common functionality for producers that generate ontological types
//! with domain-based ownership and web-catalog dependencies.

use alloc::sync::Arc;

use type_system::principal::actor_group::WebId;

pub mod domain;

pub use self::domain::{
    BoundDomainSampler, DomainBindingError, DomainPolicy, IndexSamplerConfig, LocalSourceConfig,
    LocalWebTypeWeights, RemoteSourceConfig, SampledDomain,
};

/// Trait for catalogs of web identities used for domain and ownership resolution.
pub trait WebCatalog {
    fn len(&self) -> usize;

    fn is_empty(&self) -> bool {
        self.len() == 0
    }

    fn get_entry(&self, index: usize) -> Option<(Arc<str>, Arc<str>, WebId)>;
}

impl<C> WebCatalog for &C
where
    C: WebCatalog,
{
    fn len(&self) -> usize {
        (*self).len()
    }

    fn get_entry(&self, index: usize) -> Option<(Arc<str>, Arc<str>, WebId)> {
        (*self).get_entry(index)
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use core::fmt::Debug;

    use super::*;

    #[derive(Debug, Copy, Clone)]
    pub(crate) struct EmptyTestCatalog;

    impl WebCatalog for EmptyTestCatalog {
        fn len(&self) -> usize {
            0
        }

        fn get_entry(&self, _: usize) -> Option<(Arc<str>, Arc<str>, WebId)> {
            None
        }
    }
}
