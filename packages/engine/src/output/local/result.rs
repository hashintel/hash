use crate::output::OutputPersistenceResultRepr;

use serde::Serialize;

#[derive(new, Serialize)]
pub struct LocalPersistenceResult {
    persistence_path: String,
}

impl OutputPersistenceResultRepr for LocalPersistenceResult {
    fn as_value(self) -> crate::Result<(&'static str, serde_json::Value)> {
        Ok(("local", serde_json::Value::String(self.persistence_path)))
    }
}
