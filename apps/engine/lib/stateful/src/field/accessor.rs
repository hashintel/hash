use std::sync::Arc;

use crate::{
    error::Result,
    field::{FieldScope, FieldSource, FieldSpecMap, RootFieldKey, RootFieldSpec},
};

pub struct FieldSpecMapAccessor {
    accessor_source: FieldSource,
    field_spec_map: Arc<FieldSpecMap>,
}

impl FieldSpecMapAccessor {
    pub fn new(accessor_source: FieldSource, field_spec_map: Arc<FieldSpecMap>) -> Self {
        Self {
            accessor_source,
            field_spec_map,
        }
    }

    /// Get a [`FieldSpec`] stored under a given field name with [`FieldScope::Agent`].
    ///
    /// [`FieldSpec`]: crate::field::FieldSpec
    pub fn get_agent_scoped_field_spec(&self, field_name: &str) -> Result<&RootFieldSpec> {
        let key = RootFieldKey::new_agent_scoped(field_name)?;
        self.field_spec_map.get_field_spec(&key)
    }

    /// Get a [`FieldSpec`] stored under a given field name with [`FieldScope::Hidden`] and
    /// belonging to a given [`FieldSource`].
    ///
    /// [`FieldSpec`]: crate::field::FieldSpec
    pub fn get_hidden_scoped_field_spec(
        &self,
        field_name: &str,
        field_source: FieldSource,
    ) -> Result<&RootFieldSpec> {
        let key = RootFieldKey::new_private_or_hidden_scoped(
            field_name,
            field_source,
            FieldScope::Hidden,
        )?;
        self.field_spec_map.get_field_spec(&key)
    }

    /// Get a [`FieldSpec`] stored under a given field name with [`FieldScope::Private`] that
    /// belongs to the [`FieldSource`] of the accessor.
    ///
    /// [`FieldSpec`]: crate::field::FieldSpec
    pub fn get_local_private_scoped_field_spec(&self, field_name: &str) -> Result<&RootFieldSpec> {
        let key = RootFieldKey::new_private_or_hidden_scoped(
            field_name,
            self.accessor_source,
            FieldScope::Private,
        )?;
        self.field_spec_map.get_field_spec(&key)
    }

    /// Get a [`FieldSpec`] stored under a given field name with [`FieldScope::Hidden`] that belongs
    /// to the [`FieldSource`] of the accessor.
    ///
    /// [`FieldSpec`]: crate::field::FieldSpec
    pub fn get_local_hidden_scoped_field_spec(&self, field_name: &str) -> Result<&RootFieldSpec> {
        let key = RootFieldKey::new_private_or_hidden_scoped(
            field_name,
            self.accessor_source,
            FieldScope::Hidden,
        )?;
        self.field_spec_map.get_field_spec(&key)
    }
}

/// A non-scoped Accessor object used to look-up [`FieldSpec`]s without regard for scoping rules.
///
/// This Accessor is **only** intended for use by the Engine, i.e. something with root access.
///
/// [`FieldSpec`]: crate::field::FieldSpec
// TODO: We're allowing dead code on these during development, if the engine doesn't
//   end up needing these it might be worth removing
#[allow(dead_code)]
struct RootFieldSpecMapAccessor {
    pub field_spec_map: Arc<FieldSpecMap>,
}

impl RootFieldSpecMapAccessor {
    // TODO: We're allowing dead code on these during development, if the engine doesn't
    //   end up needing these it might be worth removing
    #[allow(dead_code)]
    fn get_agent_scoped_field_spec(&self, field_name: &str) -> Result<&RootFieldSpec> {
        let key = RootFieldKey::new_agent_scoped(field_name)?;
        self.field_spec_map.get_field_spec(&key)
    }

    #[allow(dead_code)]
    fn get_private_or_hidden_scoped_field_spec(
        &self,
        field_name: &str,
        field_source: FieldSource,
        field_scope: FieldScope,
    ) -> Result<&RootFieldSpec> {
        let key =
            RootFieldKey::new_private_or_hidden_scoped(field_name, field_source, field_scope)?;

        self.field_spec_map.get_field_spec(&key)
    }
}
