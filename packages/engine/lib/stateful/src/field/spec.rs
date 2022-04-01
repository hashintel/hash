use std::fmt;

use arrow::datatypes::{DataType, Field};

use crate::field::{key::FieldKey, FieldType};

/// A single specification of a field
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct FieldSpec {
    pub name: String,
    pub field_type: FieldType,
}

impl FieldSpec {
    pub fn into_arrow_field(
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
