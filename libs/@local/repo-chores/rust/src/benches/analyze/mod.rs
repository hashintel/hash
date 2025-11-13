use std::path::PathBuf;

use error_stack::{Report, ResultExt as _};

use crate::benches::{
    analyze::tracing::FoldedStacks,
    generate_path,
    report::{Benchmark, ChangeEstimates, Measurement},
};

pub(crate) mod criterion;
pub(crate) mod tracing;

#[derive(Debug)]
pub(crate) struct BenchmarkAnalysis {
    pub path: PathBuf,
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
    pub(crate) fn from_benchmark(
        mut benchmark: Benchmark,
        baseline: &str,
        artifact_path: impl Into<PathBuf>,
    ) -> Result<Self, Report<AnalyzeError>> {
        let artifact_path = artifact_path.into();
        let measurement = benchmark
            .measurements
            .remove(baseline)
            .ok_or(AnalyzeError::BaselineMissing)?;

        let path = artifact_path.join(generate_path(
            &measurement.info.group_id,
            measurement.info.function_id.as_deref(),
            measurement.info.value_str.as_deref(),
        ));
        let tracing_file = path.join("tracing.folded");

        let folded_stacks = tracing_file
            .exists()
            .then(|| FoldedStacks::from_file(tracing_file).change_context(AnalyzeError::ReadInput))
            .transpose()?;

        Ok(Self {
            path,
            measurement,
            change: benchmark.change,
            folded_stacks,
        })
    }
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum AnalyzeError {
    #[error("Failed to read input file.")]
    ReadInput,
    #[error("Unable to parse input file.")]
    ParseInput,
    #[error("Baseline measurement is missing.")]
    BaselineMissing,
    #[error("Flame graph is missing.")]
    FlameGraphMissing,
    #[error("Flame graph creation failed.")]
    FlameGraphCreation,
}
