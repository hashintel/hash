use crate::datastore::error::{Error, Result};
use crate::datastore::schema::field_spec::{
    FieldScope, FieldSource, FieldSpec, FieldSpecMap, FieldType, RootFieldSpec,
};

pub struct FieldSpecMapBuilder {
    field_spec_map: FieldSpecMap,
    fields_source: Option<FieldSource>,
}

impl FieldSpecMapBuilder {
    pub fn new() -> Self {
        Self {
            field_spec_map: FieldSpecMap::empty(),
            fields_source: None,
        }
    }

    pub fn from_existing_map(field_spec_map: FieldSpecMap, fields_source: FieldSource) -> Self {
        Self {
            field_spec_map,
            fields_source: Some(fields_source),
        }
    }

    pub fn build(self) -> FieldSpecMap {
        self.field_spec_map
    }

    // TODO this shouldn't be accessible to packages
    pub fn source(&mut self, fields_source: FieldSource) -> &mut Self {
        self.fields_source = Some(fields_source);
        self
    }

    pub fn add_field_spec(
        &mut self,
        name: String,
        field_type: FieldType,
        scope: FieldScope,
    ) -> Result<()> {
        if let Some(source) = self.fields_source.clone() {
            self.field_spec_map.add(RootFieldSpec {
                inner: FieldSpec { name, field_type },
                scope,
                source,
            })
        } else {
            Err(Error::from(format!(
                "An attempt to set a field on the builder was made without a source being set"
            )))
        }
    }
}
