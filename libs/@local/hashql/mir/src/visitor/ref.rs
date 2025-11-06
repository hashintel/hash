use hashql_core::{intern::Interned, span::SpanId, value::Primitive};

use crate::{
    body::{
        basic_block::{BasicBlock, BasicBlockId},
        constant::Constant,
        local::Local,
        location::Location,
        operand::Operand,
        place::{Place, Projection},
        rvalue::{Aggregate, Apply, Binary, Input, RValue, Unary},
        statement::{Assign, Statement, StatementKind},
        terminator::{
            Branch, Goto, GraphRead, GraphReadBody, GraphReadHead, GraphReadLocation,
            GraphReadTail, Return, Terminator, TerminatorKind,
        },
    },
    def::DefId,
};

pub trait Visitor<'heap> {
    #[expect(unused_variables, reason = "trait definition")]
    fn visit_span_id(&mut self, span: &SpanId) {
        // leaf, nothing to do
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_def_id(&mut self, def_id: DefId) {
        // leaf, nothing to do
    }

    fn visit_basic_block_params(&mut self, location: Location, params: &Interned<'heap, [Local]>) {
        walk_params(self, location, params);
    }

    fn visit_basic_block(&mut self, id: BasicBlockId, block: &BasicBlock<'heap>) {
        walk_basic_block(self, id, block);
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_local(&mut self, location: Location, local: &Local) {
        // leaf, nothing to do
    }

    fn visit_projection(
        &mut self,
        location: Location,
        base: PlaceRef<'heap>,
        projection: Projection<'heap>,
    ) {
        walk_projection(self, location, base, projection);
    }

    fn visit_place(&mut self, location: Location, place: &Place<'heap>) {
        walk_place(self, location, place);
    }

    fn visit_primitive(&mut self, location: Location, primitive: &Primitive<'heap>) {
        walk_primitive(self, location, primitive);
    }

    fn visit_constant(&mut self, location: Location, constant: &Constant<'heap>) {
        walk_constant(self, location, constant);
    }

    fn visit_operand(&mut self, location: Location, operand: &Operand<'heap>) {
        walk_operand(self, location, operand);
    }

    fn visit_statement(&mut self, location: Location, statement: &Statement<'heap>) {
        walk_statement(self, location, statement);
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_statement_nop(&mut self, location: Location) {
        // leaf nothing to do
    }

    fn visit_statement_assign(&mut self, location: Location, assign: &Assign<'heap>) {
        walk_statement_assign(self, location, assign);
    }

    fn visit_statement_storage_live(&mut self, location: Location, local: &Local) {
        walk_statement_storage_live(self, location, local);
    }

    fn visit_statement_storage_dead(&mut self, location: Location, local: &Local) {
        walk_statement_storage_dead(self, location, local);
    }

    fn visit_rvalue(&mut self, location: Location, rvalue: &RValue<'heap>) {
        walk_rvalue(self, location, rvalue);
    }

    fn visit_rvalue_binary(&mut self, location: Location, binary: &Binary<'heap>) {
        walk_rvalue_binary(self, location, binary);
    }

    fn visit_rvalue_unary(&mut self, location: Location, unary: &Unary<'heap>) {
        walk_rvalue_unary(self, location, unary);
    }

    fn visit_rvalue_aggregate(&mut self, location: Location, aggregate: &Aggregate<'heap>) {
        walk_rvalue_aggregate(self, location, aggregate);
    }

    fn visit_rvalue_input(&mut self, location: Location, input: &Input<'heap>) {
        walk_rvalue_input(self, location, input);
    }

    fn visit_value_apply(&mut self, location: Location, apply: &Apply<'heap>) {
        walk_value_apply(self, location, apply);
    }

    fn visit_terminator(&mut self, location: Location, terminator: &Terminator<'heap>) {
        walk_terminator(self, location, terminator);
    }

    fn visit_terminator_goto(&mut self, location: Location, goto: &Goto<'heap>) {
        walk_terminator_goto(self, location, goto);
    }

    fn visit_terminator_branch(&mut self, location: Location, branch: &Branch<'heap>) {
        walk_terminator_branch(self, location, branch);
    }

    fn visit_terminator_return(&mut self, location: Location, r#return: &Return<'heap>) {
        walk_terminator_return(self, location, r#return);
    }

    fn visit_terminator_graph_read(&mut self, location: Location, graph_read: &GraphRead<'heap>) {
        walk_terminator_graph_read(self, location, graph_read);
    }

    fn visit_graph_read_head(&mut self, location: GraphReadLocation, head: &GraphReadHead<'heap>) {
        walk_graph_read_head(self, location, head);
    }

    fn visit_graph_read_body(&mut self, location: GraphReadLocation, body: &GraphReadBody) {
        walk_graph_read_body(self, location, body);
    }

    fn visit_graph_read_tail(&mut self, location: GraphReadLocation, tail: &GraphReadTail) {
        walk_graph_read_tail(self, location, tail);
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_terminator_unreachable(&mut self, location: Location) {
        // leaf: nothing to do
    }
}

pub fn walk_params<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    params: &Interned<'heap, [Local]>,
) {
    for param in params {
        visitor.visit_local(location, param);
    }
}

pub fn walk_basic_block<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    id: BasicBlockId,
    BasicBlock {
        params,
        statements,
        terminator,
    }: &BasicBlock<'heap>,
) {
    let mut location = Location {
        block: id,
        statement_index: 0,
    };

    visitor.visit_basic_block_params(location, params);

    location.statement_index += 1;

    for statement in statements {
        visitor.visit_statement(location, statement);
        location.statement_index += 1;
    }

    visitor.visit_terminator(location, terminator);
}

pub fn walk_statement<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Statement { span, kind }: &Statement<'heap>,
) {
    visitor.visit_span_id(span);

    match kind {
        StatementKind::Assign(assign) => visitor.visit_statement_assign(location, assign),
        StatementKind::Nop => visitor.visit_statement_nop(location),
        StatementKind::StorageLive(local) => visitor.visit_statement_storage_live(location, local),
        StatementKind::StorageDead(local) => visitor.visit_statement_storage_dead(location, local),
    }
}

pub fn walk_statement_assign<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Assign { lhs, rhs }: &Assign<'heap>,
) {
    visitor.visit_place(location, lhs);
    visitor.visit_rvalue(location, rhs);
}

pub fn walk_statement_storage_live<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    local: &Local,
) {
    visitor.visit_local(location, local);
}

pub fn walk_statement_storage_dead<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    local: &Local,
) {
    visitor.visit_local(location, local);
}

pub fn walk_terminator<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Terminator { span, kind }: &Terminator<'heap>,
) {
    visitor.visit_span_id(span);

    match kind {
        TerminatorKind::Goto(goto) => visitor.visit_terminator_goto(location, goto),
        TerminatorKind::Branch(branch) => visitor.visit_terminator_branch(location, branch),
        TerminatorKind::Return(r#return) => visitor.visit_terminator_return(location, r#return),
        TerminatorKind::GraphRead(graph_read) => {
            visitor.visit_terminator_graph_read(location, graph_read)
        }
        TerminatorKind::Unreachable => visitor.visit_terminator_unreachable(location),
    }
}
