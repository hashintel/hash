use hashql_core::module::namespace::ModuleNamespace;

use crate::{
    node::expr::{UseExpr, r#use::UseKind},
    visit::Visitor,
};

pub struct ImportResolver<'env, 'heap> {
    namespace: ModuleNamespace<'env, 'heap>,
}

impl<'env, 'heap> ImportResolver<'env, 'heap> {}

impl<'env, 'heap> Visitor<'heap> for ImportResolver<'env, 'heap> {
    fn visit_use_expr(
        &mut self,
        UseExpr {
            id,
            span,
            path,
            kind,
            body,
        }: &mut UseExpr<'heap>,
    ) {
        match kind {
            UseKind::Named(use_bindings) => todo!(),
            UseKind::Glob(glob) => todo!(),
        }
    }
}
