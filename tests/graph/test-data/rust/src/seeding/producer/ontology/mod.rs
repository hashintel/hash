//! Shared components for ontology producers (`DataType`, `PropertyType`, etc.).
//!
//! This module provides common functionality for producers that generate ontological types
//! with domain-based ownership and web-catalog dependencies.

use alloc::sync::Arc;

use type_system::principal::actor_group::WebId;

use crate::seeding::producer::user::UserCreation;

pub mod domain;

pub use self::domain::{
    BoundDomainSampler, DomainBindingError, DomainPolicy, IndexSamplerConfig, LocalSourceConfig,
    LocalWebTypeWeights, RemoteSourceConfig, SampledDomain,
};

/// Trait for catalogs of web identities used for domain and ownership resolution.
pub trait WebCatalog: Sync + Send {
    fn len(&self) -> usize;

    fn is_empty(&self) -> bool {
        self.len() == 0
    }

    fn get_entry(&self, index: usize) -> Option<(Arc<str>, Arc<str>, WebId)>;
}

/// Simple in-memory implementation of [`WebCatalog`].
#[derive(Debug, Clone)]
pub struct InMemoryWebCatalog {
    items: Vec<(Arc<str>, Arc<str>, WebId)>,
}

impl InMemoryWebCatalog {
    #[must_use]
    pub const fn from_tuples(items: Vec<(Arc<str>, Arc<str>, WebId)>) -> Self {
        Self { items }
    }

    #[must_use]
    pub fn from_users(users: &[UserCreation], domain: &Arc<str>) -> Self {
        let mut items = Vec::with_capacity(users.len());
        for user in users {
            items.push((
                Arc::clone(domain),
                Arc::<str>::from(user.shortname.as_str()),
                WebId::from(user.id),
            ));
        }
        Self { items }
    }
}

impl WebCatalog for InMemoryWebCatalog {
    fn len(&self) -> usize {
        self.items.len()
    }

    fn get_entry(&self, index: usize) -> Option<(Arc<str>, Arc<str>, WebId)> {
        self.items.get(index).cloned()
    }
}
