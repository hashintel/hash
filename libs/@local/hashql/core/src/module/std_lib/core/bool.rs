use super::func;
use crate::{
    module::{
        locals::TypeDef,
        std_lib::{ModuleDef, StandardLibrary, StandardLibraryModule, decl},
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Bool {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Bool {
    type Children = ();

    fn name() -> Symbol<'heap> {
        sym::bool
    }

    #[expect(non_snake_case)]
    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        let Boolean = lib.ty.boolean();

        let items = [
            (
                sym::path::core::bool::not,
                &[sym::not, sym::symbol::exclamation],
                decl!(lib; <>(value: Boolean) -> Boolean),
            ),
            (
                sym::path::core::bool::and,
                &[sym::and, sym::symbol::ampamp],
                decl!(lib; <>(lhs: Boolean, rhs: Boolean) -> Boolean),
            ),
            (
                sym::path::core::bool::or,
                &[sym::or, sym::symbol::pipepipe],
                decl!(lib; <>(lhs: Boolean, rhs: Boolean) -> Boolean),
            ),
        ];

        for (name, alias, r#type) in items {
            func(&mut def, name, alias.iter().copied(), r#type);
        }

        def
    }
}
