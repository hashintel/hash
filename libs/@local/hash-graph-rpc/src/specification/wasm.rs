use specta::{
    functions::FunctionDataType, internal::construct::sid, DataType, ImplLocation, NamedDataType,
    SpectaID, TypeMap,
};

#[derive(Debug, Clone)]
pub(crate) struct AnyError;

mod any_error {
    use super::*;

    const SID: SpectaID = sid(
        "AnyError",
        concat!("::", module_path!(), ":", line!(), ":", column!()),
    );
    const IMPL_LOCATION: ImplLocation =
        specta::internal::construct::impl_location(concat!(file!(), ":", line!(), ":", column!()));

    impl specta::Type for AnyError {
        fn inline(_: &mut TypeMap, _: &[DataType]) -> DataType {
            DataType::Any
        }
    }

    impl specta::NamedType for AnyError {
        const IMPL_LOCATION: ImplLocation = IMPL_LOCATION;
        const SID: SpectaID = SID;

        fn named_data_type(type_map: &mut TypeMap, generics: &[DataType]) -> NamedDataType {
            specta::internal::construct::named_data_type(
                "AnyError".into(),
                "".into(),
                None,
                SID,
                IMPL_LOCATION,
                <Self as specta::Type>::inline(type_map, generics),
            )
        }

        fn definition_named_data_type(type_map: &mut TypeMap) -> NamedDataType {
            specta::internal::construct::named_data_type(
                "AnyError".into(),
                "".into(),
                None,
                SID,
                IMPL_LOCATION,
                <Self as specta::Type>::definition(type_map),
            )
        }
    }
}

macro_rules! export_service {
    ($name:ident) => {
        mod __specta {
            use super::$name;

            const SID: specta::SpectaID = specta::internal::construct::sid(
                stringify!($name),
                concat!("::", module_path!(), ":", line!(), ":", column!()),
            );
            const IMPL_LOCATION: specta::ImplLocation = specta::internal::construct::impl_location(
                concat!(file!(), ":", line!(), ":", column!()),
            );

            impl specta::Type for $name {
                fn inline(_: &mut specta::TypeMap, _: &[specta::DataType]) -> specta::DataType {
                    specta::DataType::Reference(specta::internal::construct::data_type_reference(
                        std::borrow::Cow::Borrowed(stringify!($name)),
                        SID,
                        vec![],
                    ))
                }
            }

            impl specta::NamedType for $name {
                const IMPL_LOCATION: specta::ImplLocation = IMPL_LOCATION;
                const SID: specta::SpectaID = SID;

                fn named_data_type(
                    type_map: &mut specta::TypeMap,
                    generics: &[specta::DataType],
                ) -> specta::NamedDataType {
                    specta::internal::construct::named_data_type(
                        stringify!($name).into(),
                        "".into(),
                        None,
                        SID,
                        IMPL_LOCATION,
                        <Self as specta::Type>::inline(type_map, generics),
                    )
                }

                fn definition_named_data_type(
                    type_map: &mut specta::TypeMap,
                ) -> specta::NamedDataType {
                    specta::internal::construct::named_data_type(
                        stringify!($name).into(),
                        "".into(),
                        None,
                        SID,
                        IMPL_LOCATION,
                        <Self as specta::Type>::definition(type_map),
                    )
                }
            }
        }
    };
}

pub(crate) use export_service;

pub struct ClientFunctions {
    pub get_functions: fn(&mut TypeMap) -> Vec<FunctionDataType>,
}

inventory::collect!(ClientFunctions);
