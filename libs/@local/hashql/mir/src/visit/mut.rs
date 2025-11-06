use core::{
    mem,
    ops::{FromResidual, Try},
};

use hashql_core::{
    intern::{Beef, Interned},
    span::SpanId,
    symbol::Symbol,
    value::Primitive,
};

use self::filter::Filter;
use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockId},
        constant::Constant,
        local::Local,
        location::Location,
        operand::Operand,
        place::{Place, PlaceRef, Projection},
        rvalue::{Aggregate, AggregateKind, Apply, Binary, Input, RValue, Unary},
        statement::{Assign, Statement, StatementKind},
        terminator::{
            Branch, Goto, GraphRead, GraphReadBody, GraphReadHead, GraphReadLocation,
            GraphReadTail, Return, Target, Terminator, TerminatorKind,
        },
    },
    def::DefId,
    intern::Interner,
};

macro_rules! Ok {
    () => {
        Try::from_output(())
    };
}

mod filter {
    pub trait Filter {
        const FOLD_INTERNED: bool;
    }

    pub struct Deep(());

    impl Filter for Deep {
        const FOLD_INTERNED: bool = true;
    }

    pub struct Shallow(());

    impl Filter for Shallow {
        const FOLD_INTERNED: bool = false;
    }
}

pub trait VisitorMut<'heap> {
    type Result<T>: Try<Output = T>
    where
        T: 'heap;

    type Filter: filter::Filter = filter::Deep;

    fn interner(&self) -> &Interner<'heap> {
        panic!("must be implemented if filter has T::FOLD_INTERNED enabled")
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_span(&mut self, span: &mut SpanId) -> Self::Result<()> {
        // leaf: nothing to do
        Ok!()
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_symbol(&mut self, location: Location, symbol: &mut Symbol<'heap>) -> Self::Result<()> {
        // leaf: nothing to do
        Ok!()
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_source(&mut self, source: &mut Source<'heap>) -> Self::Result<()> {
        // leaf: nothing to do
        Ok!()
    }

    fn visit_body(&mut self, body: &mut Body<'heap>) -> Self::Result<()> {
        walk_body(self, body)
    }

    fn visit_basic_block(
        &mut self,
        id: BasicBlockId,
        block: &mut BasicBlock<'heap>,
    ) -> Self::Result<()> {
        walk_basic_block(self, id, block)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_def_id(&mut self, location: Location, def_id: &mut DefId) -> Self::Result<()> {
        // leaf: nothing to do
        Ok!()
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn fold_local(&mut self, location: Location, local: Local) -> Self::Result<Local> {
        Try::from_output(local)
    }

    fn visit_local(&mut self, location: Location, local: &mut Local) -> Self::Result<()> {
        walk_local(self, location, local)
    }

    fn visit_projections(
        &mut self,
        location: Location,
        base: Local,
        projections: &mut Interned<'heap, [Local]>,
    ) -> Self::Result<()> {
        walk_projections(self, location, base, projections)
    }

    fn fold_projection(
        &mut self,
        location: Location,
        base: PlaceRef<'heap>,
        projection: Projection<'heap>,
    ) -> Self::Result<Projection> {
        walk_fold_projection(self, location, base, projection)
    }

    fn visit_projection(
        &mut self,
        location: Location,
        base: PlaceRef<'heap>,
        projection: Projection<'heap>,
    ) -> Self::Result<()> {
        walk_projection(self, location, base, projection)
    }

    fn visit_place(&mut self, location: Location, place: &mut Place<'heap>) -> Self::Result<()> {
        walk_place(self, location, place)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_primitive(
        &mut self,
        location: Location,
        primitive: &Primitive<'heap>,
    ) -> Self::Result<()> {
        // leaf, nothing to do
        Ok!()
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_unit(&mut self, location: Location) -> Self::Result<()> {
        // leaf, nothing to do
        Ok!()
    }

    fn visit_constant(
        &mut self,
        location: Location,
        constant: &mut Constant<'heap>,
    ) -> Self::Result<()> {
        walk_constant(self, location, constant)
    }

    fn visit_operand(
        &mut self,
        location: Location,
        operand: &mut Operand<'heap>,
    ) -> Self::Result<()> {
        walk_operand(self, location, operand)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_basic_block_id(
        &mut self,
        location: Location,
        basic_block_id: &mut BasicBlockId,
    ) -> Self::Result<()> {
        // leaf, nothing to do
        Ok!()
    }

    fn visit_basic_block_params(
        &mut self,
        location: Location,
        params: &mut Interned<'heap, [Local]>,
    ) -> Self::Result<()> {
        walk_params(self, location, params)
    }

    fn visit_target(&mut self, location: Location, target: &mut Target<'heap>) -> Self::Result<()> {
        walk_target(self, location, target)
    }

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &mut Statement<'heap>,
    ) -> Self::Result<()> {
        walk_statement(self, location, statement)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_statement_nop(&mut self, location: Location) -> Self::Result<()> {
        // leaf: nothing to do
        Ok!()
    }

    fn visit_statement_assign(
        &mut self,
        location: Location,
        assign: &mut Assign<'heap>,
    ) -> Self::Result<()> {
        walk_statement_assign(self, location, assign)
    }

    fn visit_statement_storage_live(
        &mut self,
        location: Location,
        local: &mut Local,
    ) -> Self::Result<()> {
        walk_statement_storage_live(self, location, local)
    }

    fn visit_statement_storage_dead(
        &mut self,
        location: Location,
        local: &mut Local,
    ) -> Self::Result<()> {
        walk_statement_storage_dead(self, location, local)
    }

    fn visit_rvalue(&mut self, location: Location, rvalue: &mut RValue<'heap>) -> Self::Result<()> {
        walk_rvalue(self, location, rvalue)
    }

    fn visit_rvalue_binary(
        &mut self,
        location: Location,
        binary: &mut Binary<'heap>,
    ) -> Self::Result<()> {
        walk_rvalue_binary(self, location, binary)
    }

    fn visit_rvalue_unary(
        &mut self,
        location: Location,
        unary: &mut Unary<'heap>,
    ) -> Self::Result<()> {
        walk_rvalue_unary(self, location, unary)
    }

    fn visit_rvalue_aggregate(
        &mut self,
        location: Location,
        aggregate: &mut Aggregate<'heap>,
    ) -> Self::Result<()> {
        walk_rvalue_aggregate(self, location, aggregate)
    }

    fn visit_rvalue_input(
        &mut self,
        location: Location,
        input: &mut Input<'heap>,
    ) -> Self::Result<()> {
        walk_rvalue_input(self, location, input)
    }

    fn visit_rvalue_apply(
        &mut self,
        location: Location,
        apply: &mut Apply<'heap>,
    ) -> Self::Result<()> {
        walk_rvalue_apply(self, location, apply)
    }

    fn visit_terminator(
        &mut self,
        location: Location,
        terminator: &mut Terminator<'heap>,
    ) -> Self::Result<()> {
        walk_terminator(self, location, terminator)
    }

    fn visit_terminator_goto(
        &mut self,
        location: Location,
        goto: &mut Goto<'heap>,
    ) -> Self::Result<()> {
        walk_terminator_goto(self, location, goto)
    }

    fn visit_terminator_branch(
        &mut self,
        location: Location,
        branch: &mut Branch<'heap>,
    ) -> Self::Result<()> {
        walk_terminator_branch(self, location, branch)
    }

    fn visit_terminator_return(
        &mut self,
        location: Location,
        r#return: &mut Return<'heap>,
    ) -> Self::Result<()> {
        walk_terminator_return(self, location, r#return)
    }

    fn visit_terminator_graph_read(
        &mut self,
        location: Location,
        graph_read: &mut GraphRead<'heap>,
    ) -> Self::Result<()> {
        walk_terminator_graph_read(self, location, graph_read)
    }

    fn visit_graph_read_head(
        &mut self,
        location: GraphReadLocation,
        head: &mut GraphReadHead<'heap>,
    ) -> Self::Result<()> {
        walk_graph_read_head(self, location, head)
    }

    fn visit_graph_read_body(
        &mut self,
        location: GraphReadLocation,
        body: &mut GraphReadBody,
    ) -> Self::Result<()> {
        walk_graph_read_body(self, location, body)
    }

    // The mut version would be `tail: &mut GraphReadTail`
    fn visit_graph_read_tail(
        &mut self,
        location: GraphReadLocation,
        tail: &mut GraphReadTail,
    ) -> Self::Result<()> {
        walk_graph_read_tail(self, location, tail)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_terminator_unreachable(&mut self, location: Location) -> Self::Result<()> {
        // leaf: nothing to do
        Ok!()
    }
}

pub fn walk_params<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    params: &mut Interned<'heap, [Local]>,
) -> T::Result<()> {
    if !T::Filter::FOLD_INTERNED {
        return Ok!();
    }

    // For a brief amount we put the params into an invalid state, this is fine, as we are the only
    // ones who can modify it (&mut).
    let mut beef = Beef::new(mem::replace(params, Interned::new_unchecked(&[])));
    beef.try_map::<_, T::Result<()>>(|local| visitor.fold_local(location, local))?;
    *params = beef.finish(&visitor.interner().locals);

    Ok!()
}

pub fn walk_body<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    Body {
        span,
        source,
        basic_blocks,
        args: _,
    }: &Body<'heap>,
) -> T::Result<()> {
    visitor.visit_span(*span)?;
    visitor.visit_source(source)?;

    for (id, basic_block) in basic_blocks.iter_enumerated() {
        visitor.visit_basic_block(id, basic_block)?;
    }

    Ok!()
}

pub fn walk_basic_block<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    id: BasicBlockId,
    BasicBlock {
        params,
        statements,
        terminator,
    }: &BasicBlock<'heap>,
) -> T::Result<()> {
    let mut location = Location {
        block: id,
        statement_index: 0,
    };

    visitor.visit_basic_block_id(location, id)?;
    visitor.visit_basic_block_params(location, *params)?;

    location.statement_index += 1;

    for statement in statements {
        visitor.visit_statement(location, statement)?;
        location.statement_index += 1;
    }

    visitor.visit_terminator(location, terminator)?;

    Ok!()
}

pub fn walk_local<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    local: &mut Local,
) -> T::Result<()> {
    if !T::Filter::FOLD_INTERNED {
        return Ok!();
    }

    *local = visitor.fold_local(location, *local)?;
    Ok!()
}

pub fn walk_projection<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    _base: PlaceRef<'heap>,
    projection: Projection<'heap>,
) -> T::Result<()> {
    match projection {
        Projection::Field(_) => Ok!(),
        Projection::FieldByName(name) => visitor.visit_symbol(location, name),
        Projection::Index(local) => visitor.visit_local(location, local),
    }
}

pub fn walk_place<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    place @ Place {
        local,
        projections: _,
    }: &Place<'heap>,
) -> T::Result<()> {
    visitor.visit_local(location, *local)?;

    for (base, projection) in place.iter_projections() {
        visitor.visit_projection(location, base, projection)?;
    }

    Ok!()
}

pub fn walk_constant<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    constant: &Constant<'heap>,
) -> T::Result<()> {
    match constant {
        Constant::Primitive(primitive) => visitor.visit_primitive(location, primitive),
        Constant::Unit => visitor.visit_unit(location),
        Constant::FnPtr(def_id) => visitor.visit_def_id(location, *def_id),
    }
}

pub fn walk_operand<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    operand: &Operand<'heap>,
) -> T::Result<()> {
    match operand {
        Operand::Place(place) => visitor.visit_place(location, place),
        Operand::Constant(constant) => visitor.visit_constant(location, constant),
    }
}

