use core::fmt;

use cedar_policy_core::ast;
use error_stack::Report;
use type_system::knowledge::entity::id::EntityUuid;

use super::{CedarExpressionVisitor, FromCedarEntityId as _};

pub(crate) struct EntityUuidVisitor;

impl CedarExpressionVisitor for EntityUuidVisitor {
    type Error = Report<uuid::Error>;
    type Value = EntityUuid;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("an entity EUID")
    }

    fn visit_euid(&self, euid: &ast::EntityUID) -> Option<Result<Self::Value, Self::Error>> {
        (*euid.entity_type() == **EntityUuid::entity_type())
            .then(|| EntityUuid::from_eid(euid.eid()))
    }
}
