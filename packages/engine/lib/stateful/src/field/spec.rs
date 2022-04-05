use std::fmt;

use arrow::datatypes::{DataType, Field};

use crate::{
    error::{Error, Result},
    field::{key::FieldKey, FieldScope, FieldSource, FieldType},
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
        field_key: Option<FieldKey>,
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

/// A single specification of a root field, for instance in the case of a struct field it's the top
/// level struct field and the children are all FieldSpec
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct RootFieldSpec<S> {
    pub inner: FieldSpec,
    pub scope: FieldScope,
    pub source: S,
}

impl<S: FieldSource> RootFieldSpec<S> {
    pub fn create_key(&self) -> Result<FieldKey> {
        Ok(match &self.scope {
            FieldScope::Agent => FieldKey::new_agent_scoped(&self.inner.name)?,
            FieldScope::Private | FieldScope::Hidden => {
                FieldKey::new_private_or_hidden_scoped(&self.inner.name, &self.source, self.scope)?
            }
        })
    }
}

impl<S: FieldSource> TryFrom<RootFieldSpec<S>> for Field {
    type Error = Error;

    fn try_from(root_field_spec: RootFieldSpec<S>) -> Result<Self, Self::Error> {
        let field_key = root_field_spec.create_key()?;
        Ok(root_field_spec
            .inner
            .into_arrow_field(root_field_spec.source.is_trusted(), Some(field_key)))
    }
}
