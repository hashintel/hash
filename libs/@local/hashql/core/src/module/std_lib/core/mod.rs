use core::alloc::Allocator;

use super::{
    CacheId, ItemDef, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
};
use crate::{
    module::{item::IntrinsicValueItem, locals::TypeDef},
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) mod bits;
pub(in crate::module::std_lib) mod bool;
pub(in crate::module::std_lib) mod cmp;
pub mod json;
pub(in crate::module::std_lib) mod math;
pub mod option;
pub(in crate::module::std_lib) mod result;
pub mod url;
pub mod uuid;

pub(in crate::module::std_lib) fn func<'heap, S: Allocator>(
    def: &mut ModuleDef<'heap, S>,

    path: Symbol<'heap>,
    names: impl IntoIterator<Item = Symbol<'heap>>,

    r#type: TypeDef<'heap>,
) {
    let value = IntrinsicValueItem { name: path, r#type };

    def.push_aliased(names, ItemDef::intrinsic(value));
}

pub(in crate::module::std_lib) struct Core;

impl<'heap> StandardLibraryModule<'heap> for Core {
    type Children = (
        self::bits::Bits,
        self::bool::Bool,
        self::cmp::Cmp,
        self::json::Json,
        self::math::Math,
        self::option::Option,
        self::result::Result,
        self::url::Url,
        self::uuid::Uuid,
    );

    const CACHE_ID: CacheId = CacheId::Core;

    fn name() -> Symbol<'heap> {
        sym::core
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        ModuleDef::new_in(context.alloc.clone())
    }
}
