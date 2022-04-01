use std::collections::{
    hash_map::{Iter, Values},
    HashMap,
};

use stateful::field::{
    FieldKey, FieldScope, FieldSpec, FieldType, FieldTypeVariant, PresetFieldType,
};

use crate::{
    datastore::error::{Error, Result},
    hash_types::state::AgentStateField,
    simulation::package::name::PackageName,
};

pub mod accessor;
pub mod built_in;
pub mod creator;

pub const HIDDEN_PREFIX: &str = "_HIDDEN_";
pub const PRIVATE_PREFIX: &str = "_PRIVATE_";
pub const PREVIOUS_INDEX_FIELD_NAME: &str = "previous_index";

/// Create a new `FieldKey` from this scope with the provided `name` and the specified source.
///
/// # Errors
///
/// - Returns [`Error`] if name starts with [`PRIVATE_PREFIX`] or [`HIDDEN_PREFIX`]
pub fn create_field_key(scope: FieldScope, name: &str, source: FieldSource) -> Result<FieldKey> {
    // TODO: do we want these checks to only be present on debug builds
    if name.starts_with(PRIVATE_PREFIX) || name.starts_with(HIDDEN_PREFIX) {
        return Err(Error::from(format!(
            "Field names cannot start with the protected prefixes: [{PRIVATE_PREFIX:?}, \
             {HIDDEN_PREFIX:?}], received field name: {name:?}"
        )));
    }

    let scope_prefix = match scope {
        FieldScope::Private => Some(PRIVATE_PREFIX),
        FieldScope::Hidden => Some(HIDDEN_PREFIX),
        FieldScope::Agent => None,
    };

    if let Some(prefix) = scope_prefix {
        Ok(FieldKey::new(format!(
            "{prefix}{}_{name}",
            source.unique_id()?
        )))
    } else {
        Ok(FieldKey::new(name.to_string()))
    }
}

/// Defines the source from which a Field was specified, useful for resolving clashes
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum FieldSource {
    Engine,
    Package(PackageName),
}

impl FieldSource {
    /// A unique static identifier of the package source, used in building Keys for fields
    pub fn unique_id(&self) -> Result<String> {
        match self {
            FieldSource::Engine => Ok("0".into()),
            FieldSource::Package(package_name) => Ok(package_name
                .get_id()
                .map_err(|err| Error::from(err.to_string()))?
                .to_string()),
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

/// A single specification of a root field, for instance in the case of a struct field it's the top
/// level struct field and the children are all FieldSpec
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct RootFieldSpec {
    pub inner: FieldSpec,
    pub scope: FieldScope,
    pub source: FieldSource,
}

impl RootFieldSpec {
    pub fn create_key(&self) -> Result<FieldKey> {
        create_field_key(self.scope, &self.inner.name, self.source)
    }
}

/// A wrapper struct around a hashmap of field-keys (unique identifiers used to name/label Arrow
/// data columns mapped to the specification of those fields
#[derive(Debug, Clone, Default, Eq, PartialEq)]
pub struct FieldSpecMap {
    field_specs: HashMap<FieldKey, RootFieldSpec>,
    /* a mapping of field unique identifiers to
     * the fields themselves */
}

impl FieldSpecMap {
    pub fn empty() -> FieldSpecMap {
        FieldSpecMap {
            field_specs: HashMap::new(),
        }
    }

    pub fn add_multiple(&mut self, new_field_specs: Vec<RootFieldSpec>) -> Result<()> {
        new_field_specs
            .into_iter()
            .try_for_each(|field_spec| self.add(field_spec))?;
        Ok(())
    }

    pub fn add(&mut self, new_field: RootFieldSpec) -> Result<()> {
        let field_key = new_field.create_key()?;
        if let Some(existing_field) = self.field_specs.get(&field_key) {
            if existing_field == &new_field {
                // This likely only happens when behaviors declare duplicate keys, it can't cause
                // problems as the fields are equal and therefore the sources (and types) are the
                // same, meaning the field can't override another package's field
                return Ok(());
            }
            if existing_field.scope == FieldScope::Agent
                && new_field.scope == FieldScope::Agent
                && existing_field.inner.field_type == new_field.inner.field_type
            {
                // TODO can this even happen, pretty sure it's equality
                if existing_field.source == new_field.source {
                    return Err(Error::AgentScopedFieldKeyClash(
                        field_key,
                        new_field.inner.field_type,
                        existing_field.inner.field_type.clone(),
                    ));
                } else if let FieldSource::Package(_package_src) = &new_field.source {
                    if existing_field.source == FieldSource::Engine {
                        tracing::warn!(
                            "Key clash when a package attempted to insert a new agent-scoped \
                             field with key: {:?}, the existing field was created by the engine, \
                             the new field will be ignored",
                            field_key
                        );
                        return Ok(());
                    }
                }
            }

            Err(Error::FieldKeyClash(
                field_key,
                new_field,
                existing_field.clone(),
            ))
        } else {
            self.field_specs.insert(field_key, new_field);
            Ok(())
        }
    }

    #[cfg(test)]
    pub(crate) fn union(&mut self, set: FieldSpecMap) -> Result<()> {
        set.field_specs
            .into_iter()
            .try_for_each(|(_, field_spec)| self.add(field_spec))
    }

    pub fn contains_key(&self, key: &FieldKey) -> bool {
        self.field_specs.contains_key(key)
    }

    pub(crate) fn iter(&self) -> Iter<'_, FieldKey, RootFieldSpec> {
        self.field_specs.iter()
    }

    pub(crate) fn field_specs(&self) -> Values<'_, FieldKey, RootFieldSpec> {
        self.field_specs.values()
    }

    pub fn len(&self) -> usize {
        self.field_specs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub(in crate::datastore) fn get_field_spec(
        &self,
        field_key: &FieldKey,
    ) -> Result<&RootFieldSpec> {
        self.field_specs
            .get(field_key)
            .ok_or_else(|| Error::from(format!("Cannot find field with name '{:?}'", field_key)))
    }
}

impl TryInto<RootFieldSpec> for AgentStateField {
    type Error = Error;

    fn try_into(self) -> Result<RootFieldSpec> {
        Ok(RootFieldSpec {
            inner: FieldSpec {
                name: self.name().into(),
                field_type: self.try_into()?,
            },
            scope: FieldScope::Agent,
            source: FieldSource::Engine,
        })
    }
}

// TODO: remove dependency on legacy `AgentStateField` (contains references to package fields)
impl TryInto<FieldType> for AgentStateField {
    type Error = Error;

    fn try_into(self) -> Result<FieldType> {
        let name = self.name();

        let field_type = match self {
            AgentStateField::AgentId => {
                FieldType::new(FieldTypeVariant::Preset(PresetFieldType::Id), false)
            }
            AgentStateField::AgentName | AgentStateField::Shape | AgentStateField::Color => {
                FieldType::new(FieldTypeVariant::String, true)
            }
            AgentStateField::Position
            | AgentStateField::Direction
            | AgentStateField::Scale
            | AgentStateField::Velocity
            | AgentStateField::RGB => FieldType::new(
                FieldTypeVariant::FixedLengthArray {
                    field_type: Box::new(FieldType::new(FieldTypeVariant::Number, false)),
                    len: 3,
                },
                true,
            ),
            AgentStateField::Hidden => {
                // TODO: diff w/ `AgentStateField`

                FieldType::new(FieldTypeVariant::Boolean, false)
            }
            AgentStateField::Height => FieldType::new(FieldTypeVariant::Number, true),
            // Note `Messages` and `Extra` and 'BehaviorId' are not included in here:
            // 1) `Messages` as they are in a separate batch
            // 2) `Extra` as they are not yet implemented
            // 3) 'BehaviorId' as it is only used in hash_engine
            AgentStateField::Extra(_) | AgentStateField::Messages => {
                return Err(Error::from(format!(
                    "Cannot match built in field with name {}",
                    name
                )));
            }
        };
        Ok(field_type)
    }
}

// TODO: Expand unit tests to cover more cases, such as the AgentScopedFieldKeyClash branch, and
// possibly split across modules
#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::{
        datastore::schema::RootFieldSpecCreator,
        simulation::package::creator::get_base_agent_fields,
    };

