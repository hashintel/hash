mod ai;
mod machine;
mod user;

use alloc::sync::Arc;
use core::iter;
use std::{collections::HashSet, sync::LazyLock};

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::{Report, ResultExt as _};
use smol_str::SmolStr;
use type_system::principal::actor::{Actor, ActorEntityUuid, ActorId, AiId, MachineId, UserId};

use crate::policies::{
    cedar::{
        FromCedarEntityId as _, FromCedarEntityUId, ToCedarEntity, ToCedarEntityId, ToCedarValue,
    },
    error::FromCedarRefernceError,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum AuthenticatedActor {
    Id(ActorId),
    Uuid(ActorEntityUuid),
}

impl From<AuthenticatedActor> for ActorEntityUuid {
    fn from(authenticated_actor: AuthenticatedActor) -> Self {
        match authenticated_actor {
            AuthenticatedActor::Id(actor_id) => Self::new(actor_id),
            AuthenticatedActor::Uuid(actor_uuid) => actor_uuid,
        }
    }
}

impl From<ActorId> for AuthenticatedActor {
    fn from(actor_id: ActorId) -> Self {
        Self::Id(actor_id)
    }
}

impl From<Option<ActorId>> for AuthenticatedActor {
    fn from(actor_id: Option<ActorId>) -> Self {
        actor_id.map_or_else(|| Self::Uuid(ActorEntityUuid::public_actor()), Self::Id)
    }
}

impl From<MachineId> for AuthenticatedActor {
    fn from(machine_id: MachineId) -> Self {
        Self::Id(machine_id.into())
    }
}

impl From<UserId> for AuthenticatedActor {
    fn from(user_id: UserId) -> Self {
        Self::Id(user_id.into())
    }
}

impl From<AiId> for AuthenticatedActor {
    fn from(ai_id: AiId) -> Self {
        Self::Id(ai_id.into())
    }
}

impl From<ActorEntityUuid> for AuthenticatedActor {
    fn from(actor_uuid: ActorEntityUuid) -> Self {
        Self::Uuid(actor_uuid)
    }
}

pub struct PublicActor;

impl ToCedarEntityId for PublicActor {
    fn to_cedar_entity_type(&self) -> &'static Arc<ast::EntityType> {
        pub(crate) static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Public"]));
        &ENTITY_TYPE
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new("public")
    }
}

impl ToCedarEntity for PublicActor {
    fn to_cedar_entity(&self) -> ast::Entity {
        ast::Entity::new(
            self.to_euid(),
            [(
                SmolStr::new_static("id"),
                ast::RestrictedExpr::record([
                    (
                        SmolStr::new_static("id"),
                        ast::RestrictedExpr::val("00000000-0000-0000-0000-000000000000"),
                    ),
                    (
                        SmolStr::new_static("type"),
                        ast::RestrictedExpr::val("public"),
                    ),
                ])
                .expect("No duplicate keys in public actor record"),
            )],
            HashSet::new(),
            HashSet::new(),
            iter::empty(),
            Extensions::none(),
        )
        .expect("Public actor should be a valid Cedar entity")
    }
}

impl ToCedarValue for ActorId {
    fn to_cedar_value(&self) -> ast::Value {
        match self {
            Self::User(user_id) => user_id.to_cedar_value(),
            Self::Machine(machine_id) => machine_id.to_cedar_value(),
            Self::Ai(ai_id) => ai_id.to_cedar_value(),
        }
    }
}

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
