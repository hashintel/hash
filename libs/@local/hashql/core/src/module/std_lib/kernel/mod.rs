pub(in crate::module::std_lib) mod special_form;
pub(in crate::module::std_lib) mod r#type;

use super::{ModuleDef, StandardLibrary, StandardLibraryModule};
use crate::symbol::{Symbol, sym};

pub(in crate::module::std_lib) struct Kernel;

impl<'heap> StandardLibraryModule<'heap> for Kernel {
    type Children = (self::special_form::SpecialForm, self::r#type::Type);

    fn name() -> Symbol<'heap> {
        sym::kernel
    }

    fn define(_: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        ModuleDef::new()
    }
}