    #[test]
    fn name_collision_built_in() {
        let field_spec_creator = RootFieldSpecCreator::new(FieldSource::Engine);
        let mut field_spec_map = FieldSpecMap::empty();

        field_spec_map
            .add_multiple(get_base_agent_fields().unwrap())
            .unwrap();

        let err = field_spec_map
            .add(field_spec_creator.create(
                "agent_id".to_string(),
                FieldType::new(FieldTypeVariant::Number, true),
                FieldScope::Agent,
            ))
            .unwrap_err();
        assert!(matches!(err, Error::FieldKeyClash(..)));
    }

    #[test]
    fn name_collision_custom() {
        let field_spec_creator = RootFieldSpecCreator::new(FieldSource::Engine);
        let mut field_spec_map = FieldSpecMap::empty();

        field_spec_map
            .add_multiple(get_base_agent_fields().unwrap())
            .unwrap();

        field_spec_map
            .add(field_spec_creator.create(
                "test".to_string(),
                FieldType::new(FieldTypeVariant::String, false),
                FieldScope::Private,
            ))
            .unwrap();

        let err = field_spec_map
            .add(field_spec_creator.create(
                "test".to_string(),
                FieldType::new(FieldTypeVariant::String, true),
                FieldScope::Private,
            ))
            .unwrap_err();
        assert!(matches!(err, Error::FieldKeyClash(..)));
    }

    #[test]
    fn unchanged_size_built_in() {
        let _field_spec_creator = RootFieldSpecCreator::new(FieldSource::Engine);
        let mut field_spec_map = FieldSpecMap::empty();

        field_spec_map
            .add_multiple(get_base_agent_fields().unwrap())
            .unwrap();

        let len_before = field_spec_map.len();

        field_spec_map
            .add(AgentStateField::AgentId.try_into().unwrap())
            .unwrap();

        assert_eq!(len_before, field_spec_map.len());
    }

    #[test]
    fn unchanged_size_custom() {
        let field_spec_creator = RootFieldSpecCreator::new(FieldSource::Engine);
        let mut field_spec_map = FieldSpecMap::empty();

        field_spec_map
            .add(field_spec_creator.create(
                "test".to_string(),
                FieldType::new(FieldTypeVariant::String, false),
                FieldScope::Agent,
            ))
            .unwrap();
        field_spec_map
            .add(field_spec_creator.create(
                "test".to_string(),
                FieldType::new(FieldTypeVariant::String, false),
                FieldScope::Agent,
            ))
            .unwrap();
        field_spec_map
            .add(field_spec_creator.create(
                "test".to_string(),
                FieldType::new(FieldTypeVariant::String, false),
                FieldScope::Agent,
            ))
            .unwrap();

        assert_eq!(field_spec_map.len(), 1);
    }

    #[test]
    pub fn test_struct_types_enabled() -> Result<()> {
        let mut keys = FieldSpecMap::default();
        keys.add(RootFieldSpec {
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
            source: FieldSource::Engine,
        })?;

        keys.get_arrow_schema()?;
        Ok(())
    }
}
