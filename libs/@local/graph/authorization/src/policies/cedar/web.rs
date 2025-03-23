use core::fmt;

use cedar_policy_core::ast;
use error_stack::Report;
use type_system::web::OwnedById;

use super::{CedarEntityId as _, CedarExpressionVisitor};

pub(crate) struct WebIdVisitor;

impl CedarExpressionVisitor for WebIdVisitor {
    type Error = Report<uuid::Error>;
    type Value = OwnedById;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("a web id EUID")
    }

    fn visit_euid(&self, euid: &ast::EntityUID) -> Option<Result<Self::Value, Self::Error>> {
        (*euid.entity_type() == **OwnedById::entity_type()).then(|| OwnedById::from_eid(euid.eid()))
    }
}
