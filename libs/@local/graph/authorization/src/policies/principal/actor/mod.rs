mod ai;
mod machine;
mod user;

use cedar_policy_core::ast;

pub use self::{ai::Ai, machine::Machine, user::User};
use super::role::RoleId;

#[derive(Debug)]
pub enum Actor {
    User(User),
    Machine(Machine),
    Ai(Ai),
}

impl Actor {
    pub(crate) fn to_cedar_entity(&self) -> ast::Entity {
        match self {
            Self::User(user) => user.to_cedar_entity(),
            Self::Machine(machine) => machine.to_cedar_entity(),
            Self::Ai(ai) => ai.to_cedar_entity(),
        }
    }

    pub fn roles(&self) -> impl Iterator<Item = RoleId> {
        match self {
            Self::User(user) => user.roles.iter().copied(),
            Self::Machine(machine) => machine.roles.iter().copied(),
            Self::Ai(ai) => ai.roles.iter().copied(),
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
