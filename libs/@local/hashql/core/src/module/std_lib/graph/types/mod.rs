use core::alloc::Allocator;

// This is in a separate module, to facilitate: https://linear.app/hash/issue/H-4735/hashql-convert-rust-types-into-hashql-types
use crate::{
    module::std_lib::{
        CacheId, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
    },
    symbol::{Symbol, sym},
};

pub mod knowledge;
pub mod ontology;
pub mod principal;

pub(in crate::module::std_lib) struct Types {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Types {
    type Children = (
        self::knowledge::Knowledge,
        self::ontology::Ontology,
        self::principal::Principal,
    );

    const CACHE_ID: CacheId = CacheId::GraphTypes;

    fn name() -> Symbol<'heap> {
        sym::types
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        ModuleDef::new_in(context.alloc.clone())
    }
}
