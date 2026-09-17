use core::{fmt, iter::FusedIterator, marker::Destruct};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[repr(u32)]
pub enum CommandIntent {
    BootstrapTracing = 1 << 0,
    BootstrapRayon = 1 << 1,
}

impl CommandIntent {
    pub const ALL: [Self; Self::COUNT] = core::array::from_fn(const |index| {
        // SAFETY: `Self` is `repr(u32)`, CTFE rejects invalid discriminants at compile time.
        unsafe { core::mem::transmute::<u32, Self>(1 << index) }
    });
    pub const COUNT: usize = core::mem::variant_count::<Self>();
}

const _: () = {
    // forces CTFE evaluation
    let _ = CommandIntent::ALL;
};

#[derive(Copy, Clone, PartialEq, Eq, Hash, Default)]
pub struct CommandIntentSet(u32);

impl CommandIntentSet {
    pub const ALL: Self = Self((1 << CommandIntent::COUNT) - 1);
    pub const EMPTY: Self = Self(0);

    #[inline]
    pub const fn is_empty(self) -> bool {
        self.0 == 0
    }

    #[inline]
    pub const fn len(self) -> usize {
        self.0.count_ones() as usize
    }

    #[inline]
    pub const fn contains(self, intent: CommandIntent) -> bool {
        self.0 & (intent as u32) != 0
    }

    #[inline]
    pub const fn insert(&mut self, intent: CommandIntent) -> bool {
        let inserted = !self.contains(intent);
        self.0 |= intent as u32;
        inserted
    }

    #[inline]
    pub const fn remove(&mut self, intent: CommandIntent) -> bool {
        let removed = self.contains(intent);
        self.0 &= !(intent as u32);
        removed
    }

    #[inline]
    pub const fn toggle(&mut self, intent: CommandIntent) -> bool {
        self.0 ^= intent as u32;
        self.contains(intent)
    }

    #[inline]
    pub const fn iter(self) -> CommandIntentIter {
        CommandIntentIter(self.0)
    }
}

impl fmt::Debug for CommandIntentSet {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_set().entries(self.iter()).finish()
    }
}

const impl From<CommandIntent> for CommandIntentSet {
    fn from(intent: CommandIntent) -> Self {
        Self(intent as u32)
    }
}

const impl<T> From<T> for CommandIntentSet
where
    T: [const] AsRef<[CommandIntent]> + [const] Destruct,
{
    fn from(value: T) -> Self {
        let mut this = Self::EMPTY;

        let entries = value.as_ref();

        let mut index = 0;
        while index < entries.len() {
            this.insert(entries[index]);
            index += 1;
        }

        this
    }
}

const impl IntoIterator for CommandIntentSet {
    type IntoIter = CommandIntentIter;
    type Item = CommandIntent;

    fn into_iter(self) -> CommandIntentIter {
        self.iter()
    }
}

const impl IntoIterator for &CommandIntentSet {
    type IntoIter = CommandIntentIter;
    type Item = CommandIntent;

    fn into_iter(self) -> CommandIntentIter {
        self.iter()
    }
}

#[derive(Debug)]
pub struct CommandIntentIter(u32);

impl Iterator for CommandIntentIter {
    type Item = CommandIntent;

    fn next(&mut self) -> Option<CommandIntent> {
        if self.0 == 0 {
            return None;
        }

        let index = self.0.trailing_zeros();
        self.0 &= self.0 - 1;
        Some(CommandIntent::ALL[index as usize])
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.0.count_ones() as usize;
        (remaining, Some(remaining))
    }

    fn count(self) -> usize {
        self.0.count_ones() as usize
    }

    fn last(mut self) -> Option<CommandIntent> {
        self.next_back()
    }
}

impl DoubleEndedIterator for CommandIntentIter {
    fn next_back(&mut self) -> Option<CommandIntent> {
        if self.0 == 0 {
            return None;
        }

        let index = u32::BITS - 1 - self.0.leading_zeros();
        self.0 &= !(1 << index);
        Some(CommandIntent::ALL[index as usize])
    }
}

impl ExactSizeIterator for CommandIntentIter {}
impl FusedIterator for CommandIntentIter {}
