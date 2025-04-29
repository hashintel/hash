use alloc::borrow::Cow;

use specta::datatype;

use super::{Enum, Map, Primitive, Struct};

#[derive(Debug, Clone)]
pub enum Type {
    // TODO: Use a `TypeId` to distinguish between the same type names
    //   see https://linear.app/hash/issue/H-4486/implement-a-typeid-to-distinguish-between-different-references-with
    Reference(Cow<'static, str>),
    Primitive(Primitive),
    Enum(Enum),
    Struct(Struct),
    List(Box<Self>),
    Map(Map),
    Optional(Box<Self>),
}

impl Type {
    pub(crate) fn from_specta(
        data_type: &datatype::DataType,
        type_collection: &specta::TypeCollection,
    ) -> Self {
        match data_type {
            specta::DataType::Enum(enum_type) => {
                Self::Enum(Enum::from_specta(enum_type, type_collection))
            }
            specta::DataType::Struct(struct_type) => {
                Self::Struct(Struct::from_specta(struct_type, type_collection))
            }
            specta::DataType::Primitive(primitive_type) => Self::Primitive(primitive_type.into()),
            specta::DataType::Reference(reference) => Self::Reference(
                type_collection
                    .get(reference.sid())
                    .expect("Type collection should have SID")
                    .name()
                    .clone(),
            ),
            specta::DataType::List(list_type) => {
                Self::List(Box::new(Self::from_specta(list_type.ty(), type_collection)))
            }
            specta::DataType::Nullable(nullable) => {
                Self::Optional(Box::new(Self::from_specta(nullable, type_collection)))
            }
            specta::DataType::Map(map_type) => {
                Self::Map(Map::from_specta(map_type, type_collection))
            }
            data_type => todo!("Unsupported data type {data_type:?}"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct TypeDefinition {
    pub name: Cow<'static, str>,
    pub r#type: Type,
}

impl TypeDefinition {
    pub(crate) fn from_specta(
        data_type: &datatype::NamedDataType,
        type_collection: &specta::TypeCollection,
    ) -> Self {
        Self {
            name: data_type.name().clone(),
            r#type: Type::from_specta(data_type.ty(), type_collection),
        }
    }
}
