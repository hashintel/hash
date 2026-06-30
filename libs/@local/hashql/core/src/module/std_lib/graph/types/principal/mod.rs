use core::alloc::Allocator;

pub mod actor_group;

use crate::{
    module::std_lib::{
        CacheId, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Principal {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Principal {
    type Children = (self::actor_group::ActorGroup,);

    const CACHE_ID: CacheId = CacheId::GraphTypesPrincipal;

    fn name() -> Symbol<'heap> {
        sym::principal
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        ModuleDef::new_in(context.alloc.clone())
    }
}
