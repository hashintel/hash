#![allow(
    clippy::match_same_arms,
    clippy::cast_possible_wrap,
    clippy::for_kv_map
)]

use arrow::datatypes::DataType;
use std::collections::HashMap;

use super::prelude::*;

use crate::datastore::schema::{FieldKey, FieldSource, FieldType, RootFieldSpec};
use crate::datastore::{
    error::Result,
    prelude::*,
    schema::{FieldSpec, FieldSpecMap, FieldTypeVariant, PresetFieldType},
};
use crate::simulation::package::creator::PREVIOUS_INDEX_FIELD_KEY;

impl PresetFieldType {
    fn is_fixed_size(&self) -> bool {
        match self {
            PresetFieldType::UInt32 => true,
            PresetFieldType::UInt16 => true,
            PresetFieldType::Id => true,
        }
    }

    #[must_use]
    pub fn get_arrow_data_type(&self) -> ArrowDataType {
        match self {
            PresetFieldType::UInt32 => ArrowDataType::UInt32,
            PresetFieldType::UInt16 => ArrowDataType::UInt16,
            PresetFieldType::Id => {
                ArrowDataType::FixedSizeBinary(crate::datastore::UUID_V4_LEN as i32)
            }
        }
    }
}

impl FieldType {
    fn is_fixed_size(&self) -> bool {
        match &self.variant {
            FieldTypeVariant::Number | FieldTypeVariant::Boolean => true,
            FieldTypeVariant::String | FieldTypeVariant::Serialized => false,
            FieldTypeVariant::FixedLengthArray {
                kind: inner,
                len: _,
            } => inner.is_fixed_size(),
            FieldTypeVariant::VariableLengthArray(_) => false,
            FieldTypeVariant::Struct(inner) => inner.iter().all(FieldSpec::is_fixed_size),
            FieldTypeVariant::Preset(inner) => inner.is_fixed_size(),
        }
    }

    pub fn get_arrow_data_type(&self) -> Result<ArrowDataType> {
        match &self.variant {
            FieldTypeVariant::Number => Ok(ArrowDataType::Float64),
            FieldTypeVariant::Boolean => Ok(ArrowDataType::Boolean),
            FieldTypeVariant::String => Ok(ArrowDataType::Utf8),
            FieldTypeVariant::Serialized => Ok(ArrowDataType::Utf8),
            FieldTypeVariant::FixedLengthArray { kind: inner, len } => Ok(
                ArrowDataType::FixedSizeList(Box::new(inner.get_arrow_data_type()?), *len as i32),
            ),
            FieldTypeVariant::VariableLengthArray(inner) => {
                Ok(ArrowDataType::List(Box::new(inner.get_arrow_data_type()?)))
            }
            FieldTypeVariant::Struct(inner) => Ok(ArrowDataType::Struct(
                inner
                    .iter()
                    // TODO - Enforce nullability of fields at initialisation.
                    // These structs are necessarily nested within another arrow field. We cannot guarantee non-nullability for certain root-level arrow-fields due
                    // to how we initialise data currently. Because these _are_ nested, we can guarantee nullability/non-nullability for all inner structs as this
                    // is enforced in the runners, that is, when setting that top-level object, it's enforced that users set all nested data within that object at
                    // the same time.
                    .map(|field_spec| field_spec.get_arrow_field_with_source(true, None))
                    .collect::<Result<Vec<_>>>()?,
            )),
            FieldTypeVariant::Preset(inner) => Ok(inner.get_arrow_data_type()),
        }
    }
}

impl RootFieldSpec {
    pub(in crate::datastore) fn get_arrow_field(&self) -> Result<ArrowField> {
        self.inner
            .get_arrow_field_with_source(self.source == FieldSource::Engine, Some(self.to_key()?))
    }
}

impl FieldSpec {
    fn is_fixed_size(&self) -> bool {
        self.field_type.is_fixed_size()
    }

    pub(in crate::datastore) fn get_arrow_field_with_source(
        &self,
        can_guarantee_non_null: bool,
        field_key: Option<FieldKey>,
    ) -> Result<ArrowField> {
        // We cannot guarantee non-nullability for certain root-level arrow-fields due to how we initialise data currently.
        // As this is an impl on FieldSpec we need the calling context to provide the guarantee that the nullablity is
        // enforced.
        let base_nullability = if can_guarantee_non_null {
            self.field_type.nullable
        } else {
            true
        };

        if let Some(key) = field_key {
            Ok(ArrowField::new(
                key.value(),
                self.field_type.get_arrow_data_type()?,
                base_nullability,
            ))
        } else {
            Ok(ArrowField::new(
                &self.name,
                self.field_type.get_arrow_data_type()?,
                base_nullability,
            ))
        }
    }
}

