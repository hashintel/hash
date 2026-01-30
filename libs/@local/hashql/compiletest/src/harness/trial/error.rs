use core::error;

#[derive(Debug, Clone, PartialEq, Eq, Hash, derive_more::Display)]
pub enum TrialError {
    #[display("io")]
    Io,
    #[display("annotation parsing: failed to process test annotations")]
    AnnotationParsing,
    #[display("source parsing: invalid syntax in test code")]
    SourceParsing,
    #[display("stdout discrepancy, try to bless the output:\n{_0}")]
    StdoutDiscrepancy(String),
    #[display("stderr discrepancy, try to bless the output:\n{_0}")]
    StderrDiscrepancy(String),
    #[display("secondary file {_0} discrepancy, try to bless the output:\n{_1}")]
    SecondaryFileDiscrepancy(&'static str, String),
    #[display("Expected trial to fail, but it passed instead")]
    TrialShouldFail,
    #[display("Expected trial to pass, but it failed")]
    TrialShouldPass,
    #[display("Assertion failed for trial: {message}")]
    AssertionFailed { message: String },
    #[display("Trial suite has created an unexpected secondary file with extension: {_0}")]
    UnexpectedSecondaryFile(&'static str),
    #[display("Unable to complete run {_0}: {_1}")]
    Run(&'static str, &'static str),
    #[display("Failed to verify annotation")]
    Annotation,
}

impl error::Error for TrialError {}
