use core::ops::Try;

use hashql_core::{intern::Interned, span::SpanId, value::Primitive};

use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockId},
        constant::Constant,
        local::Local,
        location::Location,
        operand::Operand,
        place::{Place, PlaceRef, Projection},
        rvalue::{Aggregate, Apply, Binary, Input, RValue, Unary},
        statement::{Assign, Statement, StatementKind},
        terminator::{
            Branch, Goto, GraphRead, GraphReadBody, GraphReadHead, GraphReadLocation,
            GraphReadTail, Return, Terminator, TerminatorKind,
        },
    },
    def::DefId,
};

macro_rules! Ok {
    () => {
        Try::from_output(())
    };
}

pub trait Visitor<'heap> {
    type Result: Try<Output = ()>;

    // The mut version would be `span: &mut SpanId`
    #[expect(unused_variables, reason = "trait definition")]
    fn visit_span(&mut self, span: SpanId) -> Self::Result {
        // leaf: nothing to do
        Ok!()
    }

    // The mut version would be `def_id: &mut DefId`
    #[expect(unused_variables, reason = "trait definition")]
    fn visit_def_id(&mut self, def_id: DefId) -> Self::Result {
        // leaf: nothing to do
        Ok!()
    }

    // The mut version would be `def_id: &mut Interned<'heap, [Local]>`
    fn visit_basic_block_params(
        &mut self,
        location: Location,
        params: Interned<'heap, [Local]>,
    ) -> Self::Result {
        walk_params(self, location, params)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_source(&mut self, source: &Source<'heap>) -> Self::Result {
        // leaf: nothing to do
        // in theory this references a DefId through the Intrinsic, but when walking DefId this
        // isn't what we actually want.
        Ok!()
    }

    fn visit_body(&mut self, body: &Body<'heap>) -> Self::Result {
        walk_body(self, body)
    }

    fn visit_basic_block(&mut self, id: BasicBlockId, block: &BasicBlock<'heap>) -> Self::Result {
        walk_basic_block(self, id, block)
    }

    // The mut version would be `local: &mut Local`
    #[expect(unused_variables, reason = "trait definition")]
    fn visit_local(&mut self, location: Location, local: Local) -> Self::Result {
        // leaf, nothing to do
        Ok!()
    }

    fn visit_projection(
        &mut self,
        location: Location,
        base: PlaceRef<'heap>,
        projection: Projection<'heap>,
    ) -> Self::Result {
        walk_projection(self, location, base, projection)
    }

    fn visit_place(&mut self, location: Location, place: &Place<'heap>) -> Self::Result {
        walk_place(self, location, place)
    }

    fn visit_primitive(
        &mut self,
        location: Location,
        primitive: &Primitive<'heap>,
    ) -> Self::Result {
        walk_primitive(self, location, primitive)
    }

    fn visit_constant(&mut self, location: Location, constant: &Constant<'heap>) -> Self::Result {
        walk_constant(self, location, constant)
    }

    fn visit_operand(&mut self, location: Location, operand: &Operand<'heap>) -> Self::Result {
        walk_operand(self, location, operand)
    }

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &Statement<'heap>,
    ) -> Self::Result {
        walk_statement(self, location, statement)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_statement_nop(&mut self, location: Location) -> Self::Result {
        // leaf: nothing to do
        Ok!()
    }

    fn visit_statement_assign(
        &mut self,
        location: Location,
        assign: &Assign<'heap>,
    ) -> Self::Result {
        walk_statement_assign(self, location, assign)
    }

    // This would be `&mut Local` in `VisitorMut`
    fn visit_statement_storage_live(&mut self, location: Location, local: Local) -> Self::Result {
        walk_statement_storage_live(self, location, local)
    }

    // This would be `&mut Local` in `VisitorMut`
    fn visit_statement_storage_dead(&mut self, location: Location, local: Local) -> Self::Result {
        walk_statement_storage_dead(self, location, local)
    }

    fn visit_rvalue(&mut self, location: Location, rvalue: &RValue<'heap>) -> Self::Result {
        walk_rvalue(self, location, rvalue)
    }

    fn visit_rvalue_binary(&mut self, location: Location, binary: &Binary<'heap>) -> Self::Result {
        walk_rvalue_binary(self, location, binary)
    }

    fn visit_rvalue_unary(&mut self, location: Location, unary: &Unary<'heap>) -> Self::Result {
        walk_rvalue_unary(self, location, unary)
    }

    fn visit_rvalue_aggregate(
        &mut self,
        location: Location,
        aggregate: &Aggregate<'heap>,
    ) -> Self::Result {
        walk_rvalue_aggregate(self, location, aggregate)
    }

    fn visit_rvalue_input(&mut self, location: Location, input: &Input<'heap>) -> Self::Result {
        walk_rvalue_input(self, location, input)
    }

    fn visit_value_apply(&mut self, location: Location, apply: &Apply<'heap>) -> Self::Result {
        walk_value_apply(self, location, apply)
    }

    fn visit_terminator(
        &mut self,
        location: Location,
        terminator: &Terminator<'heap>,
    ) -> Self::Result {
        walk_terminator(self, location, terminator)
    }

    fn visit_terminator_goto(&mut self, location: Location, goto: &Goto<'heap>) -> Self::Result {
        walk_terminator_goto(self, location, goto)
    }

    fn visit_terminator_branch(
        &mut self,
        location: Location,
        branch: &Branch<'heap>,
    ) -> Self::Result {
        walk_terminator_branch(self, location, branch)
    }

    fn visit_terminator_return(
        &mut self,
        location: Location,
        r#return: &Return<'heap>,
    ) -> Self::Result {
        walk_terminator_return(self, location, r#return)
    }

    fn visit_terminator_graph_read(
        &mut self,
        location: Location,
        graph_read: &GraphRead<'heap>,
    ) -> Self::Result {
        walk_terminator_graph_read(self, location, graph_read)
    }

    fn visit_graph_read_head(
        &mut self,
        location: GraphReadLocation,
        head: &GraphReadHead<'heap>,
    ) -> Self::Result {
        walk_graph_read_head(self, location, head)
    }

    fn visit_graph_read_body(
        &mut self,
        location: GraphReadLocation,
        body: &GraphReadBody,
    ) -> Self::Result {
        walk_graph_read_body(self, location, body)
    }

    fn visit_graph_read_tail(
        &mut self,
        location: GraphReadLocation,
        tail: &GraphReadTail,
    ) -> Self::Result {
        walk_graph_read_tail(self, location, tail)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_terminator_unreachable(&mut self, location: Location) -> Self::Result {
        // leaf: nothing to do
        Ok!()
    }
}

pub fn walk_params<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    params: Interned<'heap, [Local]>,
) -> T::Result {
    for param in params {
        visitor.visit_local(location, *param)?;
    }

    Ok!()
}

pub fn walk_body<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Body {
        span,
        source,
        basic_blocks,
        args: _,
    }: &Body<'heap>,
) -> T::Result {
    visitor.visit_span(*span)?;
    visitor.visit_source(source)?;

    for (id, basic_block) in basic_blocks.iter_enumerated() {
        visitor.visit_basic_block(id, basic_block)?;
    }

    Ok!()
}

