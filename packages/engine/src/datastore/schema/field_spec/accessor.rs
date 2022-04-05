use std::sync::Arc;

use stateful::field::{FieldKey, FieldSource, RootFieldSpec};

use crate::datastore::{
    error::Result,
    schema::field_spec::{FieldScope, FieldSpecMap},
};

pub struct FieldSpecMapAccessor<S> {
    accessor_source: S,
    field_spec_map: Arc<FieldSpecMap<S>>,
}

impl<S: FieldSource> FieldSpecMapAccessor<S> {
    pub fn new(accessor_source: S, field_spec_map: Arc<FieldSpecMap<S>>) -> Self {
        Self {
            accessor_source,
            field_spec_map,
        }
    }

    /// Get a FieldSpec stored under a given field name with FieldScope::Agent
    pub fn get_agent_scoped_field_spec(&self, field_name: &str) -> Result<&RootFieldSpec<S>> {
        let key = FieldKey::new_agent_scoped(field_name)?;
        self.field_spec_map.get_field_spec(&key)
    }

    /// Get a FieldSpec stored under a given field name with FieldScope::Hidden and belonging to a
    /// given FieldSource
    pub fn get_hidden_scoped_field_spec(
        &self,
        field_name: &str,
        field_source: &S,
    ) -> Result<&RootFieldSpec<S>> {
        let key =
            FieldKey::new_private_or_hidden_scoped(field_name, field_source, FieldScope::Hidden)?;
        self.field_spec_map.get_field_spec(&key)
    }

    /// Get a FieldSpec stored under a given field name with FieldScope::Private that belongs to the
    /// FieldSource of the accessor
    pub fn get_local_private_scoped_field_spec(
        &self,
        field_name: &str,
    ) -> Result<&RootFieldSpec<S>> {
        let key = FieldKey::new_private_or_hidden_scoped(
            field_name,
            &self.accessor_source,
            FieldScope::Private,
        )?;
        self.field_spec_map.get_field_spec(&key)
    }

    /// Get a FieldSpec stored under a given field name with FieldScope::Hidden that belongs to the
    /// FieldSource of the accessor
    pub fn get_local_hidden_scoped_field_spec(
        &self,
        field_name: &str,
    ) -> Result<&RootFieldSpec<S>> {
        let key = FieldKey::new_private_or_hidden_scoped(
            field_name,
            &self.accessor_source,
            FieldScope::Hidden,
        )?;
        self.field_spec_map.get_field_spec(&key)
    }
}

/// A non-scoped Accessor object used to look-up `FieldSpec`s without regard for scoping rules.
/// This Accessor is **only** intended for use by the Engine, i.e. something with root access.
/// Due to this it does not implement GetFieldSpec. This is because methods using this should not
/// require a generic interface through dynamic dispatch and should be explicit in needing root
/// access.
pub struct RootFieldSpecMapAccessor<S> {
    pub field_spec_map: Arc<FieldSpecMap<S>>,
}

impl<S: FieldSource> RootFieldSpecMapAccessor<S> {
    // TODO: We're allowing dead code on these during development, if the engine doesn't
    //   end up needing these it might be worth removing
    #[allow(dead_code)]
    fn get_agent_scoped_field_spec(&self, field_name: &str) -> Result<&RootFieldSpec<S>> {
        let key = FieldKey::new_agent_scoped(field_name)?;
        self.field_spec_map.get_field_spec(&key)
    }

    #[allow(dead_code)]
    fn get_private_or_hidden_scoped_field_spec(
        &self,
        field_name: &str,
        field_source: &S,
        field_scope: FieldScope,
    ) -> Result<&RootFieldSpec<S>> {
        let key = FieldKey::new_private_or_hidden_scoped(field_name, field_source, field_scope)?;

        self.field_spec_map.get_field_spec(&key)
    }
}
