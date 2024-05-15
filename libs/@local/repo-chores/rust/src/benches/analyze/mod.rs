use std::path::Path;

use error_stack::{Report, ResultExt};
use walkdir::WalkDir;

use crate::benches::{
    analyze::tracing::FoldedStacks,
    report::{Benchmark, ChangeEstimates, Measurement},
};

pub mod criterion;
pub mod tracing;

pub struct BenchmarkAnalysis {
    pub measurement: Measurement,
    pub change: Option<ChangeEstimates>,
    pub folded: Option<FoldedStacks>,
}

impl BenchmarkAnalysis {
    pub fn from_benchmark(
        mut benchmark: Benchmark,
        baseline: &str,
        bench_output: impl AsRef<Path>,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let measurement = benchmark
            .measurements
            .remove(baseline)
            .ok_or(AnalyzeError::BaselineMissing)?;
        let folded = FoldedStacks::from_measurement(bench_output, &measurement).ok();
        Ok(Self {
            measurement,
            change: benchmark.change,
            folded,
        })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum AnalyzeError {
    #[error("Failed to read input file.")]
    ReadInput,
    #[error("Baseline missing.")]
    BaselineMissing,
    #[error("Unable to parse input file.")]
    ParseInput,
}
