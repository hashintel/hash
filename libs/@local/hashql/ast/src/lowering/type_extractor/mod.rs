pub mod definition;
pub mod error;
pub mod translate;

use hashql_core::{
    collection::FastHashMap,
    module::{ModuleRegistry, locals::LocalTypes},
    r#type::{
        TypeId,
        environment::{Environment, instantiate::InstantiateEnvironment},
    },
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

pub struct TypeExtractor<'env, 'heap> {
    unit: TranslationUnit<'env, 'heap, LocalTypes<'heap>>,
    instantiate: InstantiateEnvironment<'env, 'heap>,
    types: FastHashMap<NodeId, TypeId>,
}

impl<'env, 'heap> TypeExtractor<'env, 'heap> {
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
            instantiate: InstantiateEnvironment::new(environment),
            types: FastHashMap::default(),
        }
    }

    pub fn take_diagnostics(&mut self) -> Vec<TypeExtractorDiagnostic> {
        core::mem::take(&mut self.unit.diagnostics)
    }

    #[must_use]
    pub fn into_types(self) -> FastHashMap<NodeId, TypeId> {
        self.types
    }
}

impl<'heap> Visitor<'heap> for TypeExtractor<'_, 'heap> {
    fn visit_type(&mut self, r#type: &mut Type<'heap>) {
        // We do not continue traversing types, that way we only catch the top type
        let id = self.unit.reference(Reference::Type(r#type));

        let id = self.instantiate.instantiate(id);
        self.instantiate.clear_provisioned();

        self.types
            .try_insert(r#type.id, id)
            .unwrap_or_else(|_err| unreachable!("The node renumberer should've run before this"));
    }
}
