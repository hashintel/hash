use alloc::borrow::Cow;
use core::convert::Infallible;
use std::sync::Arc;

use hashql_core::{
    collection::SmallVec,
    module::{
        ModuleRegistry, Universe,
        item::ItemKind,
        locals::{TypeDef, TypeLocals},
    },
    span::SpanId,
    r#type::{
        TypeBuilder, TypeId,
        environment::{Environment, InferenceEnvironment, instantiate::InstantiateEnvironment},
        kind::{GenericArguments, PrimitiveType, TypeKind, generic::GenericSubstitution},
    },
};
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

use crate::{
    fold::{Fold, nested::Deep, walk_call},
    intern::Interner,
    node::{
        call::Call,
        kind::NodeKind,
        variable::{LocalVariable, QualifiedVariable, VariableKind},
    },
};

pub type SpecializeOpaqueDiagnostic = Diagnostic<SpecializeOpaqueDiagnosticCategory, SpanId>;

#[expect(clippy::empty_enum)]
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum SpecializeOpaqueDiagnosticCategory {}

impl DiagnosticCategory for SpecializeOpaqueDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("specialize-opaque")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Specialize Opaque")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        unreachable!()
    }
}

pub struct SpecializeOpaque<'env, 'heap> {
    interner: &'env Interner<'heap>,
    locals: &'env TypeLocals<'heap>,
    registry: &'env ModuleRegistry<'heap>,
    environment: &'env Environment<'heap>,
    instantiate: InstantiateEnvironment<'env, 'heap>,
}

impl<'env, 'heap> Fold<'heap> for SpecializeOpaque<'env, 'heap> {
    type NestedFilter = Deep;
    type Output<T>
        = Result<T, !>
    where
        T: 'heap;
    type Residual = Result<Infallible, !>;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn fold_call(&mut self, call: Call<'heap>) -> Self::Output<Call<'heap>> {
        let call = walk_call(self, call)?;

        let NodeKind::Variable(variable) = call.function.kind else {
            return Ok(call);
        };

        let (type_def, arguments) = match variable.kind {
            VariableKind::Local(LocalVariable {
                span,
                name,
                arguments,
            }) => {
                let Some(local) = self.locals.get(name.value) else {
                    return Ok(call);
                };

                (local.value, arguments)
            }
            VariableKind::Qualified(QualifiedVariable {
                span,
                path,
                arguments,
            }) => {
                let Some(item) = self
                    .registry
                    .lookup(path.0.iter().map(|ident| ident.value), Universe::Value)
                else {
                    return Ok(call);
                };

                let ItemKind::Constructor(constructor) = item.kind else {
                    return Ok(call);
                };

                (constructor.r#type, arguments)
            }
        };

        let mut opaque = type_def.id;

        // If the arguments aren't empty, this is a generic, therefore "peel" the generics off to
        // get the actual type, and then re-apply the generics around the closure
        let mut generic_arguments = GenericArguments::empty();
        if !arguments.is_empty() {
            let generic = self
                .environment
                .r#type(opaque)
                .kind
                .generic()
                .expect("opaque type should be generic if it has arguments");

            generic_arguments = generic.arguments;
            opaque = generic.base;
        }

        let repr = self
            .environment
            .r#type(opaque)
            .kind
            .opaque()
            .expect("type should be opaque")
            .repr;

        let is_null =
            *self.environment.r#type(repr).kind == TypeKind::Primitive(PrimitiveType::Null);

        let builder = TypeBuilder::spanned(variable.span, self.environment);

        // Create a closure, with the following
        // <generics>(repr?) -> opaque
        let params = if is_null { &[] as &[TypeId] } else { &[repr] };
        let mut closure = builder.closure(params.into_iter().copied(), opaque);
        if !generic_arguments.is_empty() {
            // apply the generics
            closure = builder.generic(generic_arguments, closure);
        }

        // Create a new TypeDef so that we can track any instantiations through the arguments
        // provided
        let mut def = TypeDef {
            id: closure,
            arguments: type_def.arguments,
        };
        def.instantiate(&mut self.instantiate);

        if arguments.is_empty() {
            // nothing needs to be applied, we're done!
            todo!()
        }

        if arguments.len() != def.arguments.len() {
            // O no! We can't apply :/
            todo!("issue diagnostic")
        }

        let substitutions =
            def.arguments
                .iter()
                .zip(arguments.iter())
                .map(|(argument, &binding)| GenericSubstitution {
                    argument: argument.id,
                    value: binding,
                });

        let closure = builder.apply(substitutions, def.id);
        def.id = closure;
        def.arguments = self.environment.intern_generic_argument_references(&[]);

        todo!()
    }
}
