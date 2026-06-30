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

pub(in crate::module::std_lib) struct Bits {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Bits {
    type Children = ();

    const CACHE_ID: CacheId = CacheId::CoreBits;

    fn name() -> Symbol<'heap> {
        sym::bits
    }

    #[expect(non_snake_case)]
    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        let Integer = context.ty.integer();

        let items = [
            (
                sym::path::core::bits::and,
                &[sym::and, sym::symbol::ampersand],
                decl!(context; <>(lhs: Integer, rhs: Integer) -> Integer),
            ),
            (
                sym::path::core::bits::or,
                &[sym::or, sym::symbol::pipe],
                decl!(context; <>(lhs: Integer, rhs: Integer) -> Integer),
            ),
            (
                sym::path::core::bits::xor,
                &[sym::xor, sym::symbol::caret],
                decl!(context; <>(lhs: Integer, rhs: Integer) -> Integer),
            ),
            (
                sym::path::core::bits::not,
                &[sym::not, sym::symbol::tilde],
                decl!(context; <>(value: Integer) -> Integer),
            ),
            (
                sym::path::core::bits::shl,
                &[sym::shl, sym::symbol::ltlt],
                // In the future we might want to specialize the `shift` to `Natural`
                decl!(context; <>(value: Integer, shift: Integer) -> Integer),
            ),
            (
                sym::path::core::bits::shr,
                &[sym::shr, sym::symbol::gtgt],
                // In the future we might want to specialize the `shift` to `Natural`
                decl!(context; <>(value: Integer, shift: Integer) -> Integer),
            ),
        ];

        for (name, alias, r#type) in items {
            func(&mut def, name, alias.iter().copied(), r#type);
        }

        def
    }
}