impl FieldSpecMap {
    pub fn get_arrow_schema(&self) -> Result<ArrowSchema> {
        let mut partitioned_fields = Vec::with_capacity(self.len());
        let mut fixed_size_no = 0;

        let mut any_types = vec![];

        for (key, field_spec) in self.iter() {
            let key = key.value().to_string();
            if field_spec.inner.field_type.is_fixed_size() {
                partitioned_fields.insert(0, (field_spec, key.clone()));
                fixed_size_no += 1;
            } else {
                partitioned_fields.push((field_spec, key.clone()));
            }

            if matches!(
                field_spec.inner.field_type.variant,
                FieldTypeVariant::Serialized
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
        // TODO - Rename serialized to any_types
        metadata.insert("serialized".into(), any_types.join(","));
        metadata.insert("nullable".into(), nullabilities.join(","));
        Ok(ArrowSchema::new_with_metadata(
            partitioned_fields
                .iter()
                .map(|k| k.0.get_arrow_field())
                .collect::<Result<_>>()?,
            metadata,
        ))
    }
}

pub trait IsFixedSize {
    fn is_fixed_size(&self) -> Result<bool>;
}

impl IsFixedSize for ArrowDataType {
    fn is_fixed_size(&self) -> Result<bool> {
        match self {
            ArrowDataType::Float64 => Ok(true),
            ArrowDataType::FixedSizeBinary(_) => Ok(true),
            ArrowDataType::Utf8 => Ok(false),
            ArrowDataType::FixedSizeList(val, _) => val.is_fixed_size(),
            ArrowDataType::List(_) => Ok(false),
            _ => Err(Error::NotImplemented(SupportedType::ArrowDataType(
                self.clone(),
            ))),
        }
    }
}

#[cfg(test)]
pub mod tests {
    // use crate::datastore::schema::FieldType;

    use super::*;
    // use crate::hash_types::state::AgentStateField;

    #[test]
    fn get_schema() -> Result<()> {
        // let field_spec_map = FieldSpecMap::default();
        // TODO OS - Alfie - Bring in line with accessors
        panic!();
        // field_spec_map
        //     .add(FieldSpec::new_mergeable(
        //         "test1",
        //         FieldType::new(FieldTypeVariant::Boolean, true),
        //     ))
        //     .unwrap();
        // field_spec_map
        //     .add(FieldSpec::new_mergeable(
        //         "test2",
        //         FieldType::new(
        //             FieldTypeVariant::VariableLengthArray(Box::new(FieldType::new(
        //                 FieldTypeVariant::Number,
        //                 false,
        //             ))),
        //             true,
        //         ),
        //     ))
        //     .unwrap();
        // field_spec_map
        //     .add(FieldSpec::new_mergeable(
        //         "test3",
        //         FieldType::new(
        //             FieldTypeVariant::FixedLengthArray {
        //                 kind: Box::new(FieldType::new(FieldTypeVariant::Number, false)),
        //                 len: 3,
        //             },
        //             true,
        //         ),
        //     ))
        //     .unwrap();
        //
        // field_spec_map
        //     .add_built_in(&AgentStateField::AgentId)
        //     .unwrap();
        //
        // let mut meta = HashMap::new();
        // meta.insert("serialized".into(), "".into());
        // meta.insert("nullable".into(), "1,0,1,1,1".into());
        // let target = ArrowSchema::new_with_metadata(
        //     vec![
        //         ArrowField::new(
        //             PREVIOUS_INDEX_COLUMN_NAME,
        //             ArrowDataType::FixedSizeList(Box::new(ArrowDataType::UInt32), 2),
        //             true,
        //         ),
        //         ArrowField::new(
        //             "agent_id",
        //             ArrowDataType::FixedSizeBinary(crate::datastore::UUID_V4_LEN as i32),
        //             false,
        //         ),
        //         ArrowField::new("test1", ArrowDataType::Boolean, true),
        //         ArrowField::new(
        //             "test3",
        //             ArrowDataType::FixedSizeList(Box::new(ArrowDataType::Float64), 3),
        //             true,
        //         ),
        //         ArrowField::new(
        //             "test2",
        //             ArrowDataType::List(Box::new(ArrowDataType::Float64)),
        //             true,
        //         ),
        //     ],
        //     meta,
        // );

        // let schema = field_spec_map.get_arrow_schema().unwrap();
        // assert_eq!(schema, target);
        // Ok(())
    }
}
