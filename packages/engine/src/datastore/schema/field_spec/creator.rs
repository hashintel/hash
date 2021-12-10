use crate::datastore::schema::field_spec::{
    FieldScope, FieldSource, FieldSpec, FieldType, RootFieldSpec,
};

/// A factory-like object that can be set with a FieldSource and then passed to a context such as a
/// package. This allows packages to not need to be aware of the FieldSource specifics
pub struct RootFieldSpecCreator {
    field_source: FieldSource,
}

impl RootFieldSpecCreator {
    pub fn new(field_source: FieldSource) -> Self {
        Self { field_source }
    }

    pub fn create(&self, name: String, field_type: FieldType, scope: FieldScope) -> RootFieldSpec {
        RootFieldSpec {
            inner: FieldSpec { name, field_type },
            scope,
            source: self.field_source.clone(),
        }
    }
}
