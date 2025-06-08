mod special_form;
mod r#type;

use self::{special_form::SpecialForm, r#type::Type};
use super::{ModuleDef, StandardLibraryContext, StandardLibraryModule};
use crate::{heap::Heap, symbol::Symbol};

pub(crate) struct Kernel;

impl<'heap> StandardLibraryModule<'heap> for Kernel {
    type Children = (SpecialForm, Type);

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("kernel")
    }

    fn path(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("::kernel")
    }

    fn define(_: &mut StandardLibraryContext<'_, 'heap>) -> ModuleDef<'heap> {
        ModuleDef::new()
    }
}
