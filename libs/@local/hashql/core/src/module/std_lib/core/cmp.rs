use super::func;
use crate::{
    module::{
        locals::TypeDef,
        std_lib::{ModuleDef, StandardLibrary, StandardLibraryModule, decl},
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Cmp {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Cmp {
    type Children = ();

    fn name() -> Symbol<'heap> {
        sym::cmp
    }

    #[expect(non_snake_case)]
    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        let Number = lib.ty.number();
        let Boolean = lib.ty.boolean();

        let items = [
            (
                sym::path::core::cmp::gt,
                &[sym::gt, sym::symbol::gt],
                decl!(lib; <>(lhs: Number, rhs: Number) -> Boolean),
            ),
            (
                sym::path::core::cmp::lt,
                &[sym::lt, sym::symbol::lt],
                decl!(lib; <>(lhs: Number, rhs: Number) -> Boolean),
            ),
            (
                sym::path::core::cmp::gte,
                &[sym::gte, sym::symbol::gteq],
                decl!(lib; <>(lhs: Number, rhs: Number) -> Boolean),
            ),
            (
                sym::path::core::cmp::lte,
                &[sym::lte, sym::symbol::lteq],
                decl!(lib; <>(lhs: Number, rhs: Number) -> Boolean),
            ),
            (
                sym::path::core::cmp::eq,
                &[sym::eq, sym::symbol::eqeq],
                decl!(lib; <T, U>(lhs: T, rhs: U) -> Boolean),
            ),
            (
                sym::path::core::cmp::ne,
                &[sym::ne, sym::symbol::excleq],
                decl!(lib; <T, U>(lhs: T, rhs: U) -> Boolean),
            ),
        ];

        for (name, alias, r#type) in items {
            func(&mut def, name, alias.iter().copied(), r#type);
        }

        def
    }
}
