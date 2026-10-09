use core::alloc::Allocator;

pub mod entity;

use crate::{
    module::std_lib::{
        CacheId, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Knowledge;

impl<'heap> StandardLibraryModule<'heap> for Knowledge {
    type Children = (self::entity::Entity,);

    const CACHE_ID: CacheId = CacheId::GraphTypesKnowledge;

    fn name() -> Symbol<'heap> {
        sym::knowledge
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        ModuleDef::new_in(context.alloc.clone())
    }
}
