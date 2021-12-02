use std::fmt;

use super::{FieldSpec, FieldTypeVariant};

impl fmt::Debug for FieldTypeVariant {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FieldTypeVariant::Number => write!(f, "number"),
            FieldTypeVariant::Boolean => write!(f, "boolean"),
            FieldTypeVariant::String => write!(f, "string"),
            FieldTypeVariant::AnyType => write!(f, "any"),
            FieldTypeVariant::FixedLengthArray { kind, len } => write!(
                f,
                "fixed_size_list: {{type: {:?}, length: {:?}}}",
                kind, len
            ),
            FieldTypeVariant::VariableLengthArray(v) => write!(f, "list: {{type: {:?}}}", v),
            FieldTypeVariant::Struct(fields) => write!(f, "struct: {:?}", fields),
            FieldTypeVariant::Preset(_) => write!(f, "/hash_reserved_type/"),
        }
    }
}

// TODO Do we want the other fields such as source
impl fmt::Debug for FieldSpec {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("field_spec")
            .field("name", &self.name)
            .field("type", &self.field_type.variant)
            .field("nullable", &self.field_type.nullable)
            .finish()
    }
}
