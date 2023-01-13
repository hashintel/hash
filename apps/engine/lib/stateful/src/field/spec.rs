use std::fmt;

use arrow2::datatypes::{DataType, Field};

use crate::{
    agent::AgentStateField,
    error::{Error, Result},
    field::{
        key::RootFieldKey, FieldScope, FieldSource, FieldType, FieldTypeVariant, PresetFieldType,
    },
};

/// A single specification of a field
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct FieldSpec {
    pub name: String,
    pub field_type: FieldType,
}

impl FieldSpec {
    const PREVIOUS_INDEX_FIELD_NAME: &'static str = "previous_index";

    pub(in crate::field) fn into_arrow_field(
        self,
        can_guarantee_non_null: bool,
        field_key: Option<RootFieldKey>,
    ) -> Field {
        // We cannot guarantee non-nullability for certain root-level arrow-fields due to how we
        // initialise data currently. As this is an impl on FieldSpec we need the calling
        // context to provide the guarantee that the nullablity is enforced.
        let base_nullability = if can_guarantee_non_null {
            self.field_type.nullable
        } else {
            true
        };

        if let Some(key) = field_key {
            Field::new(
                key.value(),
                DataType::from(self.field_type.variant),
                base_nullability,
            )
        } else {
            Field::new(
                &self.name,
                DataType::from(self.field_type.variant),
                base_nullability,
            )
        }
    }

    /// This key is required for accessing neighbors' outboxes (new inboxes).
    ///
    /// Since the neighbor agent state is always the previous step state of the agent, then we need
    /// to know where its outbox is. This would be straightforward if we didn't add/remove/move
    /// agents between batches. This means `AgentBatch` ordering gets changed at the beginning
    /// of the step meaning agents are not aligned with their `OutboxBatch` anymore.
    #[must_use]
    // TODO: migrate this to be logic handled by the Engine
    pub fn last_state_index_key() -> Self {
        // There are 2 indices for every agent: 1) Group index 2) Row (agent) index. This points
        // to the relevant old outbox (i.e. new inbox)
        Self {
            name: Self::PREVIOUS_INDEX_FIELD_NAME.to_string(),
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
}

impl fmt::Debug for FieldSpec {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("field_spec")
            .field("name", &self.name)
            .field("type", &self.field_type.variant)
            .field("nullable", &self.field_type.nullable)
            .finish()
    }
}

/// A single specification of a root field.
///
/// For instance in the case of a struct field it's the top level struct field and the children
/// fields are defined by nested [`FieldSpec`]s.
///
/// [`RootFieldSpec`] associates a [`FieldSpec`] with a [`FieldScope`] and a [`FieldSource`]. It's
/// uniquely identifiable by a [`RootFieldKey`].
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct RootFieldSpec {
    pub inner: FieldSpec,
    pub scope: FieldScope,
    pub source: FieldSource,
}

impl RootFieldSpec {
    pub fn create_key(&self) -> Result<RootFieldKey> {
        Ok(match &self.scope {
            FieldScope::Agent => RootFieldKey::new_agent_scoped(&self.inner.name)?,
            FieldScope::Private | FieldScope::Hidden => RootFieldKey::new_private_or_hidden_scoped(
                &self.inner.name,
                self.source,
                self.scope,
            )?,
        })
    }

    pub fn base_agent_fields() -> Result<Vec<Self>> {
        let mut field_specs = Vec::with_capacity(13);
        let field_spec_creator = RootFieldSpecCreator::new(FieldSource::Engine);

        let used = [
            AgentStateField::AgentId,
            AgentStateField::AgentName,
            AgentStateField::Color,
            AgentStateField::Direction,
            AgentStateField::Height,
            AgentStateField::Hidden,
            AgentStateField::Position,
            AgentStateField::Rgb,
            AgentStateField::Scale,
            AgentStateField::Shape,
            AgentStateField::Velocity,
        ];

        for field in used {
            let field_type: FieldType = field.clone().try_into()?;
            field_specs.push(field_spec_creator.create(
                field.name().into(),
                field_type,
                FieldScope::Agent,
            ));
        }

        let last_state_index = FieldSpec::last_state_index_key();

        field_specs.push(field_spec_creator.create(
            last_state_index.name,
            last_state_index.field_type,
            FieldScope::Hidden,
        ));

        Ok(field_specs)
    }
}

impl TryFrom<RootFieldSpec> for Field {
    type Error = Error;

    fn try_from(root_field_spec: RootFieldSpec) -> Result<Self, Self::Error> {
        let field_key = root_field_spec.create_key()?;
        Ok(root_field_spec
            .inner
            .into_arrow_field(root_field_spec.source.can_guarantee_null(), Some(field_key)))
    }
}

/// A factory-like object that can be set with a [`FieldSource`] and then passed to a context such
/// as a package.
///
/// This allows packages to not need to be aware of the [`FieldSource`], which can get rather
/// complicated.
pub struct RootFieldSpecCreator {
    field_source: FieldSource,
}

impl RootFieldSpecCreator {
    /// Creates a new `RootFieldSpecCreator` for a given [`FieldSource`].
    ///
    /// # Example
    ///
    /// ```
    /// use stateful::field::{FieldSource, RootFieldSpecCreator};
    ///
    /// # #[allow(unused_variables)]
    /// let rfs_creator = RootFieldSpecCreator::new(FieldSource::Engine);
    /// ```
    pub const fn new(field_source: FieldSource) -> Self {
        Self { field_source }
    }
}

impl RootFieldSpecCreator {
    /// Creates a [`RootFieldSpec`] of a [`FieldType`] with a given `name` in the provided
    /// [`FieldScope`].
    ///
    /// # Example
    ///
    /// ```
    /// use stateful::{
    ///     field::{FieldScope, FieldSource, FieldType, FieldTypeVariant, RootFieldSpecCreator},
    ///     Result,
    /// };
    ///
    /// // Create the RootFieldSpecCreator
    /// let rfs_creator = RootFieldSpecCreator::new(FieldSource::Engine);
    ///
    /// // Create a non-nullable `Number` field type
    /// let field_type = FieldType::new(FieldTypeVariant::Number, false);
    ///
    /// // Create the root field spec
    /// let rfs = rfs_creator.create(
    ///     "my_number".to_string(),
    ///     field_type.clone(),
    ///     FieldScope::Agent,
    /// );
    ///
    /// assert_eq!(rfs.inner.name, "my_number");
    /// assert_eq!(rfs.inner.field_type, field_type);
    /// assert_eq!(rfs.scope, FieldScope::Agent);
    /// assert_eq!(rfs.source, FieldSource::Engine);
    /// ```
    pub fn create(&self, name: String, field_type: FieldType, scope: FieldScope) -> RootFieldSpec {
        RootFieldSpec {
            inner: FieldSpec { name, field_type },
            scope,
            source: self.field_source,
        }
    }
}
