use core::alloc::Allocator;

use super::func;
use crate::{
    module::{
        locals::TypeDef,
        std_lib::{
            CacheId, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule, decl,
        },
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Math {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Math {
    type Children = ();

    const CACHE_ID: CacheId = CacheId::CoreMath;

    fn name() -> Symbol<'heap> {
        sym::math
    }

    #[expect(non_snake_case)]
    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        let Number = context.ty.number();
        let Integer = context.ty.integer();

        let items = [
            (
                sym::path::core::math::add,
                &[sym::add, sym::symbol::plus] as &[Symbol<'heap>],
                decl!(context; <T: Number, U: Number>(lhs: T, rhs: U) -> context.ty.union([T, U])),
            ),
            (
                sym::path::core::math::sub,
                &[sym::sub, sym::symbol::minus],
                decl!(context; <T: Number, U: Number>(lhs: T, rhs: U) -> context.ty.union([T, U])),
            ),
            (
                sym::path::core::math::mul,
                &[sym::mul, sym::symbol::asterisk],
                decl!(context; <T: Number, U: Number>(lhs: T, rhs: U) -> context.ty.union([T, U])),
            ),
            (
                sym::path::core::math::div,
                &[sym::div, sym::symbol::slash],
                decl!(context; <>(dividend: Number, divisor: Number) -> Number),
            ),
            (
                sym::path::core::math::rem,
                &[sym::rem, sym::symbol::percent],
                decl!(context; <>(dividend: Integer, divisor: Integer) -> Integer),
            ),
            (
                sym::path::core::math::r#mod,
                &[sym::r#mod],
                decl!(context; <>(value: Integer, modulus: Integer) -> Integer),
            ),
            (
                sym::path::core::math::pow,
                &[
                    sym::pow,
                    sym::symbol::asteriskasterisk,
                    sym::symbol::upwards,
                ],
                // (cannot be `Integer` on return, as `exponent` can be a negative integer)
                decl!(context; <>(base: Number, exponent: Number) -> Number),
            ),
            (
                sym::path::core::math::sqrt,
                &[sym::sqrt, sym::symbol::sqrt],
                decl!(context; <>(value: Number) -> Number),
            ),
            (
                sym::path::core::math::cbrt,
                &[sym::cbrt, sym::symbol::cbrt],
                decl!(context; <>(value: Number) -> Number),
            ),
            (
                sym::path::core::math::root,
                &[sym::root], // cannot use `ⁿ√` because `ⁿ` is a letter, not a symbol
                decl!(context; <>(value: Number, root: Number) -> Number),
            ),
        ];

        for (name, alias, r#type) in items {
            func(&mut def, name, alias.iter().copied(), r#type);
        }

        def
    }
}
