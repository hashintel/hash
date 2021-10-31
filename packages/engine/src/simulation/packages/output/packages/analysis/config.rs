use super::analyzer::AnalysisOperationRepr;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct AnalysisOutputConfig {
    pub outputs: HashMap<String, Vec<AnalysisOperationRepr>>,
    pub manifest: String,
}
