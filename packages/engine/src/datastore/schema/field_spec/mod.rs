use std::{
    collections::{
        hash_map::{Iter, Values},
        HashMap,
    },
    fmt::{Display, Formatter},
};

use crate::{
    datastore::error::{Error, Result},
    hash_types::state::AgentStateField,
    simulation::package::name::PackageName,
};

pub mod accessor;
pub mod built_in;
pub mod creator;
pub mod display;
pub mod short_json;

pub const HIDDEN_PREFIX: &str = "_HIDDEN_";
pub const PRIVATE_PREFIX: &str = "_PRIVATE_";

// TODO: better encapsulate the supported underlying field types, and the selection of those that
//   we expose to the user compared to this thing where we have a variant and an 'extension'. So
//   it would probably be better as a FieldType and UserFieldType enum or something similar,
//   rather than PresetFieldType and FieldTypeVariant

/// PresetFieldTypes represent an extension of types of fields that can be set by the engine, this
/// gives greater control over underlying arrow datatype such as integer sizes compared to the
/// field types we allow users to set
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum PresetFieldType {
    Uint16,
    // Used to refer to an agent from the previous state
    Uint32,
    // Represents AgentId
    Id,
}

/// These represent the types of fields that users can set. This is more restrictive than the total
/// field types we support (see PresetFieldType for an extension of types not visible to the user)
#[derive(Clone, PartialEq, Eq, Hash)]
pub enum FieldTypeVariant {
    Number,
    Boolean,
    String,
    AnyType,
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
            FieldSource::Engine => Ok("0".into()),
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

    pub(in super::super) fn from_key_as_str(key_as_str: &str) -> Self {
        Self(key_as_str.to_string())
    }

    // TODO: do we want these checks to only be present on debug builds
    #[inline]
    pub fn new_agent_scoped(name: &str) -> Result<FieldKey> {
        if name.starts_with(PRIVATE_PREFIX) || name.starts_with(HIDDEN_PREFIX) {
            return Err(Error::from(format!(
                "Field names cannot start with the protected prefixes: ['{}', '{}'], received \
                 field name: '{}'",
                PRIVATE_PREFIX, HIDDEN_PREFIX, name
            )));
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
            }
            FieldScope::Hidden => {
                key.push_str(HIDDEN_PREFIX);
            }
            FieldScope::Agent => {
                return Err(Error::from(
                    "Use new_agent_scoped to create a key with FieldScope::Agent",
                ));
            }
        }
        key.push_str(&source.unique_id()?);
        key.push_str("_");
        key.push_str(name);
        Ok(FieldKey(key))
    }
}

impl Display for FieldKey {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.value())
    }
}

/// A single specification of a field
#[derive(new, Clone, PartialEq, Eq, Hash)]
pub struct FieldSpec {
    pub name: String,
    pub field_type: FieldType,
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
    field_specs: HashMap<FieldKey, RootFieldSpec>, /* a mapping of field unique identifiers to
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
        let field_key = new_field.to_key()?;
        if let Some(existing_field) = self.field_specs.get(&field_key) {
            if existing_field == &new_field {
                log::warn!(
                    "FieldSpec: [{}], already exists within the FieldSpecMap",
                    field_key
                );
                return Ok(());
            }
            if existing_field.scope == FieldScope::Agent
                && &new_field.scope == &FieldScope::Agent
                && &existing_field.inner.field_type == &new_field.inner.field_type
            {
                if existing_field.source == new_field.source {
                    return Err(Error::AgentScopedFieldKeyClash(
                        field_key,
                        new_field.inner.field_type,
                        existing_field.inner.field_type.clone(),
                    ));
                } else {
                    if let FieldSource::Package(_package_src) = &new_field.source {
                        if existing_field.source == FieldSource::Engine {
                            log::warn!(
                                "Key clash when a package attempted to insert a new agent-scoped \
                                 field with key: {:?}, the existing field was created by the \
                                 engine, the new field will be ignored",
                                field_key
                            );
                            return Ok(());
                        }
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

    pub fn union(&mut self, set: FieldSpecMap) -> Result<()> {
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
                    kind: Box::new(FieldType::new(FieldTypeVariant::Number, false)),
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
        assert!(matches!(err, Error::FieldKeyClash(..)))
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
}
