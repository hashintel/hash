use super::func;
use crate::{
    module::{
        locals::TypeDef,
        std_lib::{ModuleDef, StandardLibrary, StandardLibraryModule, decl},
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Math {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Math {
    type Children = ();

    fn name() -> Symbol<'heap> {
        sym::math
    }

    #[expect(non_snake_case)]
    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        let Number = lib.ty.number();
        let Integer = lib.ty.integer();

        let items = [
            (
                sym::path::core::math::add,
                &[sym::add, sym::symbol::plus] as &[Symbol<'heap>],
                decl!(lib; <T: Number, U: Number>(lhs: T, rhs: U) -> lib.ty.union([T, U])),
            ),
            (
                sym::path::core::math::sub,
                &[sym::sub, sym::symbol::minus],
                decl!(lib; <T: Number, U: Number>(lhs: T, rhs: U) -> lib.ty.union([T, U])),
            ),
            (
                sym::path::core::math::mul,
                &[sym::mul, sym::symbol::asterisk],
                decl!(lib; <T: Number, U: Number>(lhs: T, rhs: U) -> lib.ty.union([T, U])),
            ),
            (
                sym::path::core::math::div,
                &[sym::div, sym::symbol::slash],
                decl!(lib; <>(dividend: Number, divisor: Number) -> Number),
            ),
            (
                sym::path::core::math::rem,
                &[sym::rem, sym::symbol::percent],
                decl!(lib; <>(dividend: Integer, divisor: Integer) -> Integer),
            ),
            (
                sym::path::core::math::r#mod,
                &[sym::r#mod],
                decl!(lib; <>(value: Integer, modulus: Integer) -> Integer),
            ),
            (
                sym::path::core::math::pow,
                &[
                    sym::pow,
                    sym::symbol::asteriskasterisk,
                    sym::symbol::upwards,
                ],
                // (cannot be `Integer` on return, as `exponent` can be a negative integer)
                decl!(lib; <>(base: Number, exponent: Number) -> Number),
            ),
            (
                sym::path::core::math::sqrt,
                &[sym::sqrt, sym::symbol::sqrt],
                decl!(lib; <>(value: Number) -> Number),
            ),
            (
                sym::path::core::math::cbrt,
                &[sym::cbrt, sym::symbol::cbrt],
                decl!(lib; <>(value: Number) -> Number),
            ),
            (
                sym::path::core::math::root,
                &[sym::root], // cannot use `ⁿ√` because `ⁿ` is a letter, not a symbol
                decl!(lib; <>(value: Number, root: Number) -> Number),
            ),
        ];

        for (name, alias, r#type) in items {
            func(&mut def, name, alias.iter().copied(), r#type);
        }

        def
    }
}
