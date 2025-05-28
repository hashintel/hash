use alloc::borrow::Cow;
use core::convert::Infallible;

use hashql_core::{
    module::{ModuleRegistry, Universe, item::ItemKind, locals::TypeLocals},
    span::SpanId,
    r#type::{TypeBuilder, environment::Environment, kind::generic::GenericSubstitution},
};
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

use crate::{
    fold::{Fold, nested::Deep, walk_call},
    intern::Interner,
    node::{
        call::Call,
        kind::NodeKind,
        variable::{LocalVariable, QualifiedVariable, Variable, VariableKind},
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
    builder: &'env TypeBuilder<'env, 'heap>,
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

        // TODO: we should create a closure here as the type
        if type_def.arguments.len() != arguments.len() {
            todo!("issue diagnostic");
        }

        let mut r#type = type_def.id;

        // Find the underlying `Opaque` type (and it's repr)
        let mut current = r#type;
        loop {
            match self.environment.r#type(current).kind {}
        }

        if !arguments.is_empty() {
            let arguments =
                type_def
                    .arguments
                    .iter()
                    .zip(arguments.iter())
                    .map(|(argument, &binding)| GenericSubstitution {
                        argument: argument.id,
                        value: binding,
                    });
        }

        todo!()
    }
}
