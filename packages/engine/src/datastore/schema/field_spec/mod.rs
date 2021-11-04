use std::collections::hash_map::Iter;
use std::collections::HashMap;
use std::convert::TryInto;

use crate::hash_types::state::AgentStateField;
use arrow::datatypes::DataType as ArrowDataType;

use crate::datastore::error::{Error, Result};

use crate::simulation::packages::name::PackageName;

pub mod accessor;
pub mod builder;
pub mod built_in;
pub mod display;
pub mod short_json;

const HIDDEN_PREFIX: &str = "_HIDDEN_";
const PRIVATE_PREFIX: &str = "_PRIVATE_";

/// Special built-in field types
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum PresetFieldType {
    // Used to refer to an agent from the previous state
    Index,
    // Represents AgentId
    Id,
    // Represents any Arrow type
    Arrow(ArrowDataType),
}

/// Allowed field types
#[derive(Clone, PartialEq, Eq, Hash)]
pub enum FieldTypeVariant {
    Number,
    Boolean,
    String,
    Serialized,
    FixedLengthArray { kind: Box<FieldType>, len: usize },
    VariableLengthArray(Box<FieldType>),
    Struct(Vec<FieldSpec>),
    Preset(PresetFieldType),
}

/// Allowed field types
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct FieldType {
    pub variant: FieldTypeVariant,
    pub nullable: bool,
}

impl FieldType {
    pub fn new(variant: FieldTypeVariant, nullable: bool) -> FieldType {
        FieldType { variant, nullable }
    }
}

/// Defines scope of access to Fields, where the order of the variants of this enum define an
/// ordering of the scopes, where being defined lower implies a wider scope where more things can
/// access it.
/// i.e. Engine < Private < Hidden < Agent,
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum FieldScope {
    /// Only the source package/engine agents and other packages don't
    Private,
    /// Agents do not have access but packages and engine do
    Hidden,
    /// Agents, packages and engine have access
    Agent,
}

/// Defines the source from which a Field was specified, useful for resolving clashes
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum FieldSource {
    Engine,
    Package(PackageName),
}

impl FieldSource {
    /// A unique static identifier of the package source, used in building Keys for fields
    pub fn unique_id(&self) -> Result<String> {
        match self {
            FieldSource::Engine => Ok("_".into()),
            FieldSource::Package(package_name) => Ok(package_name
                .get_id()
                .map_err(|err| Error::from(err.to_string()))?
                .to_string()),
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Hash)]
pub struct FieldKey(String);

impl FieldKey {
    pub fn value(&self) -> &str {
        &self.0
    }

    // TODO do we want these checks to only be present on debug builds
    #[inline]
    pub fn new_agent_scoped(name: &str) -> Result<FieldKey> {
        if name.starts_with(PRIVATE_PREFIX) || name.starts_with(HIDDEN_PREFIX) {
            return Err(Error::from(format!(
                "Field names cannot start with the protected prefixes: ['{}', '{}']",
                PRIVATE_PREFIX, HIDDEN_PREFIX
            )));
        }
        if name == "messages" {
            return Err(Error::from(format!("'messages' is a protected field name. Fields cannot be created with that name with FieldScope::Agent")));
        }

        return Ok(FieldKey(name.to_string()));
    }

    #[inline]
    pub fn new_private_or_hidden_scoped(
        name: &str,
        source: &FieldSource,
        scope: &FieldScope,
    ) -> Result<FieldKey> {
        if name.starts_with(PRIVATE_PREFIX) || name.starts_with(HIDDEN_PREFIX) {
            return Err(Error::from(format!(
                "Field names cannot start with the protected prefixes: ['{}', '{}']",
                PRIVATE_PREFIX, HIDDEN_PREFIX
            )));
        }

        let mut key = String::new();
        match scope {
            FieldScope::Private => {
                key.push_str(PRIVATE_PREFIX);
                key.push_str(&source.unique_id()?);
            }
            FieldScope::Hidden => {
                key.push_str(HIDDEN_PREFIX);
                key.push_str(&source.unique_id()?);
            }
            FieldScope::Agent => {
                return Err(Error::from(
                    "Use new_agent_scoped to create a key with FieldScope::Agent",
                ))
            }
        }
        key.push_str(name);
        Ok(FieldKey(key))
    }
}

// TODO review pub declarations of struct members
/// A single specification of a field
#[derive(new, Clone, PartialEq, Eq, Hash)]
pub struct FieldSpec {
    pub name: String,
    pub field_type: FieldType,
}

/// A single specification of a root field, for instance in the case of a struct field it's the top
/// level struct field and the children are all FieldSpec
#[derive(Clone, Debug, Eq, Hash)]
pub struct RootFieldSpec {
    pub inner: FieldSpec,
    pub scope: FieldScope,
    pub source: FieldSource,
}

impl PartialEq for RootFieldSpec {
    // Key collision if just `built_in` differs
    // TODO scope, source, etc.
    fn eq(&self, other: &Self) -> bool {
        self.inner.name == other.inner.name && self.inner.field_type == other.inner.field_type
    }
}

impl RootFieldSpec {
    pub fn to_key(&self) -> Result<FieldKey> {
        match &self.scope {
            FieldScope::Agent => FieldKey::new_agent_scoped(&self.inner.name),
            FieldScope::Private | FieldScope::Hidden => {
                FieldKey::new_private_or_hidden_scoped(&self.inner.name, &self.source, &self.scope)
            }
        }
    }
}

/// A wrapper struct around a hashmap of field-keys (unique identifiers used to name/label Arrow
/// data columns mapped to the specification of those fields
#[derive(Debug, Clone, Default, Eq, PartialEq)]
pub struct FieldSpecMap {
    field_specs: HashMap<FieldKey, RootFieldSpec>, // a mapping of field unique identifiers to the fields themselves
}

impl FieldSpecMap {
    pub fn empty() -> FieldSpecMap {
        FieldSpecMap {
            field_specs: HashMap::new(),
        }
    }

