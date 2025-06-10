use core::iter;

use super::{ItemDef, ModuleDef, StandardLibrary, StandardLibraryModule};
use crate::{
    heap::Heap,
    module::{item::IntrinsicValueItem, locals::TypeDef},
    symbol::Symbol,
};

pub(in crate::module::std_lib) mod bits;
pub(in crate::module::std_lib) mod bool;
pub(in crate::module::std_lib) mod cmp;
pub(in crate::module::std_lib) mod math;
pub(in crate::module::std_lib) mod option;
pub(in crate::module::std_lib) mod result;
pub(in crate::module::std_lib) mod url;

fn func<'heap>(
    lib: &StandardLibrary<'_, 'heap>,
    def: &mut ModuleDef<'heap>,

    name: &'static str,
    alias: &[&'static str],

    r#type: TypeDef<'heap>,
) {
    let value = IntrinsicValueItem { name, r#type };

    let ident = name.rsplit_once("::").expect("path should be non-empty").1;

    def.push_aliased(
        iter::once(ident)
            .chain(alias.iter().copied())
            .map(|name| lib.heap.intern_symbol(name)),
        ItemDef::intrinsic(value),
    );
}

pub(in crate::module::std_lib) struct Core;

impl<'heap> StandardLibraryModule<'heap> for Core {
    type Children = (
        self::bits::Bits,
        self::bool::Bool,
        self::cmp::Cmp,
        self::math::Math,
        self::option::Option,
        self::result::Result,
        self::url::Url,
    );

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("core")
    }

    fn define(_: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        ModuleDef::new()
    }
}
