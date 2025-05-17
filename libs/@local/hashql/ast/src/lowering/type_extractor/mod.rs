pub mod definition;
pub mod error;
pub mod translate;

use hashql_core::{
    collection::FastHashMap,
    module::{ModuleRegistry, locals::LocalTypes},
    r#type::{TypeId, environment::Environment},
};

pub use self::definition::TypeDefinitionExtractor;
use self::{
    error::TypeExtractorDiagnostic,
    translate::{Reference, SpannedGenericArguments, TranslationUnit},
};
use crate::{
    node::{id::NodeId, r#type::Type},
    visit::Visitor,
};

pub struct TypeConverter<'env, 'heap> {
    unit: TranslationUnit<'env, 'heap, LocalTypes<'heap>>,
    types: FastHashMap<NodeId, TypeId>,
}

impl<'env, 'heap> TypeConverter<'env, 'heap> {
    #[must_use]
    pub fn new(
        environment: &'env Environment<'heap>,
        registry: &'env ModuleRegistry<'heap>,
        locals: &'env LocalTypes<'heap>,
    ) -> Self {
        Self {
            unit: TranslationUnit {
                env: environment,
                registry,
                diagnostics: Vec::new(),
                locals,
                bound_generics: const { &SpannedGenericArguments::empty() },
            },
            types: FastHashMap::default(),
        }
    }

    pub fn take_diagnostics(&mut self) -> Vec<TypeExtractorDiagnostic> {
        core::mem::take(&mut self.unit.diagnostics)
    }
}

impl<'heap> Visitor<'heap> for TypeConverter<'_, 'heap> {
    fn visit_type(&mut self, r#type: &mut Type<'heap>) {
        // We do not continue traversing types, that way we only catch the top type
        let id = self.unit.reference(Reference::Type(r#type));

        self.types
            .try_insert(r#type.id, id)
            .unwrap_or_else(|_err| unreachable!("The node renumberer should've run before this"));
    }
}
