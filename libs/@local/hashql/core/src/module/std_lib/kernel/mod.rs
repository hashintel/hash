use core::alloc::Allocator;

pub(in crate::module::std_lib) mod special_form;
pub(in crate::module::std_lib) mod r#type;

use super::{CacheId, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule};
use crate::symbol::{Symbol, sym};

pub(in crate::module::std_lib) struct Kernel;

impl<'heap> StandardLibraryModule<'heap> for Kernel {
    type Children = (self::special_form::SpecialForm, self::r#type::Type);

    const CACHE_ID: CacheId = CacheId::Kernel;

    fn name() -> Symbol<'heap> {
        sym::kernel
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        ModuleDef::new_in(context.alloc.clone())
    }
}