pub fn walk_target<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Target { block, args }: &Target<'heap>,
) -> T::Result<()> {
    visitor.visit_basic_block_id(location, *block);
    for operand in args {
        visitor.visit_operand(location, operand)?;
    }

    Ok!()
}

pub fn walk_statement<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Statement { span, kind }: &Statement<'heap>,
) -> T::Result<()> {
    visitor.visit_span(*span)?;

    match kind {
        StatementKind::Assign(assign) => visitor.visit_statement_assign(location, assign),
        StatementKind::Nop => visitor.visit_statement_nop(location),
        StatementKind::StorageLive(local) => visitor.visit_statement_storage_live(location, *local),
        StatementKind::StorageDead(local) => visitor.visit_statement_storage_dead(location, *local),
    }
}

pub fn walk_statement_assign<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Assign { lhs, rhs }: &Assign<'heap>,
) -> T::Result<()> {
    visitor.visit_place(location, lhs)?;
    visitor.visit_rvalue(location, rhs)?;

    Ok!()
}

pub fn walk_statement_storage_live<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    local: Local,
) -> T::Result<()> {
    visitor.visit_local(location, local)?;

    Ok!()
}

pub fn walk_statement_storage_dead<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    local: Local,
) -> T::Result<()> {
    visitor.visit_local(location, local)?;

    Ok!()
}

