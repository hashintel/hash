// This is in a separate module, to facilitate: https://linear.app/hash/issue/H-4735/hashql-convert-rust-types-into-hashql-types
use crate::{
    module::{
        StandardLibrary,
        std_lib::{ModuleDef, StandardLibraryModule},
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

    fn name() -> Symbol<'heap> {
        sym::types
    }

    fn define(_: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        ModuleDef::new()
    }
}
