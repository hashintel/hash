use alloc::{collections::BTreeMap, sync::Arc};
use core::error::Error;

use cedar_policy_core::ast;
use smol_str::SmolStr;

#[derive(Debug, derive_more::Display)]
pub(crate) enum CedarExpressionParseError {
    #[display("parsing the expression failed")]
    ParseError,
}

impl Error for CedarExpressionParseError {}
