use super::func;
use crate::{
    heap::Heap,
    module::{
        locals::TypeDef,
        std_lib::{ModuleDef, StandardLibrary, StandardLibraryModule, decl},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Bits;

impl<'heap> StandardLibraryModule<'heap> for Bits {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("bits")
    }

    #[expect(non_snake_case)]
    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        let Integer = lib.ty.integer();

        let items = [
            (
                "::core::bits::and",
                &["&"],
                decl!(lib; <>(lhs: Integer, rhs: Integer) -> Integer),
            ),
            (
                "::core::bits::or",
                &["|"],
                decl!(lib; <>(lhs: Integer, rhs: Integer) -> Integer),
            ),
            (
                "::core::bits::xor",
                &["^"],
                decl!(lib; <>(lhs: Integer, rhs: Integer) -> Integer),
            ),
            (
                "::core::bits::not",
                &["~"],
                decl!(lib; <>(value: Integer) -> Integer),
            ),
            (
                "::core::bits::shl",
                &["<<"],
                // In the future we might want to specialize the `shift` to `Natural`
                decl!(lib; <>(value: Integer, shift: Integer) -> Integer),
            ),
            (
                "::core::bits::shr",
                &[">>"],
                // In the future we might want to specialize the `shift` to `Natural`
                decl!(lib; <>(value: Integer, shift: Integer) -> Integer),
            ),
        ];

        for (name, alias, r#type) in items {
            func(lib, &mut def, name, alias, r#type);
        }

        def
    }
}
