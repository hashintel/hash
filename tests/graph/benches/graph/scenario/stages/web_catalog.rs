use alloc::sync::Arc;
use core::error::Error;

use error_stack::Report;
use hash_graph_test_data::seeding::producer::ontology::WebCatalog;
use type_system::principal::actor_group::WebId;

use crate::scenario::runner::Runner;

#[derive(Debug, derive_more::Display)]
pub enum WebCatalogError {
    #[display("Empty web catalog")]
    EmptyCatalog,
    #[display("Missing users for web catalog: {id}")]
    MissingUsers { id: String },
}

impl Error for WebCatalogError {}

/// Simple in-memory implementation of [`WebCatalog`].
#[derive(Debug, Clone)]
pub struct InMemoryWebCatalog {
    domain: Arc<str>,
    webs: Vec<(Arc<str>, WebId)>,
}

impl InMemoryWebCatalog {
    /// Create a new catalog from a collection of web references.
    ///
    /// # Errors
    ///
    /// Returns an error if the catalog is empty.
    pub fn new(domain: Arc<str>, webs: Vec<(Arc<str>, WebId)>) -> Result<Self, WebCatalogError> {
        if webs.is_empty() {
            return Err(WebCatalogError::EmptyCatalog);
        }

        Ok(Self { domain, webs })
    }
}

impl WebCatalog for InMemoryWebCatalog {
    fn len(&self) -> usize {
        self.webs.len()
    }

    fn get_entry(&self, index: usize) -> Option<(Arc<str>, Arc<str>, WebId)> {
        self.webs
            .get(index)
            .map(|(shortname, web_id)| (Arc::clone(&self.domain), Arc::clone(shortname), *web_id))
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WebCatalogStage {
    pub id: String,
    pub from: Vec<String>,
    pub domain: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WebCatalogResult {
    pub collected_webs: usize,
}

impl WebCatalogStage {
    pub fn execute(
        &self,
        runner: &mut Runner,
    ) -> Result<WebCatalogResult, Report<WebCatalogError>> {
        let mut all_users = Vec::new();
        for key in &self.from {
            let users =
                runner.resources.users.get(key).ok_or_else(|| {
                    Report::new(WebCatalogError::MissingUsers { id: key.clone() })
                })?;
            all_users.extend(users.iter().map(|user| {
                (
                    Arc::<str>::from(user.shortname.as_ref()),
                    WebId::from(user.id),
                )
            }));
        }

        let len = all_users.len();
        let catalog = InMemoryWebCatalog::new(Arc::<str>::from(self.domain.as_str()), all_users)?;

        runner
            .resources
            .user_catalogs
            .insert(self.id.clone(), catalog);
        Ok(WebCatalogResult {
            collected_webs: len,
        })
    }
}
