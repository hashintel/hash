use alloc::sync::Arc;
#[cfg(feature = "postgres")]
use core::error::Error;
use core::{fmt, iter, str::FromStr};
use std::sync::LazyLock;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _};
use serde::Serialize as _;

use super::cedar::ToCedarEntityId;
use crate::policies::cedar::FromCedarEntityId;

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    serde::Serialize,
    serde::Deserialize,
    enum_iterator::Sequence,
)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum ActionName {
    #[cfg_attr(feature = "codegen", specta(skip))]
    All,

    #[cfg_attr(feature = "codegen", specta(skip))]
    Create,
    CreateEntity,
    CreateEntityType,
    CreatePropertyType,
    CreateWeb,

    #[cfg_attr(feature = "codegen", specta(skip))]
    View,
    ViewEntity,
    ViewEntityType,
    ViewPropertyType,

    #[cfg_attr(feature = "codegen", specta(skip))]
    Update,
    UpdateEntity,
    UpdateEntityType,
    UpdatePropertyType,

    #[cfg_attr(feature = "codegen", specta(skip))]
    Archive,
    ArchiveEntity,
    ArchiveEntityType,
    ArchivePropertyType,

    Instantiate,
}

impl ActionName {
    pub fn all() -> impl Iterator<Item = Self> {
        enum_iterator::all::<Self>()
    }

    #[must_use]
    pub const fn parent(self) -> Option<Self> {
        match self {
            Self::All => None,
            Self::Create
            | Self::CreateWeb
            | Self::View
            | Self::Update
            | Self::Archive
            | Self::Instantiate => Some(Self::All),
            Self::CreateEntity | Self::CreateEntityType | Self::CreatePropertyType => {
                Some(Self::Create)
            }
            Self::ViewEntity | Self::ViewEntityType | Self::ViewPropertyType => Some(Self::View),
            Self::UpdateEntity | Self::UpdateEntityType | Self::UpdatePropertyType => {
                Some(Self::Update)
            }
            Self::ArchiveEntity | Self::ArchiveEntityType | Self::ArchivePropertyType => {
                Some(Self::Archive)
            }
        }
    }

    pub fn parents(self) -> impl Iterator<Item = Self> {
        iter::successors(self.parent(), |&action| action.parent())
    }

    #[must_use]
    pub fn is_parent_of(self, other: Self) -> bool {
        other.parents().any(|parent| parent == self)
    }

    #[must_use]
    pub fn is_child_of(self, other: Self) -> bool {
        self.parents().any(|parent| parent == other)
    }
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

impl FromCedarEntityId for ActionName {
    type Error = Report<InvalidActionConstraint>;

    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Action"]));
        &ENTITY_TYPE
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Self::Error> {
        Self::from_str(eid.as_ref()).change_context(InvalidActionConstraint::InvalidAction)
    }
}

impl ToCedarEntityId for ActionName {
    fn to_cedar_entity_type(&self) -> &'static Arc<ast::EntityType> {
        Self::entity_type()
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.to_string())
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
    use std::collections::HashMap;

    use indoc::formatdoc;
    use pretty_assertions::assert_eq;
    use serde_json::{Value as JsonValue, json};
    use uuid::Uuid;

