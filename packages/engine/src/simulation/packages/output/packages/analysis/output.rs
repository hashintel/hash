use std::{collections::HashMap, sync::Arc};

pub struct AnalysisOutput {
    pub inner: HashMap<Arc<String>, AnalysisSingleOutput>,
}

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