pub fn walk_rvalue<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    rvalue: &RValue<'heap>,
) -> T::Result<()> {
    match rvalue {
        RValue::Load(operand) => visitor.visit_operand(location, operand),
        RValue::Binary(binary) => visitor.visit_rvalue_binary(location, binary),
        RValue::Unary(unary) => visitor.visit_rvalue_unary(location, unary),
        RValue::Aggregate(aggregate) => visitor.visit_rvalue_aggregate(location, aggregate),
        RValue::Input(input) => visitor.visit_rvalue_input(location, input),
        RValue::Apply(apply) => visitor.visit_rvalue_apply(location, apply),
    }
}

pub fn walk_rvalue_binary<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Binary { op: _, left, right }: &Binary<'heap>,
) -> T::Result<()> {
    visitor.visit_operand(location, left)?;
    visitor.visit_operand(location, right)?;

    Ok!()
}

pub fn walk_rvalue_unary<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Unary { op: _, operand }: &Unary<'heap>,
) -> T::Result<()> {
    visitor.visit_operand(location, operand)?;

    Ok!()
}

pub fn walk_rvalue_aggregate<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Aggregate { kind, operands }: &Aggregate<'heap>,
) -> T::Result<()> {
    match kind {
        AggregateKind::Struct { fields } => {
            for field in fields {
                visitor.visit_symbol(location, *field)?;
            }
        }
        AggregateKind::Opaque(name) => {
            visitor.visit_symbol(location, *name)?;
        }
        AggregateKind::Tuple
        | AggregateKind::List
        | AggregateKind::Dict
        | AggregateKind::Closure => {}
    }

    for operand in operands.iter() {
        visitor.visit_operand(location, operand)?;
    }

    Ok!()
}