    use crate::{
        policies::{
            ActionName, Effect, Policy, PolicyId,
            cedar::{FromCedarEntityUId as _, ToCedarEntityId as _},
            tests::check_policy,
            validation,
        },
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
            id: PolicyId::new(Uuid::new_v4()),
            name: None,
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
                "id": policy.id,
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

    /// Validates consistency between the Rust `ActionName` enum hierarchy and the Cedar schema.
    /// This test ensures that:
    /// - Each action defined in the Cedar schema can be mapped to a Rust `ActionName`
    /// - The parent-child relationships defined by `action.parents()` match the hierarchical
    ///   relationships in the Cedar schema (descendants)
    #[test]
    fn action_ids() -> Result<(), Box<dyn Error>> {
        for action_id in validation::PolicyValidator::schema().action_ids() {
            let action_name = ActionName::from_euid(action_id.name())?;
            for descendant_id in action_id.descendants() {
                let descendant = ActionName::from_euid(descendant_id)?;
                println!("{action_name} is parent of {descendant}");
                assert!(
                    action_name.is_parent_of(descendant),
                    "{action_name} is not a parent of {descendant}"
                );
                assert!(
                    descendant.is_child_of(action_name),
                    "{descendant} is not a child of {action_name}"
                );
            }
        }

        Ok(())
    }

    /// Complements the `action_ids` test by validating consistency in the reverse direction.
    /// This test ensures that:
    /// - Every `ActionName` enum variant is present in the Cedar schema
    /// - For each action, its `parents()` method returns actions that are consistent with the
    ///   descendants relationship in the Cedar schema
    /// - Every descendant of an action in the Cedar schema is correctly identified as a child of
    ///   that action in the Rust code
    #[test]
    fn action_names() -> Result<(), Box<dyn Error>> {
        let action_ids = validation::PolicyValidator::schema()
            .action_ids()
            .map(|action_id| ActionName::from_euid(action_id.name()).map(|name| (name, action_id)))
            .collect::<Result<HashMap<_, _>, _>>()?;
        for action in ActionName::all() {
            let action_id = action.to_euid();
            for parent in action.parents() {
                assert!(
                    action_ids[&parent]
                        .descendants()
                        .any(|descendant| *descendant == action_id),
                    "{parent} is not a parent of {action}"
                );
            }
            let action_id = action_ids
                .get(&action)
                .unwrap_or_else(|| panic!("Action {action:?} is not present in the schema"));
            for descendant_id in action_id.descendants() {
                let descendant = ActionName::from_euid(descendant_id)?;
                assert!(
                    descendant.is_child_of(action),
                    "{descendant} is not a child of {action}"
                );
            }
        }

        Ok(())
    }

    #[test]
    fn parents() {
        // All has no parents
        assert_eq!(ActionName::All.parents().collect::<Vec<_>>(), vec![]);

        // First level actions have All as their only parent
        assert_eq!(
            ActionName::Create.parents().collect::<Vec<_>>(),
            vec![ActionName::All]
        );
        assert_eq!(
            ActionName::CreateWeb.parents().collect::<Vec<_>>(),
            vec![ActionName::All]
        );
        assert_eq!(
            ActionName::View.parents().collect::<Vec<_>>(),
            vec![ActionName::All]
        );
        assert_eq!(
            ActionName::Update.parents().collect::<Vec<_>>(),
            vec![ActionName::All]
        );
        assert_eq!(
            ActionName::Archive.parents().collect::<Vec<_>>(),
            vec![ActionName::All]
        );
        assert_eq!(
            ActionName::Instantiate.parents().collect::<Vec<_>>(),
            vec![ActionName::All]
        );

        // Second level actions have their direct parent and All as ancestors
        for action in [
            ActionName::CreateEntity,
            ActionName::CreateEntityType,
            ActionName::CreatePropertyType,
        ] {
            assert_eq!(
                action.parents().collect::<Vec<_>>(),
                vec![ActionName::Create, ActionName::All]
            );
        }

        for action in [
            ActionName::ViewEntity,
            ActionName::ViewEntityType,
            ActionName::ViewPropertyType,
        ] {
            assert_eq!(
                action.parents().collect::<Vec<_>>(),
                vec![ActionName::View, ActionName::All]
            );
        }

        for action in [
            ActionName::UpdateEntity,
            ActionName::UpdateEntityType,
            ActionName::UpdatePropertyType,
        ] {
            assert_eq!(
                action.parents().collect::<Vec<_>>(),
                vec![ActionName::Update, ActionName::All]
            );
        }

        for action in [
            ActionName::ArchiveEntity,
            ActionName::ArchiveEntityType,
            ActionName::ArchivePropertyType,
        ] {
            assert_eq!(
                action.parents().collect::<Vec<_>>(),
                vec![ActionName::Archive, ActionName::All]
            );
        }
    }

    #[test]
    fn is_parent_of() {
        for action in [
            ActionName::CreateEntity,
            ActionName::CreateEntityType,
            ActionName::CreatePropertyType,
        ] {
            assert!(ActionName::Create.is_parent_of(action));
            assert!(action.is_child_of(ActionName::Create));
        }

        for action in [
            ActionName::ViewEntity,
            ActionName::ViewEntityType,
            ActionName::ViewPropertyType,
        ] {
            assert!(ActionName::View.is_parent_of(action));
            assert!(action.is_child_of(ActionName::View));
        }

        for action in [
            ActionName::UpdateEntity,
            ActionName::UpdateEntityType,
            ActionName::UpdatePropertyType,
        ] {
            assert!(ActionName::Update.is_parent_of(action));
            assert!(action.is_child_of(ActionName::Update));
        }

        for action in [
            ActionName::ArchiveEntity,
            ActionName::ArchiveEntityType,
            ActionName::ArchivePropertyType,
        ] {
            assert!(ActionName::Archive.is_parent_of(action));
            assert!(action.is_child_of(ActionName::Archive));
        }

        // Negative cases
        assert!(!ActionName::Create.is_parent_of(ActionName::View));
        assert!(!ActionName::View.is_parent_of(ActionName::Create));
        assert!(!ActionName::All.is_parent_of(ActionName::All));
        assert!(!ActionName::ViewEntity.is_parent_of(ActionName::View));
        assert!(!ActionName::CreateEntity.is_parent_of(ActionName::Create));

        assert!(!ActionName::View.is_child_of(ActionName::Create));
        assert!(!ActionName::Create.is_child_of(ActionName::View));
        assert!(!ActionName::All.is_child_of(ActionName::All));
        assert!(!ActionName::View.is_child_of(ActionName::ViewEntity));
        assert!(!ActionName::Create.is_child_of(ActionName::CreateEntity));
    }
}
