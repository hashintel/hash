mod ai;
mod machine;
mod user;

use alloc::sync::Arc;

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _};
use type_system::principal::actor::{Actor, ActorId, AiId, MachineId, UserId};

use crate::policies::{
    cedar::{FromCedarEntityId as _, FromCedarEntityUId, ToCedarEntity, ToCedarEntityId},
    error::FromCedarRefernceError,
};

impl FromCedarEntityUId for ActorId {
    fn from_euid(euid: &ast::EntityUID) -> Result<Self, Report<FromCedarRefernceError>> {
        if *euid.entity_type() == **UserId::entity_type() {
            UserId::from_eid(euid.eid())
                .change_context(FromCedarRefernceError::InvalidCedarEntityId)
                .map(Self::User)
        } else if *euid.entity_type() == **MachineId::entity_type() {
            MachineId::from_eid(euid.eid())
                .change_context(FromCedarRefernceError::InvalidCedarEntityId)
                .map(Self::Machine)
        } else if *euid.entity_type() == **AiId::entity_type() {
            AiId::from_eid(euid.eid())
                .change_context(FromCedarRefernceError::InvalidCedarEntityId)
                .map(Self::Ai)
        } else {
            Err(Report::new(FromCedarRefernceError::UnexpectedEntityType {
                actual: euid.entity_type().clone(),
            }))
        }
    }
}

impl ToCedarEntityId for ActorId {
    fn to_cedar_entity_type(&self) -> &'static Arc<ast::EntityType> {
        match self {
            Self::User(user_id) => user_id.to_cedar_entity_type(),
            Self::Machine(machine_id) => machine_id.to_cedar_entity_type(),
            Self::Ai(ai_id) => ai_id.to_cedar_entity_type(),
        }
    }

    fn to_eid(&self) -> ast::Eid {
        match self {
            Self::User(user_id) => user_id.to_eid(),
            Self::Machine(machine_id) => machine_id.to_eid(),
            Self::Ai(ai_id) => ai_id.to_eid(),
        }
    }
}

impl ToCedarEntity for Actor {
    fn to_cedar_entity(&self) -> ast::Entity {
        match self {
            Self::User(user) => user.to_cedar_entity(),
            Self::Machine(machine) => machine.to_cedar_entity(),
            Self::Ai(ai) => ai.to_cedar_entity(),
        }
    }
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use serde_json::json;

    use crate::{policies::PrincipalConstraint, test_utils::check_deserialization_error};

    #[test]
    fn additional_actor_type_field() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actorType",
                "additional": "unexpected",
            }),
            "unknown field `additional`, expected `actorType`",
        )?;

        Ok(())
    }

    #[test]
    fn wrong_actor_type() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actorType",
                "actorType": "wrong",
            }),
            "unknown variant `wrong`, expected one of `user`, `machine`, `ai`",
        )?;

        Ok(())
    }

    #[test]
    fn missing_actor_id() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actor",
                "actorType": "user",
            }),
            "missing field `id`",
        )?;

        Ok(())
    }
}
