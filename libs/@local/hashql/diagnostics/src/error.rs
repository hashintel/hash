use core::error::Error;

#[derive(Debug, Clone, PartialEq, Eq, Hash, derive_more::Display)]
pub enum ResolveError {
    #[display("unknown span {span}")]
    UnknownSpan { span: String },
}

impl Error for ResolveError {}
