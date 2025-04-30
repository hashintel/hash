use alloc::borrow::Cow;

use specta::datatype;

use super::Type;

#[derive(Debug, Clone)]
pub struct Field {
    // TODO: Export doc strings in codegen
    //   see https://linear.app/hash/issue/H-4473/export-doc-strings-in-codegen
    pub r#type: Type,
    pub flatten: bool,
}

impl Field {
    pub(crate) fn from_specta(
        field: &datatype::Field,
        type_collection: &specta::TypeCollection,
    ) -> Self {
        Self {
            r#type: Type::from_specta(
                field.ty().unwrap_or_else(|| {
                    todo!("https://linear.app/hash/issue/H-4472/allow-field-skipping-in-codegen")
                }),
                type_collection,
            ),
            flatten: field.flatten(),
        }
    }
}

#[derive(Debug, Clone)]
pub enum Fields {
    Named {
        fields: Vec<(Cow<'static, str>, Field)>,
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
