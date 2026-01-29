use super::{Variable, VariableKind};
use crate::{
    span::SpanId,
    r#type::{
        Type,
        environment::Environment,
        kind::{GenericArgument, Infer, Param, generic::GenericSubstitution},
        recursion::RecursionBoundary,
        visit::{self, Visitor, filter},
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
#[expect(
    dead_code,
    reason = "used during benchmarking to delay signficiant drop"
)]
pub(crate) struct VariableDependencyCollectorSkeleton<'heap> {
    recursion: RecursionBoundary<'heap>,
    variables: Vec<Variable>,
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

    pub(crate) fn into_skeleton(self) -> VariableDependencyCollectorSkeleton<'heap> {
        VariableDependencyCollectorSkeleton {
            recursion: self.recursion,
            variables: self.variables,
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
    type Result = Result<(), !>;

    fn env(&self) -> &Environment<'heap> {
        self.env
    }

    fn visit_type(&mut self, r#type: Type<'heap>) -> Self::Result {
        if self.recursion.enter(r#type, r#type).is_break() {
            // recursive type definition
            return Ok(());
        }

        let previous = self.current_span;
        self.current_span = r#type.span;

        Ok(()) = visit::walk_type(self, r#type);

        self.current_span = previous;

        self.recursion.exit(r#type, r#type);
        Ok(())
    }

    fn visit_generic_argument(&mut self, argument: GenericArgument<'heap>) -> Self::Result {
        // We only depend on the introduced variable, but **not** the constraint itself, therefore
        // we don't walk the argument.
        self.variables.push(Variable {
            span: self.current_span,
            kind: VariableKind::Generic(argument.id),
        });
        Ok(())
    }

    fn visit_generic_substitution(&mut self, substitution: GenericSubstitution) -> Self::Result {
        // We only depend on the introduced variable, but **not** the constraint itself, therefore
        // we don't walk the substitution.
        self.variables.push(Variable {
            span: self.current_span,
            kind: VariableKind::Generic(substitution.argument),
        });
        Ok(())
    }

    fn visit_param(&mut self, param: Type<'heap, Param>) -> Self::Result {
        Ok(()) = visit::walk_param(self, param);

        self.variables.push(Variable {
            span: param.span,
            kind: VariableKind::Generic(param.kind.argument),
        });
        Ok(())
    }

    fn visit_infer(&mut self, infer: Type<'heap, Infer>) -> Self::Result {
        Ok(()) = visit::walk_infer(self, infer);

        self.variables.push(Variable {
            span: infer.span,
            kind: VariableKind::Hole(infer.kind.hole),
        });
        Ok(())
    }
}

pub struct VariableCollector<'env, 'heap> {
    env: &'env Environment<'heap>,
    current_span: SpanId,
    variables: Vec<Variable>,
    recursion: RecursionBoundary<'heap>,
}

impl<'env, 'heap> VariableCollector<'env, 'heap> {
    pub fn new(env: &'env Environment<'heap>) -> Self {
        Self {
            env,
            current_span: SpanId::SYNTHETIC,
            variables: Vec::new(),
            recursion: RecursionBoundary::new(),
        }
    }

    #[must_use]
    pub fn take_variables(self) -> Vec<Variable> {
        self.variables
    }
}

impl<'heap> Visitor<'heap> for VariableCollector<'_, 'heap> {
    type Filter = filter::Deep;
    type Result = Result<(), !>;

    fn env(&self) -> &Environment<'heap> {
        self.env
    }

    fn visit_type(&mut self, r#type: Type<'heap>) -> Self::Result {
        if self.recursion.enter(r#type, r#type).is_break() {
            // recursive type definition
            return Ok(());
        }

        let previous = self.current_span;
        self.current_span = r#type.span;

        Ok(()) = visit::walk_type(self, r#type);

        self.current_span = previous;

        self.recursion.exit(r#type, r#type);
        Ok(())
    }

    fn visit_param(&mut self, param: Type<'heap, Param>) -> Self::Result {
        Ok(()) = visit::walk_param(self, param);

        self.variables.push(Variable {
            span: param.span,
            kind: VariableKind::Generic(param.kind.argument),
        });
        Ok(())
    }

    fn visit_infer(&mut self, infer: Type<'heap, Infer>) -> Self::Result {
        Ok(()) = visit::walk_infer(self, infer);

        self.variables.push(Variable {
            span: infer.span,
            kind: VariableKind::Hole(infer.kind.hole),
        });
        Ok(())
    }
}
