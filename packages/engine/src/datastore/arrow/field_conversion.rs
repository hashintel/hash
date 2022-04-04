#![allow(
    clippy::match_same_arms,
    clippy::cast_possible_wrap,
    clippy::for_kv_map
)]

use std::collections::HashMap;

use arrow::datatypes::{Field, Schema};
use stateful::field::{FieldTypeVariant, IsFixedSize};

use crate::datastore::{
    error::{Error, Result},
    schema::{EngineComponent, FieldSpecMap, RootFieldSpec},
};

impl TryFrom<RootFieldSpec> for Field {
    type Error = Error;

    fn try_from(root_field_spec: RootFieldSpec) -> Result<Self, Self::Error> {
        let field_key = root_field_spec.create_key()?;
        Ok(root_field_spec.inner.into_arrow_field(
            root_field_spec.source == EngineComponent::Engine,
            Some(field_key),
        ))
    }
}

impl FieldSpecMap {
    pub fn get_arrow_schema(&self) -> Result<Schema> {
        let mut partitioned_fields = Vec::with_capacity(self.len());
        let mut fixed_size_no = 0;

        let mut any_types = vec![];

        for (key, field_spec) in self.iter() {
            let key = key.value().to_string();
            if field_spec.inner.field_type.variant.is_fixed_size() {
                partitioned_fields.insert(0, (field_spec, key.clone()));
                fixed_size_no += 1;
            } else {
                partitioned_fields.push((field_spec, key.clone()));
            }

            if matches!(
                field_spec.inner.field_type.variant,
                FieldTypeVariant::AnyType
            ) {
                any_types.push(key)
            }
        }

        // Sort both partitions by field keys
        let key_sort = |a: &(&RootFieldSpec, String), b: &(&RootFieldSpec, String)| a.1.cmp(&b.1);
        partitioned_fields[0..fixed_size_no].sort_by(key_sort);
        partitioned_fields[fixed_size_no..].sort_by(key_sort);
        let nullabilities = partitioned_fields
            .iter()
            .map(|spec| (spec.0.inner.field_type.nullable as usize).to_string())
            .collect::<Vec<_>>();

        let mut metadata = HashMap::with_capacity(1);
        // TODO: this can be simplified when we update arrow-rs (beyond 1.0.1), we can set this on
        // Field's custom metadata instead of the schema
        metadata.insert("any_type_fields".into(), any_types.join(","));
        metadata.insert("nullable".into(), nullabilities.join(","));
        Ok(Schema::new_with_metadata(
            partitioned_fields
                .iter()
                .map(|k| Field::try_from(k.0.clone()))
                .collect::<Result<_>>()?,
            metadata,
        ))
    }
}

#[cfg(test)]
pub mod tests {
    use arrow::datatypes::DataType;
    use stateful::field::{FieldScope, FieldType};

    use super::*;
    use crate::{datastore::schema::RootFieldSpecCreator, hash_types::state::AgentStateField};

    #[test]
    fn get_schema() -> Result<()> {
        let field_spec_creator = RootFieldSpecCreator::new(EngineComponent::Engine);
        let mut field_spec_map = FieldSpecMap::empty();

        field_spec_map.add(field_spec_creator.create(
            "test1".to_string(),
            FieldType::new(FieldTypeVariant::Boolean, true),
            FieldScope::Private,
        ))?;

        field_spec_map.add(field_spec_creator.create(
            "test2".to_string(),
            FieldType::new(
                FieldTypeVariant::VariableLengthArray(Box::new(FieldType::new(
                    FieldTypeVariant::Number,
                    false,
                ))),
                true,
            ),
            FieldScope::Private,
        ))?;

        field_spec_map.add(field_spec_creator.create(
            "test3".to_string(),
            FieldType::new(
                FieldTypeVariant::FixedLengthArray {
                    field_type: Box::new(FieldType::new(FieldTypeVariant::Number, false)),
                    len: 3,
                },
                true,
            ),
            FieldScope::Private,
        ))?;

        field_spec_map.add(AgentStateField::AgentId.try_into()?)?;

        let mut meta = HashMap::new();
        meta.insert("any_type_fields".into(), "".into());
        meta.insert("nullable".into(), "1,1,0,1".into());
        let target = Schema::new_with_metadata(
            vec![
                Field::new("_PRIVATE_0_test1", DataType::Boolean, true),
                Field::new(
                    "_PRIVATE_0_test3",
                    DataType::FixedSizeList(
                        Box::new(Field::new("item", DataType::Float64, true)),
                        3,
                    ),
                    true,
                ),
                Field::new(
                    "agent_id",
                    DataType::FixedSizeBinary(crate::datastore::UUID_V4_LEN as i32),
                    false,
                ),
                Field::new(
                    "_PRIVATE_0_test2",
                    DataType::List(Box::new(Field::new("item", DataType::Float64, true))),
                    true,
                ),
            ],
            meta,
        );

        let schema = field_spec_map.get_arrow_schema().unwrap();
        assert_eq!(schema, target);
        Ok(())
    }
}
