use crate::{
    heap::Heap,
    node::expr::{CallExpr, Expr, ExprKind},
    visit::{Visitor, walk_expr},
};

mod paths {}

enum SpecialFormKind {}

pub struct SpecialFormExpander<'heap> {
    heap: &'heap Heap,
}

impl<'heap> SpecialFormExpander<'heap> {
    pub const fn new(heap: &'heap Heap) -> Self {
        Self { heap }
    }

    fn on_if(&mut self, call: &mut CallExpr<'heap>) {
        // Implementation for if special form
    }

    fn on_is(&mut self, call: &mut CallExpr<'heap>) {
        // Implementation for is special form
    }

    fn on_let(&mut self, call: &mut CallExpr<'heap>) {
        // Implementation for let special form
    }

    fn on_type(&mut self, call: &mut CallExpr<'heap>) {
        // Implementation for type special form
    }

    fn on_newtype(&mut self, call: &mut CallExpr<'heap>) {
        // Implementation for newtype special form
    }

    fn on_use(&mut self, call: &mut CallExpr<'heap>) {
        // Implementation for use special form
    }

    fn on_fn(&mut self, call: &mut CallExpr<'heap>) {
        // Implementation for fn special form
    }

    fn on_input(&mut self, call: &mut CallExpr<'heap>) {
        // Implementation for input special form
    }

    fn on_access(&mut self, call: &mut CallExpr<'heap>) {
        // Implementation for access special form
    }

    fn on_index(&mut self, call: &mut CallExpr<'heap>) {
        // Implementation for index special form
    }

    fn error_on_unknown_special_form(&mut self, function: &str) {
        todo!()
    }
}

impl<'heap> Visitor<'heap> for SpecialFormExpander<'heap> {
    fn visit_expr(&mut self, expr: &mut Expr<'heap>) {
        // First we walk the whole expression tree, and only then do we expand ourselves.
        walk_expr(self, expr);

        let ExprKind::Call(call) = &mut expr.kind else {
            return;
        };

        let Some(ExprKind::Path(path)) = call.arguments.get(0).map(|arg| &arg.kind) else {
            return;
        };

        if !path.starts_with_absolute_path(["kernel", "special_form"]) {
            return;
        }

        if path.segments.len() != 3 {
            // Special form path is always exactly three segments long
            return;
        }

        let function = &path.segments[2].name.value;

        match function.as_str() {
            "if" => self.on_if(call),
            "is" => self.on_is(call),
            "let" => self.on_let(call),
            "type" => self.on_type(call),
            "newtype" => self.on_newtype(call),
            "use" => self.on_use(call),
            "fn" => self.on_fn(call),
            "input" => self.on_input(call),
            "access" => self.on_access(call),
            "index" => self.on_index(call),
            _ => self.error_on_unknown_special_form(function),
        }
    }
}
