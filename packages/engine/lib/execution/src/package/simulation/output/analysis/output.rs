use std::{collections::HashMap, sync::Arc};

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AnalysisFinalOutput {
    pub inner: HashMap<Arc<String>, Vec<AnalysisSingleOutput>>,
}

// Output for a single step
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AnalysisOutput {
    pub inner: HashMap<Arc<String>, AnalysisSingleOutput>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum AnalysisSingleOutput {
    Number(Option<f64>),
    Vec(Option<Vec<Option<f64>>>),
}

impl AnalysisSingleOutput {
    pub fn null_number() -> AnalysisSingleOutput {
        AnalysisSingleOutput::Number(None)
    }

    pub fn some_number(value: f64) -> AnalysisSingleOutput {
        AnalysisSingleOutput::Number(Some(value))
    }

    pub fn number_vec(value: Vec<Option<f64>>) -> AnalysisSingleOutput {
        AnalysisSingleOutput::Vec(Some(value))
    }
}
