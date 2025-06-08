use super::{ModuleId, ModuleRegistry, item::IntrinsicItem, locals::TypeDef};
use crate::{
    collection::SmallVec,
    heap::Heap,
    intern::Provisioned,
    module::{
        PartialModule,
        item::{ConstructorItem, Item, ItemKind},
    },
    symbol::Symbol,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
enum StdLibItemKind<'heap> {
    Newtype(TypeDef<'heap>),
    Type(TypeDef<'heap>),
    Intrinsic(IntrinsicItem<'heap>),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct StdLibModuleItem<'heap> {
    name: Symbol<'heap>,
    kind: StdLibItemKind<'heap>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct StdLibModuleContents<'heap>(SmallVec<StdLibModuleItem<'heap>>);

impl<'heap> StdLibModuleContents<'heap> {
    fn find(&self, name: Symbol<'heap>) -> Option<StdLibModuleItem<'heap>> {
        self.0.iter().find(|item| item.name == name).copied()
    }
}

struct StandardLibraryContext<'env, 'heap> {
    heap: &'heap Heap,
    registry: &'env ModuleRegistry<'heap>,
    modules: SmallVec<(Symbol<'heap>, StdLibModuleContents<'heap>)>,
}

impl<'env, 'heap> StandardLibraryContext<'env, 'heap> {
    fn new(heap: &'heap Heap, registry: &'env ModuleRegistry<'heap>) -> Self {
        Self {
            heap,
            registry,
            modules: SmallVec::new(),
        }
    }

    fn eval<M>(&mut self) -> &StdLibModuleContents<'heap>
    where
        M: StandardLibraryModule<'heap>,
    {
        let module_path = M::path(self.heap);

        // check if the item already exists, otherwise create it (and cache it)
        if let Some((_, contents)) = self.modules.iter().find(|(path, _)| *path == module_path) {
            contents
        } else {
            let contents = M::create(self);
            self.modules.push((module_path, contents));

            &self.modules.last().unwrap_or_else(|| unreachable!()).1
        }
    }

    fn create<M>(&mut self, parent: Provisioned<ModuleId>) -> ModuleId
    where
        M: StandardLibraryModule<'heap>,
    {
        self.registry.intern_module(|id| {
            let items = &self.eval::<M>().0;

            let mut output = SmallVec::with_capacity(items.capacity() + M::Children::LENGTH);

            for &StdLibModuleItem { name, kind } in items {
                let items = match kind {
                    StdLibItemKind::Intrinsic(intrinsic) => {
                        [Some(ItemKind::Intrinsic(intrinsic)), None]
                    }
                    StdLibItemKind::Type(def) => [Some(ItemKind::Type(def)), None],
                    StdLibItemKind::Newtype(def) => [
                        Some(ItemKind::Constructor(ConstructorItem { r#type: def })),
                        Some(ItemKind::Type(def)),
                    ],
                };

                for kind in items.into_iter().flatten() {
                    output.push(Item {
                        module: id.value(),
                        name,
                        kind,
                    });
                }
            }

            // create all the child modules
            let children_names = M::Children::names(self.heap);
            let children_modules = M::Children::modules(self, id);

            for (name, module) in children_names.into_iter().zip(children_modules) {
                output.push(Item {
                    module: id.value(),
                    name,
                    kind: ItemKind::Module(module),
                });
            }

            PartialModule {
                name: M::name(&self.heap),
                parent: parent.value(),
                items: self.registry.intern_items(&output),
            }
        })
    }
}

trait StdLibModuleChildren<'heap> {
    const LENGTH: usize;

    fn names(heap: &'heap Heap) -> impl IntoIterator<Item = Symbol<'heap>>;

    fn modules(
        context: &mut StandardLibraryContext<'_, 'heap>,
        parent: Provisioned<ModuleId>,
    ) -> impl IntoIterator<Item = ModuleId>;
}

impl<'heap> StdLibModuleChildren<'heap> for () {
    const LENGTH: usize = 0;

    fn names(_: &'heap Heap) -> impl IntoIterator<Item = Symbol<'heap>> {
        core::iter::empty()
    }

    fn modules(
        _: &mut StandardLibraryContext<'_, 'heap>,
        _: Provisioned<ModuleId>,
    ) -> impl IntoIterator<Item = ModuleId> {
        core::iter::empty()
    }
}

impl<'heap, M1> StdLibModuleChildren<'heap> for (M1,)
where
    M1: StandardLibraryModule<'heap>,
{
    const LENGTH: usize = 1;

    fn names(heap: &'heap Heap) -> impl IntoIterator<Item = Symbol<'heap>> {
        let M1 = M1::name(heap);

        [M1]
    }

    fn modules(
        context: &mut StandardLibraryContext<'_, 'heap>,
        parent: Provisioned<ModuleId>,
    ) -> impl IntoIterator<Item = ModuleId> {
        let M1 = context.create::<M1>(parent);

        [M1]
    }
}

trait StandardLibraryModule<'heap> {
    type Children: StdLibModuleChildren<'heap>;

    fn name(heap: &'heap Heap) -> Symbol<'heap>;
    fn path(heap: &'heap Heap) -> Symbol<'heap>;

    fn create(context: &mut StandardLibraryContext<'_, 'heap>) -> StdLibModuleContents<'heap>;
}
