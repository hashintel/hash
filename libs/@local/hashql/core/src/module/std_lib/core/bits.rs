use super::func;
use crate::{
    module::{
        locals::TypeDef,
        std_lib::{ModuleDef, StandardLibrary, StandardLibraryModule, decl},
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Bits {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Bits {
    type Children = ();

    fn name() -> Symbol<'heap> {
        sym::bits
    }

    #[expect(non_snake_case)]
    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        let Integer = lib.ty.integer();

        let items = [
            (
                sym::path::core::bits::and,
                &[sym::and, sym::symbol::ampersand],
                decl!(lib; <>(lhs: Integer, rhs: Integer) -> Integer),
            ),
            (
                sym::path::core::bits::or,
                &[sym::or, sym::symbol::pipe],
                decl!(lib; <>(lhs: Integer, rhs: Integer) -> Integer),
            ),
            (
                sym::path::core::bits::xor,
                &[sym::xor, sym::symbol::caret],
                decl!(lib; <>(lhs: Integer, rhs: Integer) -> Integer),
            ),
            (
                sym::path::core::bits::not,
                &[sym::not, sym::symbol::tilde],
                decl!(lib; <>(value: Integer) -> Integer),
            ),
            (
                sym::path::core::bits::shl,
                &[sym::shl, sym::symbol::ltlt],
                // In the future we might want to specialize the `shift` to `Natural`
                decl!(lib; <>(value: Integer, shift: Integer) -> Integer),
            ),
            (
                sym::path::core::bits::shr,
                &[sym::shr, sym::symbol::gtgt],
                // In the future we might want to specialize the `shift` to `Natural`
                decl!(lib; <>(value: Integer, shift: Integer) -> Integer),
            ),
        ];

        for (name, alias, r#type) in items {
            func(&mut def, name, alias.iter().copied(), r#type);
        }

        def
    }
}
