use std::{collections::HashMap, sync::Arc};

use serde::Serialize;

use crate::{
    package::simulation::{
        output::{
            analysis::{AnalysisOutput, AnalysisOutputConfig, AnalysisSingleOutput},
            OutputPackageName,
        },
        OutputPackagesSimConfig, PackageName,
    },
    Error, Result,
};

// TODO: These should live in the respective output package really
#[derive(Serialize)]
pub struct AnalysisBuffer {
    pub manifest: String,
    pub buffers: HashMap<Arc<String>, Vec<AnalysisSingleOutput>>,
}

impl AnalysisBuffer {
    pub fn new(output_packages_config: &OutputPackagesSimConfig) -> Result<AnalysisBuffer> {
        let value = output_packages_config
            .map
            .get(&PackageName::Output(OutputPackageName::Analysis))
            .ok_or_else(|| Error::from("Missing analysis config"))?;
        let config: AnalysisOutputConfig = serde_json::from_value(value.clone())?;
        let buffer = AnalysisBuffer {
            manifest: config.manifest.clone(),
            buffers: config.outputs.keys().map(|v| (v.clone(), vec![])).collect(),
        };
        Ok(buffer)
    }

    pub fn add(&mut self, output: AnalysisOutput) -> Result<()> {
        output.inner.into_iter().try_for_each(|(name, output)| {
            self.buffers
                .get_mut(&name)
                .ok_or_else(|| {
                    Error::from(format!("Missing output buffer when persisting: {}", &name))
                })?
                .push(output);

            Ok(())
        })
    }
}
