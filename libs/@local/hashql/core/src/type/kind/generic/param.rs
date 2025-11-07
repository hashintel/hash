use pretty::RcDoc;

use super::GenericArgumentId;
use crate::{
    pretty::{ORANGE, PrettyPrint, PrettyPrintBoundary},
    r#type::environment::Environment,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Param {
    pub argument: GenericArgumentId,
}
