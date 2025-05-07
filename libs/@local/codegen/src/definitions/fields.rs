use alloc::borrow::Cow;

use specta::datatype;

use super::Type;

#[derive(Debug, Clone)]
pub struct Field {
    // TODO: Export doc strings in codegen
    //   see https://linear.app/hash/issue/H-4473/export-doc-strings-in-codegen
    pub r#type: Type,
    pub flatten: bool,
    pub optional: bool,
}

impl Field {
    pub(crate) fn from_specta(
        field: &datatype::Field,
        type_collection: &specta::TypeCollection,
    ) -> Self {
        let r#type = Type::from_specta(
            field.ty().unwrap_or_else(|| {
                todo!("https://linear.app/hash/issue/H-4472/allow-field-skipping-in-codegen")
            }),
            type_collection,
        );
        if !field.flatten()
            && let Type::Optional(optional) = r#type
        {
            Self {
                r#type: *optional,
                flatten: field.flatten(),
                optional: true,
            }
        } else {
            Self {
                r#type,
                flatten: field.flatten(),
                optional: field.optional(),
            }
        }
    }
}

#[derive(Debug, Clone)]
pub enum Fields {
    Named {
        fields: Vec<(Cow<'static, str>, Field)>,
        deny_unknown: bool,
    },
    Unnamed {
        fields: Vec<Field>,
    },
    Unit,
}

impl Fields {
    pub(crate) fn from_specta(
        fields: &datatype::Fields,
        type_collection: &specta::TypeCollection,
    ) -> Self {
        match fields {
            datatype::Fields::Named(named_fields) => Self::Named {
                fields: named_fields
                    .fields()
                    .iter()
                    .map(|(name, data_type)| {
                        (name.clone(), Field::from_specta(data_type, type_collection))
                    })
                    .collect(),
                // TODO: Specta currently does not have `deny_unknown_fields` support
                //   see https://linear.app/hash/issue/H-4489/implement-deny-unknown-fields-detection
                deny_unknown: true,
            },
            datatype::Fields::Unnamed(unnamed_fields) => Self::Unnamed {
                fields: unnamed_fields
                    .fields()
                    .iter()
                    .map(|data_type| Field::from_specta(data_type, type_collection))
                    .collect(),
            },
            datatype::Fields::Unit => Self::Unit,
        }
    }
}
