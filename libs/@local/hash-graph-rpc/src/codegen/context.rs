use std::collections::HashMap;

use bytes::Bytes;
use specta::{NamedDataType, NamedDataTypeExt, SpectaID, TypeMap};

pub struct OrderedVec<T> {
    pub inner: Vec<T>,
}

impl<T> OrderedVec<T>
where
    T: PartialEq,
{
    fn new() -> Self {
        Self { inner: vec![] }
    }

    pub(crate) fn push(&mut self, item: T) -> usize {
        if let Some(position) = self.inner.iter().position(|i| i == &item) {
            return position;
        }

        self.inner.push(item);
        self.inner.len() - 1
    }

    fn order_before(&mut self, position: usize, before: T) -> usize {
        let before_position = self.push(before);

        if position >= before_position {
            let item = self.inner.remove(position);
            self.inner.insert(before_position, item);

            return before_position;
        }

        position
    }

    pub fn needs(&mut self, item: T, requirements: Vec<T>) {
        let mut position = self.push(item);

        for requirement in requirements {
            position = self.order_before(position, requirement);
        }
    }

    pub fn iter(&self) -> std::slice::Iter<T> {
        self.inner.iter()
    }

    pub fn contains(&self, item: &T) -> bool {
        self.inner.contains(item)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Statement(pub(crate) SpectaID);

pub struct GlobalContext {
    pub ordering: OrderedVec<Statement>,
    pub queue: Vec<NamedDataType>,
    pub statements: HashMap<Statement, Bytes>,
    pub types: TypeMap,
}

impl GlobalContext {
    pub(crate) fn new(types: TypeMap) -> Self {
        let mut ordering = OrderedVec::new();
        let mut queue = vec![];

        queue.extend(types.iter().map(|(_, ast)| ast.clone()));

        for (id, _) in types.iter() {
            ordering.push(Statement(id));
        }

        Self {
            ordering,
            queue,
            statements: HashMap::new(),
            types,
        }
    }

    pub(crate) fn scoped(&mut self, id: Statement) -> ScopedContext {
        ScopedContext {
            parents: vec![],
            current: id,

            global: self,
        }
    }
}

pub struct ScopedContext<'a> {
    pub parents: Vec<Statement>,
    pub current: Statement,

    pub global: &'a mut GlobalContext,
}

pub(crate) enum HoistAction {
    Hoisted,
    DirectRecursion,
    ParentRecursion,
}

impl ScopedContext<'_> {
    pub fn hoist(&mut self, id: Statement, ast: NamedDataType) -> HoistAction {
        if id == self.current {
            return HoistAction::DirectRecursion;
        }

        if self.parents.contains(&id) {
            return HoistAction::ParentRecursion;
        }

        self.global.ordering.needs(self.current, vec![id]);

        if !self.global.queue.contains(&ast) || !self.global.statements.contains_key(&id) {
            self.global.queue.push(ast);
        }

        HoistAction::Hoisted
    }
}
