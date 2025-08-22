use alloc::sync::Arc;
use core::error::Error;

use error_stack::Report;
use hash_graph_test_data::seeding::producer::data_type::InMemoryWebCatalog;

use crate::scenario::runner::Runner;

#[derive(Debug, derive_more::Display)]
pub enum WebCatalogError {
    #[display("Missing users for web catalog: {id}")]
    MissingUsers { id: String },
}

impl Error for WebCatalogError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebCatalogStage {
    pub id: String,
    pub from: Vec<String>,
    pub domain: String,
}

impl WebCatalogStage {
    pub fn execute(&self, runner: &mut Runner) -> Result<usize, Report<WebCatalogError>> {
        let mut all_users = Vec::new();
        for key in &self.from {
            let users =
                runner.resources.users.get(key).ok_or_else(|| {
                    Report::new(WebCatalogError::MissingUsers { id: key.clone() })
                })?;
            all_users.extend_from_slice(users);
        }

        let domain_arc: Arc<str> = Arc::<str>::from(self.domain.as_str());
        let catalog = InMemoryWebCatalog::from_users(&all_users, &domain_arc);

        runner
            .resources
            .user_catalogs
            .insert(self.id.clone(), catalog);
        Ok(all_users.len())
    }
}
