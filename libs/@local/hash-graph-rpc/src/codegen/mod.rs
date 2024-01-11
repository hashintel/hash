use bytes::{Bytes, BytesMut};
use specta::TypeMap;

use crate::codegen::{
    context::{GlobalContext, Statement},
    statement::StatementBuilder,
};

mod context;
mod inline;
mod statement;

// TODO: this currently just panics!
pub fn render(map: TypeMap) -> Bytes {
    let mut context = GlobalContext::new(map);

    context.queue.extend(map.iter().map(|(_, ast)| ast.clone()));

    for (id, _) in map.iter() {
        context.ordering.push(Statement(id));
    }

    while let Some(ast) = context.queue.pop() {
        let id = *ast
            .ext()
            .expect("NamedDataType must be gathered by TypeMap")
            .sid();

        let statement = StatementBuilder::new(&mut context, &ast);
        let buffer = statement.process(&ast).expect("Statement must be valid");

        context.statements.insert(Statement(id), buffer);
    }

    let mut buffer = BytesMut::new();

    for id in context.ordering.iter() {
        let statement = context.statements.remove(id).expect("Statement must exist");

        buffer.extend_from_slice(&statement);
    }

    assert_eq!(context.statements.len(), 0);
    buffer.freeze()
}
