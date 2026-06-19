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

pub(in crate::module::std_lib) struct Bool {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Bool {
    type Children = ();

    const CACHE_ID: CacheId = CacheId::CoreBool;

    fn name() -> Symbol<'heap> {
        sym::bool
    }

    #[expect(non_snake_case)]
    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        let Boolean = context.ty.boolean();

        let items = [
            (
                sym::path::core::bool::not,
                &[sym::not, sym::symbol::exclamation],
                decl!(context; <>(value: Boolean) -> Boolean),
            ),
            (
                sym::path::core::bool::and,
                &[sym::and, sym::symbol::ampamp],
                decl!(context; <>(lhs: Boolean, rhs: Boolean) -> Boolean),
            ),
            (
                sym::path::core::bool::or,
                &[sym::or, sym::symbol::pipepipe],
                decl!(context; <>(lhs: Boolean, rhs: Boolean) -> Boolean),
            ),
        ];

        for (name, alias, r#type) in items {
            func(&mut def, name, alias.iter().copied(), r#type);
        }

        def
    }
}
