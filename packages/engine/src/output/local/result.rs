use serde::Serialize;

use crate::output::{OutputPersistenceResultRepr, Result};

#[derive(derive_new::new, Serialize)]
pub struct LocalPersistenceResult {
    persistence_path: String,
}

impl OutputPersistenceResultRepr for LocalPersistenceResult {
    #[tracing::instrument(skip_all)]
    fn into_value(self) -> Result<(&'static str, serde_json::Value)> {
        Ok(("local", serde_json::Value::String(self.persistence_path)))
    }
}