pub fn walk_rvalue_input<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Input { op: _, name }: &Input<'heap>,
) -> T::Result<()> {
    visitor.visit_symbol(location, *name)?;
    Ok!()
}

pub fn walk_rvalue_apply<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Apply {
        function,
        arguments,
    }: &Apply<'heap>,
) -> T::Result<()> {
    visitor.visit_operand(location, function)?;

    for argument in arguments.iter() {
        visitor.visit_operand(location, argument)?;
    }

    Ok!()
}

pub fn walk_terminator<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Terminator { span, kind }: &Terminator<'heap>,
) -> T::Result<()> {
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

pub fn walk_terminator_goto<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Goto { target }: &Goto<'heap>,
) -> T::Result<()> {
    visitor.visit_target(location, target)?;
    Ok!()
}

pub fn walk_terminator_branch<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Branch { test, then, r#else }: &Branch<'heap>,
) -> T::Result<()> {
    visitor.visit_operand(location, test)?;

    visitor.visit_target(location, then)?;
    visitor.visit_target(location, r#else)?;

    Ok!()
}

pub fn walk_terminator_return<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Return { value }: &Return<'heap>,
) -> T::Result<()> {
    visitor.visit_operand(location, value)?;
    Ok!()
}

pub fn walk_terminator_graph_read<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    GraphRead {
        head,
        body,
        tail,
        target,
    }: &GraphRead<'heap>,
) -> T::Result<()> {
    let mut location = GraphReadLocation {
        base: location,
        graph_read_index: 0,
    };

    visitor.visit_graph_read_head(location, head)?;
    location.graph_read_index += 1;

    for body in body {
        visitor.visit_graph_read_body(location, body)?;
        location.graph_read_index += 1;
    }

    visitor.visit_graph_read_tail(location, *tail)?;
    visitor.visit_basic_block_id(location.base, *target)?;

    Ok!()
}

pub fn walk_graph_read_head<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: GraphReadLocation,
    head: &GraphReadHead<'heap>,
) -> T::Result<()> {
    match head {
        GraphReadHead::Entity { axis } => visitor.visit_operand(location.base, axis),
    }
}

pub fn walk_graph_read_body<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: GraphReadLocation,
    body: &GraphReadBody,
) -> T::Result<()> {
    match body {
        GraphReadBody::Filter(func, env) => {
            visitor.visit_def_id(location.base, *func)?;
            visitor.visit_local(location.base, *env)
        }
    }
}

pub fn walk_graph_read_tail<'heap, T: VisitorMut<'heap> + ?Sized>(
    _visitor: &mut T,
    _location: GraphReadLocation,
    tail: GraphReadTail,
) -> T::Result<()> {
    match tail {
        GraphReadTail::Collect => Ok!(),
    }
}
