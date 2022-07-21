use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::ontology::types::uri::BaseUri;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entity {
    #[serde(flatten)]
    properties: HashMap<BaseUri, serde_json::Value>,
}
