use core::error::Error;

#[derive(Debug, derive_more::Display)]
pub(crate) enum CedarExpressionParseError {
    #[display("parsing the expression failed")]
    ParseError,
}

impl Error for CedarExpressionParseError {}
