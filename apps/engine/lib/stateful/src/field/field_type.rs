// TODO: better encapsulate the supported underlying field types, and the selection of those that
//   we expose to the user compared to this thing where we have a variant and an 'extension'. So
//   it would probably be better as a FieldType and UserFieldType enum or something similar,
//   rather than PresetFieldType and FieldTypeVariant

use core::fmt;

use arrow2::datatypes::{DataType, Field};

use crate::field::{FieldSpec, IsFixedSize, UUID_V4_LEN};

/// Represent an extension of types of fields that can be set by the engine.
///
/// This gives greater control over underlying Arrow datatypes such as integer sizes compared to the
/// field types we allow users to set
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash)]
pub enum PresetFieldType {
    Uint16,
    // Used to refer to an agent from the previous state
    Uint32,
    // Represents AgentId
    Id,
}

impl From<PresetFieldType> for DataType {
    fn from(preset: PresetFieldType) -> Self {
        match preset {
            PresetFieldType::Uint32 => Self::UInt32,
            PresetFieldType::Uint16 => Self::UInt16,
            PresetFieldType::Id => Self::FixedSizeBinary(UUID_V4_LEN),
        }
    }
}

impl IsFixedSize for PresetFieldType {
    fn is_fixed_size(&self) -> bool {
        match self {
            Self::Uint32 => true,
            Self::Uint16 => true,
            Self::Id => true,
        }
    }
}

/// These represent the types of fields that users can set.
///
/// This is more restrictive than the total field types we support (see PresetFieldType for an
/// extension of types not visible to the user)
#[derive(Clone, PartialEq, Eq, Hash)]
pub enum FieldTypeVariant {
    /// A 64 bit floating point number
    Number,
    Boolean,
    String,
    /// A JSON-encoded String
    AnyType,
    FixedLengthArray {
        field_type: Box<FieldType>,
        len: usize,
    },
    VariableLengthArray(Box<FieldType>),
    Struct(Vec<FieldSpec>),
    Preset(PresetFieldType),
}

impl From<FieldTypeVariant> for DataType {
    fn from(type_variant: FieldTypeVariant) -> Self {
        match type_variant {
            FieldTypeVariant::Number => Self::Float64,
            FieldTypeVariant::Boolean => Self::Boolean,
            FieldTypeVariant::String => Self::Utf8,
            FieldTypeVariant::AnyType => Self::Utf8,
            FieldTypeVariant::FixedLengthArray { field_type, len } => DataType::FixedSizeList(
                Box::new(Field::new("item", DataType::from(field_type.variant), true)),
                len,
            ),
            FieldTypeVariant::VariableLengthArray(field_type) => DataType::List(Box::new(
                Field::new("item", DataType::from(field_type.variant), true),
            )),
            FieldTypeVariant::Struct(field_specs) => DataType::Struct(
                // TODO: Enforce nullability of fields at initialization.
                //   These structs are necessarily nested within another arrow field. We cannot
                //   guarantee non-nullability for certain root-level arrow-fields due to how we
                //   initialise data currently. Because these _are_ nested, we can guarantee
                //   nullability/non-nullability for all inner structs as this is enforced in the
                //   runners, that is, when setting that top-level object, it's enforced that
                //   users set all nested data within that object at the same time.
                field_specs
                    .into_iter()
                    .map(|field_spec| field_spec.into_arrow_field(true, None))
                    .collect(),
            ),
            FieldTypeVariant::Preset(preset) => DataType::from(preset),
        }
    }
}

impl IsFixedSize for FieldTypeVariant {
    fn is_fixed_size(&self) -> bool {
        match self {
            Self::Number | Self::Boolean => true,
            Self::String | Self::AnyType => false,
            Self::FixedLengthArray {
                field_type: element,
                ..
            } => element.variant.is_fixed_size(),
            Self::VariableLengthArray(_) => false,
            Self::Struct(field_specs) => field_specs
                .iter()
                .all(|field_spec| field_spec.field_type.variant.is_fixed_size()),
            Self::Preset(preset) => preset.is_fixed_size(),
        }
    }
}

impl fmt::Debug for FieldTypeVariant {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FieldTypeVariant::Number => write!(fmt, "number"),
            FieldTypeVariant::Boolean => write!(fmt, "boolean"),
            FieldTypeVariant::String => write!(fmt, "string"),
            FieldTypeVariant::AnyType => write!(fmt, "any"),
            FieldTypeVariant::FixedLengthArray {
                field_type: kind,
                len,
            } => write!(
                fmt,
                "fixed_size_list: {{type: {:?}, length: {:?}}}",
                kind, len
            ),
            FieldTypeVariant::VariableLengthArray(v) => write!(fmt, "list: {{type: {:?}}}", v),
            FieldTypeVariant::Struct(fields) => write!(fmt, "struct: {:?}", fields),
            FieldTypeVariant::Preset(_) => write!(fmt, "/hash_reserved_type/"),
        }
    }
}

/// Allowed field types
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct FieldType {
    pub variant: FieldTypeVariant,
    pub nullable: bool,
}

impl FieldType {
    pub fn new(variant: FieldTypeVariant, nullable: bool) -> Self {
        Self { variant, nullable }
    }
}
