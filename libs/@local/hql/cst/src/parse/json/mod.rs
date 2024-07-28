pub(crate) mod node;
pub(crate) mod node_object;
pub(crate) mod program;
pub(crate) mod util;
pub(crate) mod value;

use winnow::{
    error::{ContextError, ErrMode},
    stream::AsBStr,
};

pub use self::{
    node::NodeParseError,
    node_object::NodePbjectParseError,
    program::ProgramParseError,
    util::{ArrayParseError, ObjectParseError, ParseError},
    value::ValueParseError,
};

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
#[error("{display}")]
pub struct WinnowError {
    display: Box<str>,
    error: ErrMode<ContextError>,
}

impl<I> From<winnow::error::ParseError<I, ErrMode<ContextError>>> for WinnowError
where
    I: AsBStr,
{
    fn from(error: winnow::error::ParseError<I, ErrMode<ContextError>>) -> Self {
        Self {
            display: error.to_string().into_boxed_str(),
            error: error.into_inner(),
        }
    }
}
