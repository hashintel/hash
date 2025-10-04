use core::ops::Index;

use super::Symbol;
use crate::{collection::FastHashMap, id::Id};

#[derive(Debug)]
enum SymbolTableInner<'heap, I> {
    Dense(Vec<Symbol<'heap>>),
    Sparse(FastHashMap<I, Symbol<'heap>>),
}

#[derive(Debug)]
pub struct SymbolTable<'heap, I> {
    inner: SymbolTableInner<'heap, I>,
}

impl<'heap, I> SymbolTable<'heap, I>
where
    I: Id,
{
    #[must_use]
    pub const fn dense() -> Self {
        Self {
            inner: SymbolTableInner::Dense(Vec::new()),
        }
    }

    #[must_use]
    pub fn sparse() -> Self {
        Self {
            inner: SymbolTableInner::Sparse(FastHashMap::default()),
        }
    }

    pub fn insert(&mut self, id: I, symbol: Symbol<'heap>) {
        match &mut self.inner {
            SymbolTableInner::Dense(vec) => {
                assert_eq!(
                    id.as_usize(),
                    vec.len(),
                    "insertions into dense symbol tables must be sequential and contiguous"
                );

                vec.push(symbol);
            }
            SymbolTableInner::Sparse(map) => {
                map.insert(id, symbol);
            }
        }
    }

    pub fn get(&self, id: I) -> Option<Symbol<'heap>> {
        match &self.inner {
            SymbolTableInner::Dense(vec) => vec.get(id.as_usize()).copied(),
            SymbolTableInner::Sparse(map) => map.get(&id).copied(),
        }
    }
}

impl<'heap, I> Index<I> for SymbolTable<'heap, I>
where
    I: Id,
{
    type Output = Symbol<'heap>;

    fn index(&self, index: I) -> &Self::Output {
        match &self.inner {
            SymbolTableInner::Dense(vec) => &vec[index.as_usize()],
            SymbolTableInner::Sparse(map) => &map[&index],
        }
    }
}
