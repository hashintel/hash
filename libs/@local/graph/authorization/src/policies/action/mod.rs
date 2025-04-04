use alloc::sync::Arc;
use core::{error::Error, fmt, str::FromStr};
use std::sync::LazyLock;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _};
use serde::Serialize as _;

use crate::policies::cedar::CedarEntityId;

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
#[serde(rename_all = "camelCase")]
pub enum ActionName {
    All,

    Create,

    View,
    ViewEntity,

    Update,

    Instantiate,
}

#[cfg(feature = "postgres")]
impl<'a> postgres_types::FromSql<'a> for ActionName {
    postgres_types::accepts!(TEXT);

    fn from_sql(
        ty: &postgres_types::Type,
        raw: &'a [u8],
    ) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self::from_str(
            <&str as postgres_types::FromSql>::from_sql(ty, raw)?,
        )?)
    }
}

#[cfg(feature = "postgres")]
impl postgres_types::ToSql for ActionName {
    postgres_types::accepts!(TEXT);

    postgres_types::to_sql_checked!();

    fn to_sql(
        &self,
        ty: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        self.to_string().to_sql(ty, out)
    }
}

impl FromStr for ActionName {
    type Err = Report<InvalidActionConstraint>;

    fn from_str(action: &str) -> Result<Self, Self::Err> {
        serde_plain::from_str(action).change_context(InvalidActionConstraint::InvalidAction)
    }
}

impl fmt::Display for ActionName {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl CedarEntityId for ActionName {
    type Error = Report<InvalidActionConstraint>;

    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Action"]));
        &ENTITY_TYPE
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.to_string())
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Self::Error> {
        Self::from_str(eid.as_ref()).change_context(InvalidActionConstraint::InvalidAction)
    }
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum InvalidActionConstraint {
    #[display("Invalid action in constraint")]
    InvalidAction,
}

#[cfg(test)]
#[expect(clippy::panic_in_result_fn, reason = "Assertions in test are expected")]
mod tests {
    use core::error::Error;

    use indoc::formatdoc;
    use pretty_assertions::assert_eq;
    use serde_json::{Value as JsonValue, json};

    use crate::{
        policies::{ActionName, Effect, Policy, tests::check_policy},
        test_utils::check_serialization,
    };

    #[track_caller]
    pub(crate) fn check_action(
        constraint: Vec<ActionName>,
        value: JsonValue,
        cedar_string: impl AsRef<str>,
    ) -> Result<(), Box<dyn Error>> {
        let cedar_string = cedar_string.as_ref();

        let policy = Policy {
            effect: Effect::Permit,
            principal: None,
            actions: constraint,
            resource: None,
            constraints: None,
        };
        let cedar_policy = policy.to_cedar_static_policy()?;

        assert_eq!(cedar_policy.action_constraint().to_string(), cedar_string);

        check_policy(
            &policy,
            json!({
                "effect": "permit",
                "principal": null,
                "actions": &value,
                "resource": null,
            }),
            formatdoc!(
                "permit(
                  principal,
                  {cedar_string},
                  resource
                ) when {{
                  true
                }};"
            ),
        )?;

        check_serialization(&policy.actions, value);

        let parsed_policy = Policy::try_from_cedar(&cedar_policy)?;
        assert_eq!(parsed_policy, policy);

        Ok(())
    }

    #[test]
    fn constraint_all() -> Result<(), Box<dyn Error>> {
        check_action(vec![ActionName::All], json!(["all"]), "action")?;

        Ok(())
    }

    #[test]
    fn constraint_one() -> Result<(), Box<dyn Error>> {
        let action = ActionName::View;
        check_action(
            vec![action],
            json!(["view"]),
            format!(r#"action in [HASH::Action::"{action}"]"#),
        )?;

        Ok(())
    }

    #[test]
    fn constraint_many() -> Result<(), Box<dyn Error>> {
        let actions = [ActionName::View, ActionName::Update];
        check_action(
            vec![actions[0], actions[1]],
            json!(["view", "update"]),
            format!(
                r#"action in [HASH::Action::"{}",HASH::Action::"{}"]"#,
                actions[0], actions[1]
            ),
        )?;

        Ok(())
    }
}
