pub mod entity;

use crate::{
    module::{
        StandardLibrary,
        std_lib::{ModuleDef, StandardLibraryModule},
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Knowledge;

impl<'heap> StandardLibraryModule<'heap> for Knowledge {
    type Children = (self::entity::Entity,);

    fn name() -> Symbol<'heap> {
        sym::knowledge
    }

    fn define(_: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        ModuleDef::new()
    }
}
