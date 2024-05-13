pub mod criterion;

#[derive(Debug, thiserror::Error)]
pub enum AnalyzeError {
    #[error("Failed to read input file.")]
    ReadInput,
    #[error("Unable to parse input file.")]
    ParseInput,
    #[error("Failed to write output.")]
    WriteOutput,
}
