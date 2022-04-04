use std::sync::Arc;

use stateful::field::FieldKey;

use crate::datastore::{
    error::Result,
    schema::field_spec::{EngineComponent, FieldScope, FieldSpecMap, RootFieldSpec},
};

#[derive(derive_new::new)]
pub struct FieldSpecMapAccessor {
    accessor_source: EngineComponent,
    field_spec_map: Arc<FieldSpecMap>,
}

pub trait GetFieldSpec {
    /// Get a FieldSpec stored under a given field name with FieldScope::Agent
    fn get_agent_scoped_field_spec(&self, field_name: &str) -> Result<&RootFieldSpec>;
    /// Get a FieldSpec stored under a given field name with FieldScope::Hidden and belonging to a
    /// given FieldSource
    fn get_hidden_scoped_field_spec(
        &self,
        field_name: &str,
        source: &EngineComponent,
    ) -> Result<&RootFieldSpec>;

    /// Get a FieldSpec stored under a given field name with FieldScope::Private that belongs to the
    /// FieldSource of the accessor
    fn get_local_private_scoped_field_spec(&self, field_name: &str) -> Result<&RootFieldSpec>;

    /// Get a FieldSpec stored under a given field name with FieldScope::Hidden that belongs to the
    /// FieldSource of the accessor
    fn get_local_hidden_scoped_field_spec(&self, field_name: &str) -> Result<&RootFieldSpec>;
}

impl GetFieldSpec for FieldSpecMapAccessor {
    fn get_agent_scoped_field_spec(&self, field_name: &str) -> Result<&RootFieldSpec> {
        let key = FieldKey::new_agent_scoped(field_name)?;
        self.field_spec_map.get_field_spec(&key)
    }

    fn get_hidden_scoped_field_spec(
        &self,
        field_name: &str,
        field_source: &EngineComponent,
    ) -> Result<&RootFieldSpec> {
        let key =
            FieldKey::new_private_or_hidden_scoped(field_name, field_source, FieldScope::Hidden)?;
        self.field_spec_map.get_field_spec(&key)
    }

    fn get_local_private_scoped_field_spec(&self, field_name: &str) -> Result<&RootFieldSpec> {
        let key = FieldKey::new_private_or_hidden_scoped(
            field_name,
            &self.accessor_source,
            FieldScope::Private,
        )?;
        self.field_spec_map.get_field_spec(&key)
    }

    fn get_local_hidden_scoped_field_spec(&self, field_name: &str) -> Result<&RootFieldSpec> {
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
pub struct RootFieldSpecMapAccessor {
    pub field_spec_map: Arc<FieldSpecMap>,
}

impl RootFieldSpecMapAccessor {
    // TODO: We're allowing dead code on these during development, if the engine doesn't
    //   end up needing these it might be worth removing
    #[allow(dead_code)]
    fn get_agent_scoped_field_spec(&self, field_name: &str) -> Result<&RootFieldSpec> {
        let key = FieldKey::new_agent_scoped(field_name)?;
        self.field_spec_map.get_field_spec(&key)
    }

    #[allow(dead_code)]
    fn get_private_or_hidden_scoped_field_spec(
        &self,
        field_name: &str,
        field_source: &EngineComponent,
        field_scope: FieldScope,
    ) -> Result<&RootFieldSpec> {
        let key = FieldKey::new_private_or_hidden_scoped(field_name, field_source, field_scope)?;

        self.field_spec_map.get_field_spec(&key)
    }
}
