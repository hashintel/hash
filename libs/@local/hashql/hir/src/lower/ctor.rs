use alloc::borrow::Cow;
use core::convert::Infallible;

use hashql_core::{
    intern::Interned,
    module::{
        ModuleRegistry, Universe,
        item::ItemKind,
        locals::{TypeDef, TypeLocals},
    },
    span::SpanId,
    r#type::{
        TypeBuilder, TypeId,
        environment::{Environment, instantiate::InstantiateEnvironment},
        kind::{GenericArguments, PrimitiveType, TypeKind, generic::GenericSubstitution},
    },
};
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

use crate::{
    fold::{Fold, nested::Deep, walk_node},
    intern::Interner,
    node::{
        Node, PartialNode,
        kind::NodeKind,
        operation::{
            Operation, OperationKind, TypeOperation,
            r#type::{TypeConstructor, TypeOperationKind},
        },
        variable::{LocalVariable, QualifiedVariable, Variable, VariableKind},
    },
};

pub type SpecializeOpaqueDiagnostic = Diagnostic<SpecializeOpaqueDiagnosticCategory, SpanId>;

#[expect(clippy::empty_enum)]
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum SpecializeOpaqueDiagnosticCategory {}

impl DiagnosticCategory for SpecializeOpaqueDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("convert-type-constructor")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Convert Type Constructor")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        unreachable!()
    }
}

pub struct ConvertTypeConstructor<'env, 'heap> {
    interner: &'env Interner<'heap>,
    locals: &'env TypeLocals<'heap>,
    registry: &'env ModuleRegistry<'heap>,
    environment: &'env Environment<'heap>,
    instantiate: InstantiateEnvironment<'env, 'heap>,
}

impl<'env, 'heap> ConvertTypeConstructor<'env, 'heap> {
    fn resolve_variable(
        &self,
        variable: &Variable<'heap>,
    ) -> Option<(TypeDef<'heap>, Interned<'heap, [TypeId]>)> {
        match variable.kind {
            VariableKind::Local(LocalVariable {
                span: _,
                name,
                arguments,
            }) => {
                let local = self.locals.get(name.value)?;

                Some((local.value, arguments))
            }
            VariableKind::Qualified(QualifiedVariable {
                span: _,
                path,
                arguments,
            }) => {
                let item = self
                    .registry
                    .lookup(path.0.iter().map(|ident| ident.value), Universe::Value)?;

                let ItemKind::Constructor(constructor) = item.kind else {
                    return None;
                };

                Some((constructor.r#type, arguments))
            }
        }
    }

    fn build_closure(
        &mut self,
        span: SpanId,
        opaque_id: TypeId,
        generics: GenericArguments<'heap>,
    ) -> TypeId {
        let opaque = self
            .environment
            .r#type(opaque_id)
            .kind
            .opaque()
            .expect("constructor type should be opaque");

        let repr_id = opaque.repr;
        let repr = self.environment.r#type(repr_id);

        let is_null = *repr.kind == TypeKind::Primitive(PrimitiveType::Null);

        let builder = TypeBuilder::spanned(span, self.environment);

        // Create a closure, with the following
        // <generics>(repr?) -> opaque
        let params = if is_null {
            &[] as &[TypeId]
        } else {
            &[repr_id]
        };

        let mut closure = builder.closure(params.into_iter().copied(), opaque_id);
        if !generics.is_empty() {
            // apply the generics
            closure = builder.generic(generics, closure);
        }

        closure
    }

    fn apply_generics(
        &mut self,
        node: &Node<'heap>,
        variable: &Variable<'heap>,
        closure_def: TypeDef<'heap>,
        generic_arguments: Interned<'heap, [TypeId]>,
    ) -> Option<Node<'heap>> {
        let make = |constructor| PartialNode {
            span: node.span,
            kind: NodeKind::Operation(Operation {
                span: variable.span,
                kind: OperationKind::Type(TypeOperation {
                    span: variable.span,
                    kind: TypeOperationKind::Constructor(constructor),
                }),
            }),
        };

        if generic_arguments.is_empty() {
            // We're done here, as we don't need to apply anything
            return Some(self.interner.intern_node(make(TypeConstructor {
                span: variable.span,
                closure: closure_def.id,
                arguments: closure_def.arguments,
            })));
        }

        // We need to check that the amount of generic arguments is the same as the amount of
        // generic parameters
        if generic_arguments.len() != closure_def.arguments.len() {
            todo!("issue diagnostic")
        }

        let substitutions = closure_def
            .arguments
            .iter()
            .zip(generic_arguments.iter())
            .map(|(reference, &apply)| GenericSubstitution {
                argument: reference.id,
                value: apply,
            });

        let builder = TypeBuilder::spanned(variable.span, self.environment);
        let closure_id = builder.apply(substitutions, closure_def.id);

        // We do not need to instantiate here again, because we already had α-renaming in the
        // closure definition, which means that the closure is already unique. As the closure is
        // unused and unique, we don't need to α-rename again.
        Some(self.interner.intern_node(make(TypeConstructor {
            span: variable.span,
            closure: closure_id,
            arguments: self.environment.intern_generic_argument_references(&[]),
        })))
    }

    fn convert_variable(&mut self, node: &Node<'heap>) -> Option<Node<'heap>> {
        let NodeKind::Variable(variable) = node.kind else {
            return None;
        };

        let (
            TypeDef {
                id: mut opaque_id,
                arguments: generic_references,
            },
            generic_arguments,
        ) = self.resolve_variable(variable)?;

        // If the arguments aren't empty, this is a generic, therefore "peel" the generics off to
        // get the actual type, and then re-apply the generics around the closure
        let mut generic_parameters = GenericArguments::empty();
        if !generic_references.is_empty() {
            let generic = self
                .environment
                .r#type(opaque_id)
                .kind
                .generic()
                .expect("opaque type with generics should be generic");

            generic_parameters = generic.arguments;
            opaque_id = generic.base;
        }

        let closure = self.build_closure(variable.span, opaque_id, generic_parameters);
        let mut closure_def = TypeDef {
            id: closure,
            arguments: generic_references,
        };
        closure_def.instantiate(&mut self.instantiate);

        self.apply_generics(node, variable, closure_def, generic_arguments)
    }
}

impl<'env, 'heap> Fold<'heap> for ConvertTypeConstructor<'env, 'heap> {
    type NestedFilter = Deep;
    type Output<T>
        = Result<T, !>
    where
        T: 'heap;
    type Residual = Result<Infallible, !>;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn fold_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        let node = walk_node(self, node)?;

        match self.convert_variable(&node) {
            None => Ok(node),
            Some(node) => Ok(node),
        }
    }
}
