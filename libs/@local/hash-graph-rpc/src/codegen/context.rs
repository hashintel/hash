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
pub(crate) struct StatementId(Option<SpectaID>);

impl StatementId {
    pub(crate) fn local(id: SpectaID) -> Self {
        Self(Some(id))
    }

    pub(crate) fn global() -> Self {
        Self(None)
    }

    pub(crate) fn is_global(&self) -> bool {
        self.0.is_none()
    }

    pub(crate) fn specta_id(&self) -> Option<SpectaID> {
        self.0
    }
}

pub struct GlobalContext {
    pub ordering: OrderedVec<StatementId>,
    pub queue: Vec<NamedDataType>,
    pub statements: HashMap<StatementId, Bytes>,
    pub types: TypeMap,
}

impl GlobalContext {
    pub(crate) fn new(types: TypeMap) -> Self {
        let mut this = Self {
            ordering: OrderedVec::new(),
            queue: vec![],
            statements: HashMap::new(),
            types,
        };

        this.rebuild();

        this
    }

    pub(crate) fn rebuild(&mut self) {
        self.queue.clear();
        self.queue
            .extend(self.types.iter().map(|(_, ast)| ast.clone()));

        self.ordering.inner.clear();
        for (id, _) in self.types.iter() {
            self.ordering.push(StatementId::local(id));
        }
    }

    pub(crate) fn scoped(&mut self, id: StatementId) -> ScopedContext {
        ScopedContext {
            parents: vec![],
            current: id,

            global: self,
        }
    }
}

pub struct ScopedContext<'a> {
    pub parents: Vec<StatementId>,
    pub current: StatementId,

    pub global: &'a mut GlobalContext,
}

pub(crate) enum HoistAction {
    Hoisted,
    DirectRecursion,
    ParentRecursion,
}

impl ScopedContext<'_> {
    pub fn hoist(&mut self, id: StatementId, ast: NamedDataType) -> HoistAction {
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
