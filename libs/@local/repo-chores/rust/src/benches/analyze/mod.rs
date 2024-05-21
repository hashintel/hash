use std::path::Path;

use error_stack::{Report, ResultExt};

use crate::benches::{
    analyze::tracing::FoldedStacks,
    report::{Benchmark, ChangeEstimates, Measurement},
};

pub mod criterion;
pub mod tracing;

#[derive(Debug)]
pub struct BenchmarkAnalysis {
    pub measurement: Measurement,
    pub change: Option<ChangeEstimates>,
    pub folded_stacks: Option<FoldedStacks>,
}

impl BenchmarkAnalysis {
    /// Creates a new `BenchmarkAnalysis` from the given `Benchmark`.
    ///
    /// The benchmarks may output additional artifacts that are used to analyze the benchmark.
    /// `artifact_output` is the path to the directory where the artifacts are stored.
    ///
    /// # Errors
    ///
    /// - if the baseline measurement is missing
    /// - if the folded stacks cannot be read
    pub fn from_benchmark(
        mut benchmark: Benchmark,
        baseline: &str,
        artifact_output: impl AsRef<Path>,
    ) -> Result<Self, Report<AnalyzeError>> {
        let measurement = benchmark
            .measurements
            .remove(baseline)
            .ok_or(AnalyzeError::BaselineMissing)?;
        let folded_stacks = FoldedStacks::from_measurement(artifact_output, &measurement)
            .change_context(AnalyzeError::ReadInput)?;
        Ok(Self {
            measurement,
            change: benchmark.change,
            folded_stacks,
        })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum AnalyzeError {
    #[error("Failed to read input file.")]
    ReadInput,
    #[error("Unable to parse input file.")]
    ParseInput,
    #[error("Baseline measurement is missing.")]
    BaselineMissing,
    #[error("Flame graph is missing.")]
    FlameGraphMissing,
}
