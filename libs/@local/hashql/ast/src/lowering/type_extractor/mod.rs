mod contractive;
pub mod definition;
pub mod error;
pub mod translate;

use alloc::borrow::Cow;
use core::ops::Index;

use hashql_core::{
    collections::FastHashMap,
    module::{
        ModuleRegistry,
        locals::{TypeDef, TypeLocals},
    },
    r#type::{
        TypeId,
        environment::{Environment, instantiate::InstantiateEnvironment},
    },
};
use hashql_diagnostics::DiagnosticIssues;

pub use self::definition::TypeDefinitionExtractor;
use self::{
    error::TypeExtractorDiagnosticIssues,
    translate::{Reference, SpannedGenericArguments, TranslationUnit},
};
use crate::{
    node::{expr::closure::ClosureSignature, id::NodeId, r#type::Type},
    visit::Visitor,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnonymousTypes(FastHashMap<NodeId, TypeId>);

impl Index<NodeId> for AnonymousTypes {
    type Output = TypeId;

    fn index(&self, index: NodeId) -> &Self::Output {
        &self.0[&index]
    }
}

impl IntoIterator for AnonymousTypes {
    type IntoIter = hashbrown::hash_map::IntoIter<NodeId, TypeId>;
    type Item = (NodeId, TypeId);

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClosureSignatures<'heap>(FastHashMap<NodeId, TypeDef<'heap>>);

impl<'heap> Index<NodeId> for ClosureSignatures<'heap> {
    type Output = TypeDef<'heap>;

    fn index(&self, index: NodeId) -> &Self::Output {
        &self.0[&index]
    }
}

impl<'heap> IntoIterator for ClosureSignatures<'heap> {
    type IntoIter = hashbrown::hash_map::IntoIter<NodeId, TypeDef<'heap>>;
    type Item = (NodeId, TypeDef<'heap>);

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

pub struct TypeExtractor<'env, 'heap> {
    unit: TranslationUnit<'env, 'heap, TypeLocals<'heap>>,
    instantiate: InstantiateEnvironment<'env, 'heap>,

    types: FastHashMap<NodeId, TypeId>,
    closures: FastHashMap<NodeId, TypeDef<'heap>>,
}

impl<'env, 'heap> TypeExtractor<'env, 'heap> {
    #[must_use]
    pub fn new(
        environment: &'env Environment<'heap>,
        registry: &'env ModuleRegistry<'heap>,
        locals: &'env TypeLocals<'heap>,
    ) -> Self {
        Self {
            unit: TranslationUnit {
                env: environment,
                registry,
                diagnostics: DiagnosticIssues::new(),
                locals,
                bound_generics: Cow::Owned(SpannedGenericArguments::empty()),
            },
            instantiate: InstantiateEnvironment::new(environment),
            types: FastHashMap::default(),
            closures: FastHashMap::default(),
        }
    }

    pub fn take_diagnostics(&mut self) -> TypeExtractorDiagnosticIssues {
        core::mem::take(&mut self.unit.diagnostics)
    }

    #[must_use]
    pub fn into_types(self) -> (AnonymousTypes, ClosureSignatures<'heap>) {
        (AnonymousTypes(self.types), ClosureSignatures(self.closures))
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

    fn visit_closure_sig(&mut self, sig: &mut ClosureSignature<'heap>) {
        // We do not continue one walking any closure signatures as we do not want to convert their
        // types
        let mut def = self.unit.closure_signature(sig);
        def.instantiate(&mut self.instantiate);

        self.closures.insert(sig.id, def);
    }
}
