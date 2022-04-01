use std::sync::Arc;

use crate::datastore::{
    error::Result,
    schema::field_spec::{FieldScope, FieldSource, FieldSpecMap, RootFieldSpec},
};
use crate::datastore::schema::field_spec::create_field_key;

#[derive(derive_new::new)]
pub struct FieldSpecMapAccessor {
    accessor_source: FieldSource,
    field_spec_map: Arc<FieldSpecMap>,
}

pub trait GetFieldSpec {
    /// Get the `FieldSpec` stored under a given field name with the provided `scope` that belongs
    /// to the provided source,
    fn get_field_spec(
        &self,
        field_name: &str,
        scope: FieldScope,
        source: FieldSource,
    ) -> Result<&RootFieldSpec>;

    /// Get the `FieldSpec` stored under a given field name with the provided `scope` that belongs
    /// to the `FieldSource` of the accessor.
    fn get_local_field_spec(&self, field_name: &str, scope: FieldScope) -> Result<&RootFieldSpec>;
}

impl GetFieldSpec for FieldSpecMapAccessor {
    fn get_field_spec(
        &self,
        field_name: &str,
        scope: FieldScope,
        source: FieldSource,
    ) -> Result<&RootFieldSpec> {
        let key = create_field_key(scope, field_name, source)?;
        self.field_spec_map.get_field_spec(&key)
    }

    /// Get the `FieldSpec` stored under a given field name with the provided `scope` that belongs
    /// to the `FieldSource` of the accessor.
    fn get_local_field_spec(&self, field_name: &str, scope: FieldScope) -> Result<&RootFieldSpec> {
        self.get_field_spec(field_name, scope, self.accessor_source)
    }
}
