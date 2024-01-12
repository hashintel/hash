use std::collections::HashMap;

use bytes::Bytes;
use specta::{DataTypeReference, NamedDataType, SpectaID, TypeMap};

pub(crate) struct OrderedVec<T> {
    inner: Vec<T>,
}

impl<T> OrderedVec<T>
where
    T: PartialEq,
{
    const fn new() -> Self {
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

        if position > before_position {
            let item = self.inner.remove(position);
            self.inner.insert(before_position, item);

            return before_position;
        }

        position
    }

    pub(crate) fn needs(&mut self, item: T, requirements: Vec<T>) {
        let mut position = self.push(item);

        for requirement in requirements {
            position = self.order_before(position, requirement);
        }
    }

    pub(crate) fn iter(&self) -> std::slice::Iter<T> {
        self.inner.iter()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) struct StatementId(Option<SpectaID>);

impl StatementId {
    pub(crate) const fn local(id: SpectaID) -> Self {
        Self(Some(id))
    }

    pub(crate) const fn global() -> Self {
        Self(None)
    }

    pub(crate) const fn is_global(&self) -> bool {
        self.0.is_none()
    }

    pub(crate) const fn specta_id(&self) -> Option<SpectaID> {
        self.0
    }
}

pub(crate) struct GlobalContext {
    pub(crate) ordering: OrderedVec<StatementId>,
    pub(crate) queue: Vec<NamedDataType>,
    pub(crate) statements: HashMap<StatementId, Bytes>,
    pub(crate) types: TypeMap,
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

pub(crate) struct ScopedContext<'a> {
    pub(crate) parents: Vec<StatementId>,
    pub(crate) current: StatementId,

    pub(crate) global: &'a mut GlobalContext,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum HoistAction {
    Hoisted,
    DirectRecursion,
    ParentRecursion,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum ReferenceAction {
    Suspend,
    Direct,
}

impl ScopedContext<'_> {
    pub(crate) fn references(&mut self, reference: &DataTypeReference) -> ReferenceAction {
        let sid = reference.sid();
        let id = StatementId::local(sid);

        self.global.ordering.needs(self.current, vec![id]);

        if self.parents.contains(&id) || self.current == id {
            return ReferenceAction::Suspend;
        }

        ReferenceAction::Direct
    }

    pub(crate) fn hoist(&mut self, id: StatementId, ast: NamedDataType) -> HoistAction {
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
