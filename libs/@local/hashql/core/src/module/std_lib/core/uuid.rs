use core::marker::PhantomData;

use crate::{
    heap::Heap,
    module::std_lib::{ItemDef, ModuleDef, StandardLibrary, StandardLibraryModule},
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Uuid {
    dependencies: PhantomData<()>,
}

impl<'heap> StandardLibraryModule<'heap> for Uuid {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("uuid")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();
        let heap = lib.heap;

        // TODO: consider making this constructor private via intrinsic (requires VM)
        // newtype Uuid = String;
        let uuid_ty = lib.ty.opaque("::core::uuid::Uuid", lib.ty.string());
        let uuid = ItemDef::newtype(lib.ty.env, uuid_ty, &[]);
        def.push(heap.intern_symbol("Uuid"), uuid);

        def
    }
}
