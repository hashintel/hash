use alloc::borrow::Cow;

use specta::datatype;

use super::Fields;

#[derive(Debug, Clone)]
pub struct EnumVariant {
    pub name: Cow<'static, str>,
    pub fields: Fields,
}

#[derive(Debug, Clone)]
pub enum EnumTagging {
    Untagged,
    External,
    Internal {
        tag: Cow<'static, str>,
    },
    Adjacent {
        tag: Cow<'static, str>,
        content: Cow<'static, str>,
    },
}

impl EnumTagging {
    pub(crate) fn from_specta(enum_repr: &datatype::EnumRepr) -> Self {
        match enum_repr {
            datatype::EnumRepr::Untagged => Self::Untagged,
            datatype::EnumRepr::Internal { tag } => Self::Internal { tag: tag.clone() },
            datatype::EnumRepr::External => Self::External,
            datatype::EnumRepr::Adjacent { tag, content } => Self::Adjacent {
                tag: tag.clone(),
                content: content.clone(),
            },
        }
    }
}

#[derive(Debug, Clone)]
pub struct Enum {
    pub variants: Vec<EnumVariant>,
    pub tagging: EnumTagging,
}

impl Enum {
    pub(crate) fn from_specta(
        enum_type: &datatype::Enum,
        type_collection: &specta::TypeCollection,
    ) -> Self {
        Self {
            variants: enum_type
                .variants()
                .iter()
                .filter(|&(_, variant)| !variant.skip())
                .map(|(name, variant)| EnumVariant {
                    name: name.clone(),
                    fields: Fields::from_specta(variant.fields(), type_collection),
                })
                .collect(),
            tagging: enum_type
                .repr()
                .map_or(EnumTagging::External, EnumTagging::from_specta),
        }
    }
}