pub fn walk_basic_block<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    id: BasicBlockId,
    BasicBlock {
        params,
        statements,
        terminator,
    }: &BasicBlock<'heap>,
) -> T::Result {
    let mut location = Location {
        block: id,
        statement_index: 0,
    };

    visitor.visit_basic_block_params(location, *params)?;

    location.statement_index += 1;

    for statement in statements {
        visitor.visit_statement(location, statement)?;
        location.statement_index += 1;
    }

    visitor.visit_terminator(location, terminator)?;

    Ok!()
}

fn walk_projection<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    _base: PlaceRef<'heap>,
    projection: Projection<'heap>,
) -> T::Result {
    match projection {
        Projection::Field(_) => Ok!(),
        Projection::FieldByName(_) => Ok!(),
        Projection::Index(local) => visitor.visit_local(location, local),
    }
}

fn walk_place<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    place @ Place {
        local,
        projections: _,
    }: &Place<'heap>,
) -> T::Result {
    visitor.visit_local(location, *local)?;

    for (base, projection) in place.iter_projections() {
        visitor.visit_projection(location, base, projection)?;
    }

    Ok!()
}

pub fn walk_statement<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Statement { span, kind }: &Statement<'heap>,
) -> T::Result {
    visitor.visit_span(*span)?;

    match kind {
        StatementKind::Assign(assign) => visitor.visit_statement_assign(location, assign),
        StatementKind::Nop => visitor.visit_statement_nop(location),
        StatementKind::StorageLive(local) => visitor.visit_statement_storage_live(location, *local),
        StatementKind::StorageDead(local) => visitor.visit_statement_storage_dead(location, *local),
    }
}

pub fn walk_statement_assign<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Assign { lhs, rhs }: &Assign<'heap>,
) -> T::Result {
    visitor.visit_place(location, lhs)?;
    visitor.visit_rvalue(location, rhs)?;

    Ok!()
}

pub fn walk_statement_storage_live<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    local: Local,
) -> T::Result {
    visitor.visit_local(location, local)?;

    Ok!()
}

pub fn walk_statement_storage_dead<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    local: Local,
) -> T::Result {
    visitor.visit_local(location, local)?;

    Ok!()
}

pub fn walk_terminator<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Terminator { span, kind }: &Terminator<'heap>,
) -> T::Result {
    visitor.visit_span(*span)?;

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
