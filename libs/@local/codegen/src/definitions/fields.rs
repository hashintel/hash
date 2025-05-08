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
    ) -> Option<Self> {
        let r#type = field
            .ty()
            .map(|ty| Type::from_specta(ty, type_collection))?;

        if !field.flatten()
            && let Type::Optional(optional) = r#type
        {
            Some(Self {
                r#type: *optional,
                flatten: field.flatten(),
                optional: true,
            })
        } else {
            Some(Self {
                r#type,
                flatten: field.flatten(),
                optional: field.optional(),
            })
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
                    .filter_map(|(name, data_type)| {
                        Some((
                            name.clone(),
                            Field::from_specta(data_type, type_collection)?,
                        ))
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
                    .filter_map(|data_type| Field::from_specta(data_type, type_collection))
                    .collect(),
            },
            datatype::Fields::Unit => Self::Unit,
        }
    }
}