    pub(in crate::datastore) fn add(&mut self, new_field: RootFieldSpec) -> Result<()> {
        let field_key = new_field.to_key()?;
        if let Some(existing_field) = self.field_specs.get(&field_key) {
            if existing_field.scope == FieldScope::Agent
                && new_field.scope == FieldScope::Agent
                && existing_field.inner.field_type == new_field.inner.field_type
            {
                if existing_field.source == new_field.source {
                    return Err(Error::from(format!(
                        "Key clash when attempting to insert a new agent-scoped field with key: {:?}. The new field has a differing type: {:?} to the existing field: {:?}",
                        field_key, new_field.inner.field_type, existing_field.inner.field_type
                    )));
                } else {
                    if let FieldSource::Package(package_src) = new_field.source {
                        if existing_field.source == FieldSource::Engine {
                            log::warn!("Key clash when a package attempted to insert a new agent-scoped field with key: {:?}, the existing field was created by the engine, the new field will be ignored", field_key);
                            return Ok(());
                        }
                    }
                }
            }

            Err(Error::from(
                format!("Attempting to insert a new field under key:{:?} which clashes. New field: {:?} Existing field: {:?}", field_key, new_field, existing_field)
            ))
        } else {
            self.field_specs.insert(field_key, new_field);
            Ok(())
        }
    }

    pub fn union(&mut self, set: FieldSpecMap) -> Result<()> {
        set.field_specs
            .into_iter()
            .try_for_each(|(_, field_spec)| self.add(field_spec))
    }

    pub fn contains_key(&self, key: &FieldKey) -> bool {
        self.field_specs.contains_key(key)
    }

    pub(crate) fn iter(&self) -> Iter<FieldKey, RootFieldSpec> {
        self.field_specs.iter()
    }

    pub fn len(&self) -> usize {
        self.field_specs.len()
    }

    pub(in crate::datastore) fn _get_field_spec(
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

// TODO remove dependency on legacy `AgentStateField` (contains references to package fields)
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
                    kind: Box::new(FieldType::new(FieldTypeVariant::Number, false)),
                    len: 3,
                },
                true,
            ),
            AgentStateField::Hidden => {
                // TODO diff w/ `AgentStateField`

                FieldType::new(FieldTypeVariant::Boolean, false)
            }

            // Note `Messages` and `Extra` and 'BehaviorIndex' are not included in here:
            // 1) `Messages` as they are in a separate batch
            // 2) `Extra` as they are not yet implemented
            // 3) 'BehaviorIndex' as it is only used in prime
            AgentStateField::Extra(_) | AgentStateField::Messages => {
                return Err(Error::from(format!(
                    "Cannot match built in field with name {}",
                    name
                )))
            }
        };
        Ok(field_type)
    }
}

// TODO OS[6] - RUNTIME BLOCK - bring in line, need to decide what scopes and sources, if it matters at all
#[cfg(test)]
pub mod tests {
    // use super::*;

    #[test]
    fn name_collision_built_in() {
        todo!()
        // let mut key_set = FieldSpecMap::with_all_agent_batch_fields().unwrap();
        // assert!(key_set
        //     .add(FieldSpec::new_non_mergeable(
        //         "agent_id",
        //         FieldType::new(FieldTypeVariant::Number, true)
        //     ))
        //     .is_err());
    }

    #[test]
    fn name_collision_custom() {
        todo!()
        // let mut key_set = FieldSpecMap::default().unwrap();
        // key_set
        //     .add(FieldSpec::new_non_mergeable(
        //         "test",
        //         FieldType::new(FieldTypeVariant::String, false),
        //     ))
        //     .unwrap();
        // assert!(key_set
        //     .add(FieldSpec::new_non_mergeable(
        //         "test",
        //         FieldType::new(FieldTypeVariant::String, true)
        //     ))
        //     .is_err());
    }

    #[test]
    fn unchanged_size_built_in() {
        todo!()
        // let mut field_spec_map = FieldSpecMap::with_all_agent_batch_fields().unwrap();
        // let before = field_spec_map.len();
        // field_spec_map
        //     .add_built_in(&AgentStateField::AgentId)
        //     .unwrap();
        // assert_eq!(before, field_spec_map.len());
    }

    #[test]
    fn unchanged_size_custom() {
        todo!()
        // let mut field_spec_map = FieldSpecMap::default().unwrap();
        // field_spec_map
        //     .add(FieldSpec::new_non_mergeable(
        //         "test",
        //         FieldType::new(FieldTypeVariant::String, false),
        //     ))
        //     .unwrap();
        // field_spec_map
        //     .add(FieldSpec::new_non_mergeable(
        //         "test",
        //         FieldType::new(FieldTypeVariant::String, false),
        //     ))
        //     .unwrap();
        // field_spec_map
        //     .add(FieldSpec::new_non_mergeable(
        //         "test",
        //         FieldType::new(FieldTypeVariant::String, false),
        //     ))
        //     .unwrap();
        // field_spec_map
        //     .add(FieldSpec::new_non_mergeable(
        //         "test",
        //         FieldType::new(FieldTypeVariant::String, false),
        //     ))
        //     .unwrap();
        // assert_eq!(field_spec_map.field_specs.len(), 2);
    }
}
