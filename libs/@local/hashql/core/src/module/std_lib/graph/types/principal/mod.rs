pub mod actor_group;

use crate::{
    module::{
        StandardLibrary,
        std_lib::{ModuleDef, StandardLibraryModule},
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Principal {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Principal {
    type Children = (self::actor_group::ActorGroup,);

    fn name() -> Symbol<'heap> {
        sym::principal
    }

    fn define(_: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        ModuleDef::new()
    }
}
