use std::fmt;

use arrow::datatypes::{DataType, Field};

use crate::{
    error::{Error, Result},
    field::{key::RootFieldKey, FieldScope, FieldSource, FieldType},
};

/// A single specification of a field
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct FieldSpec {
    pub name: String,
    pub field_type: FieldType,
}

impl FieldSpec {
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
pub struct RootFieldSpec<S> {
    pub inner: FieldSpec,
    pub scope: FieldScope,
    pub source: S,
}

impl<S: FieldSource> RootFieldSpec<S> {
    pub fn create_key(&self) -> Result<RootFieldKey> {
        Ok(match &self.scope {
            FieldScope::Agent => RootFieldKey::new_agent_scoped(&self.inner.name)?,
            FieldScope::Private | FieldScope::Hidden => RootFieldKey::new_private_or_hidden_scoped(
                &self.inner.name,
                &self.source,
                self.scope,
            )?,
        })
    }
}

impl<S: FieldSource> TryFrom<RootFieldSpec<S>> for Field {
    type Error = Error;

    fn try_from(root_field_spec: RootFieldSpec<S>) -> Result<Self, Self::Error> {
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
pub struct RootFieldSpecCreator<S> {
    field_source: S,
}

impl<S> RootFieldSpecCreator<S> {
    /// Creates a new `RootFieldSpecCreator` for a given [`FieldSource`].
    ///
    /// # Example
    ///
    /// ```
    /// use stateful::field::RootFieldSpecCreator;
    ///
    /// #[derive(Debug, Clone, PartialEq)]
    /// pub enum EngineComponent {
    ///     Engine,
    ///     Package,
    /// }
    ///
    /// # #[allow(unused_variables)]
    /// let rfs_creator = RootFieldSpecCreator::new(EngineComponent::Engine);
    /// ```
    pub const fn new(field_source: S) -> Self {
        Self { field_source }
    }
}

impl<S: Clone> RootFieldSpecCreator<S> {
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
    /// #[derive(Debug, Clone, PartialEq)]
    /// pub enum EngineComponent {
    ///     Engine,
    ///     Package,
    /// }
    ///
    /// impl FieldSource for EngineComponent {
    ///     // Implementation detail
    /// #    fn unique_id(&self) -> Result<usize> {
    /// #        match self {
    /// #            EngineComponent::Engine => Ok(0),
    /// #            EngineComponent::Package => Ok(1),
    /// #        }
    /// #    }
    /// #    fn can_guarantee_null(&self) -> bool {
    /// #        *self == EngineComponent::Engine
    /// #    }
    /// }
    ///
    /// // Create the RootFieldSpecCreator
    /// let rfs_creator = RootFieldSpecCreator::new(EngineComponent::Engine);
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
    /// assert_eq!(rfs.source, EngineComponent::Engine);
    /// ```
    pub fn create(
        &self,
        name: String,
        field_type: FieldType,
        scope: FieldScope,
    ) -> RootFieldSpec<S> {
        RootFieldSpec {
            inner: FieldSpec { name, field_type },
            scope,
            source: self.field_source.clone(),
        }
    }
}
