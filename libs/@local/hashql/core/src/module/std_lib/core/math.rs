use super::func;
use crate::{
    heap::Heap,
    module::{
        locals::TypeDef,
        std_lib::{ModuleDef, StandardLibrary, StandardLibraryModule, decl},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Math;

impl<'heap> StandardLibraryModule<'heap> for Math {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("math")
    }

    #[expect(clippy::non_ascii_literal, clippy::min_ident_chars, non_snake_case)]
    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        let Number = lib.ty.number();
        let Integer = lib.ty.integer();

        let items = [
            (
                "::core::math::add",
                &["+"] as &[&'static str],
                decl!(lib; <T: Number, U: Number>(lhs: T, rhs: U) -> lib.ty.union([T, U])),
            ),
            (
                "::core::math::sub",
                &["-"],
                decl!(lib; <T: Number, U: Number>(lhs: T, rhs: U) -> lib.ty.union([T, U])),
            ),
            (
                "::core::math::mul",
                &["*"],
                decl!(lib; <T: Number, U: Number>(lhs: T, rhs: U) -> lib.ty.union([T, U])),
            ),
            (
                "::core::math::div",
                &["/"],
                decl!(lib; <>(dividend: Number, divisor: Number) -> Number),
            ),
            (
                "::core::math::rem",
                &["%"],
                decl!(lib; <>(dividend: Integer, divisor: Integer) -> Integer),
            ),
            (
                "::core::math::mod",
                &[],
                decl!(lib; <>(value: Integer, modulus: Integer) -> Integer),
            ),
            (
                "::core::math::pow",
                &["**", "↑"],
                // (cannot be `Integer` on return, as `exponent` can be a negative integer)
                decl!(lib; <>(base: Number, exponent: Number) -> Number),
            ),
            (
                "::core::math::sqrt",
                &["√"],
                decl!(lib; <>(value: Number) -> Number),
            ),
            (
                "::core::math::cbrt",
                &["∛"],
                decl!(lib; <>(value: Number) -> Number),
            ),
            (
                "::core::math::root",
                &[], // cannot use `ⁿ√` because `ⁿ` is a letter, not a symbol
                decl!(lib; <>(value: Number, root: Number) -> Number),
            ),
        ];

        for (name, alias, r#type) in items {
            func(lib, &mut def, name, alias, r#type);
        }

        def
    }
}
