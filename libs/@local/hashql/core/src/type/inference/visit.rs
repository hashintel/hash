use super::{Variable, VariableKind};
use crate::{
    span::SpanId,
    r#type::{
        Type,
        environment::Environment,
        kind::{GenericArgument, Infer, Param, generic::GenericSubstitution},
        recursion::RecursionBoundary,
        visit::{self, Visitor},
    },
};

pub(crate) struct VariableVisitorFilter(!);

impl visit::filter::Filter for VariableVisitorFilter {
    const DEEP: bool = true;
    const GENERIC_PARAMETERS: bool = true;
    const MEMBERS: bool = true;
    const SUBSTITUTIONS: bool = false;
}

#[derive(Debug)]
pub(crate) struct VariableDependencyCollector<'env, 'heap> {
    env: &'env Environment<'heap>,
    current_span: SpanId,
    recursion: RecursionBoundary<'heap>,
    variables: Vec<Variable>,
}

impl<'env, 'heap> VariableDependencyCollector<'env, 'heap> {
    pub(crate) fn new(env: &'env Environment<'heap>) -> Self {
        Self {
            env,
            current_span: SpanId::SYNTHETIC,
            recursion: RecursionBoundary::new(),
            variables: Vec::new(),
        }
    }

    pub(crate) fn collect(
        &mut self,
        r#type: Type<'heap>,
    ) -> impl IntoIterator<Item = Variable> + '_ {
        self.visit_type(r#type);

        self.variables.drain(..)
    }
}

impl<'heap> Visitor<'heap> for VariableDependencyCollector<'_, 'heap> {
    type Filter = VariableVisitorFilter;

    fn env(&self) -> &Environment<'heap> {
        self.env
    }

    fn visit_type(&mut self, r#type: Type<'heap>) {
        if self.recursion.enter(r#type, r#type).is_break() {
            // recursive type definition
            return;
        }

        let previous = self.current_span;
        self.current_span = r#type.span;

        visit::walk_type(self, r#type);

        self.current_span = previous;

        self.recursion.exit(r#type, r#type);
    }

    fn visit_generic_argument(&mut self, argument: GenericArgument<'heap>) {
        // We only depend on the introduced variable, but **not** the constraint itself, therefore
        // we don't walk the argument.
        self.variables.push(Variable {
            span: self.current_span,
            kind: VariableKind::Generic(argument.id),
        });
    }

    fn visit_generic_substitution(&mut self, substitution: GenericSubstitution) {
        // We only depend on the introduced variable, but **not** the constraint itself, therefore
        // we don't walk the substitution.
        self.variables.push(Variable {
            span: self.current_span,
            kind: VariableKind::Generic(substitution.argument),
        });
    }

    fn visit_param(&mut self, param: Type<'heap, Param>) {
        visit::walk_param(self, param);

        self.variables.push(Variable {
            span: param.span,
            kind: VariableKind::Generic(param.kind.argument),
        });
    }

    fn visit_infer(&mut self, infer: Type<'heap, Infer>) {
        visit::walk_infer(self, infer);

        self.variables.push(Variable {
            span: infer.span,
            kind: VariableKind::Hole(infer.kind.hole),
        });
    }
}
