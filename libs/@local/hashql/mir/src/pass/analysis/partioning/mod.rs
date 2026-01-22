use crate::{
    body::{basic_block::BasicBlockId, location::Location, statement::Statement},
    def::DefId,
};

pub trait Backend {
    fn enter_block(&mut self, block: BasicBlockId);
    fn exit_block(&mut self, block: BasicBlockId);

    fn supports_statement(&mut self, location: Location, statement: &Statement) -> bool;
}
