use std::cmp::Ordering;

use stateful::{
    field::{FieldSource, FieldSpec, FieldType, FieldTypeVariant, PresetFieldType},
    Result,
};

use crate::simulation::package::name::PackageName;

pub mod built_in;

pub const PREVIOUS_INDEX_FIELD_NAME: &str = "previous_index";

/// Defines the source from which a Field was specified, useful for resolving clashes
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum EngineComponent {
    Engine,
    Package(PackageName),
}

impl FieldSource for EngineComponent {
    fn unique_id(&self) -> Result<usize> {
        match self {
            EngineComponent::Engine => Ok(0),
            EngineComponent::Package(package_name) => Ok(package_name
                .get_id()
                .map_err(|err| stateful::Error::from(err.to_string()))?
                .as_usize()),
        }
    }

    fn can_guarantee_null(&self) -> bool {
        *self == EngineComponent::Engine
    }
}

impl PartialOrd for EngineComponent {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        // TODO: We only do a partial ordering as we currently don't have a defined precedence of
        //   packages. When `PartialOrd` for `PackageName` is implemented, derive it instead.
        match (self, other) {
            (Self::Engine, Self::Engine) => Some(Ordering::Equal),
            (Self::Engine, Self::Package(_)) => Some(Ordering::Greater),
            (Self::Package(_), Self::Engine) => Some(Ordering::Less),
            (Self::Package(_), Self::Package(_)) => None,
        }
    }
}

/// This key is required for accessing neighbors' outboxes (new inboxes).
/// Since the neighbor agent state is always the previous step state of the
/// agent, then we need to know where its outbox is. This would be
/// straightforward if we didn't add/remove/move agents between batches.
/// This means `AgentBatch` ordering gets changed at the beginning of the step
/// meaning agents are not aligned with their `OutboxBatch` anymore.
#[must_use]
// TODO: migrate this to be logic handled by the Engine
pub fn last_state_index_key() -> FieldSpec {
    // There are 2 indices for every agent: 1) Group index 2) Row (agent) index. This points
    // to the relevant old outbox (i.e. new inbox)
    FieldSpec {
        name: PREVIOUS_INDEX_FIELD_NAME.to_string(),
        field_type: FieldType::new(
            FieldTypeVariant::FixedLengthArray {
                field_type: Box::new(FieldType::new(
                    FieldTypeVariant::Preset(PresetFieldType::Uint32),
                    false,
                )),
                len: 2,
            },
            // This key is nullable because new agents
            // do not get an index (their outboxes are empty by default)
            true,
        ),
    }
}

// TODO: Expand unit tests to cover more cases, such as the AgentScopedFieldKeyClash branch, and
// possibly split across modules
#[cfg(test)]
pub mod tests {
    use stateful::{
        agent::AgentStateField,
        field::{FieldScope, FieldSpecMap, RootFieldSpec, RootFieldSpecCreator},
        Error,
    };

    use super::*;
    use crate::{
        datastore::test_utils::root_field_spec_from_agent_field,
        simulation::package::creator::get_base_agent_fields,
    };

    #[test]
    fn name_collision_built_in() {
        let field_spec_creator = RootFieldSpecCreator::new(EngineComponent::Engine);
        let mut field_spec_map = FieldSpecMap::empty();

        field_spec_map
            .try_extend(get_base_agent_fields().unwrap())
            .unwrap();

        let err = field_spec_map
            .try_extend([field_spec_creator.create(
                "agent_id".to_string(),
                FieldType::new(FieldTypeVariant::Number, true),
                FieldScope::Agent,
            )])
            .unwrap_err();
        assert!(matches!(err, Error::FieldKeyClash(..)));
    }

    #[test]
    fn name_collision_custom() {
        let field_spec_creator = RootFieldSpecCreator::new(EngineComponent::Engine);
        let mut field_spec_map = FieldSpecMap::empty();

        field_spec_map
            .try_extend(get_base_agent_fields().unwrap())
            .unwrap();

        field_spec_map
            .try_extend([field_spec_creator.create(
                "test".to_string(),
                FieldType::new(FieldTypeVariant::String, false),
                FieldScope::Private,
            )])
            .unwrap();

        let err = field_spec_map
            .try_extend([field_spec_creator.create(
                "test".to_string(),
                FieldType::new(FieldTypeVariant::String, true),
                FieldScope::Private,
            )])
            .unwrap_err();
        assert!(matches!(err, Error::FieldKeyClash(..)));
    }

    #[test]
    fn unchanged_size_built_in() {
        let _field_spec_creator = RootFieldSpecCreator::new(EngineComponent::Engine);
        let mut field_spec_map = FieldSpecMap::empty();

        field_spec_map
            .try_extend(get_base_agent_fields().unwrap())
            .unwrap();

        let len_before = field_spec_map.len();

        field_spec_map
            .try_extend([root_field_spec_from_agent_field(AgentStateField::AgentId).unwrap()])
            .unwrap();

        assert_eq!(len_before, field_spec_map.len());
    }

    #[test]
    fn unchanged_size_custom() {
        let field_spec_creator = RootFieldSpecCreator::new(EngineComponent::Engine);
        let mut field_spec_map = FieldSpecMap::empty();

        field_spec_map
            .try_extend([field_spec_creator.create(
                "test".to_string(),
                FieldType::new(FieldTypeVariant::String, false),
                FieldScope::Agent,
            )])
            .unwrap();
        field_spec_map
            .try_extend([field_spec_creator.create(
                "test".to_string(),
                FieldType::new(FieldTypeVariant::String, false),
                FieldScope::Agent,
            )])
            .unwrap();
        field_spec_map
            .try_extend([field_spec_creator.create(
                "test".to_string(),
                FieldType::new(FieldTypeVariant::String, false),
                FieldScope::Agent,
            )])
            .unwrap();

        assert_eq!(field_spec_map.len(), 1);
    }

    #[test]
    pub fn test_struct_types_enabled() -> Result<()> {
        let mut keys = FieldSpecMap::default();
        keys.try_extend([RootFieldSpec {
            inner: FieldSpec {
                name: "struct".to_string(),
                field_type: FieldType::new(
                    FieldTypeVariant::Struct(vec![
                        FieldSpec {
                            name: "first_column".to_string(),
                            field_type: FieldType::new(FieldTypeVariant::Number, false),
                        },
                        FieldSpec {
                            name: "second_column".to_string(),
                            field_type: FieldType::new(FieldTypeVariant::Boolean, true),
                        },
                    ]),
                    true,
                ),
            },
            scope: FieldScope::Private,
            source: EngineComponent::Engine,
        }])?;

        keys.create_arrow_schema()?;
        Ok(())
    }
}
