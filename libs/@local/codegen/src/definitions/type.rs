use alloc::borrow::Cow;

use specta::{SpectaID, datatype};

use super::{Enum, List, Map, Primitive, Struct, Tuple};

/// A wrapper around `specta::SpectaID` that uniquely identifies types.
///
/// This solves the problem of distinguishing between different type references that might have the
/// same name but are from different scopes or modules.
#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord)]
pub struct TypeId(specta::SpectaID);

impl TypeId {
    pub(crate) const fn from_specta(id: specta::SpectaID) -> Self {
        Self(id)
    }

    pub(crate) const fn to_specta(self) -> SpectaID {
        self.0
    }
}

#[derive(Debug, Clone)]
pub enum Type {
    Reference(TypeId),
    Primitive(Primitive),
    Enum(Enum),
    Struct(Struct),
    Tuple(Tuple),
    List(List),
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
            specta::DataType::Reference(reference) => {
                Self::Reference(TypeId::from_specta(reference.sid()))
            }
            specta::DataType::Tuple(tuple) => {
                Self::Tuple(Tuple::from_specta(tuple, type_collection))
            }
            specta::DataType::List(list_type) => {
                Self::List(List::from_specta(list_type, type_collection))
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
    pub public: bool,
}

impl TypeDefinition {
    pub(crate) fn from_specta(
        data_type: &datatype::NamedDataType,
        type_collection: &specta::TypeCollection,
    ) -> Self {
        Self {
            name: data_type.name().clone(),
            r#type: Type::from_specta(data_type.ty(), type_collection),
            // TODO: Only export public types
            //  see https://linear.app/hash/issue/H-4498/only-export-public-types-from-codegen
            public: true,
        }
    }
}
