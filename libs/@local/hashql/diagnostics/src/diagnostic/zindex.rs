use core::{cmp::Ordering, num::NonZero};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub(crate) enum ZIndex {
    Back(NonZero<u32>),
    Natural,
    Front(NonZero<u32>),
}

impl ZIndex {
    pub(crate) const fn new(order: Option<i32>) -> Self {
        Self::from(order)
    }
}

impl const From<Option<i32>> for ZIndex {
    fn from(order: Option<i32>) -> Self {
        let Some(order) = order else {
            return ZIndex::Natural;
        };

        let is_negative = order.is_negative();
        let Some(abs) = NonZero::new(order.unsigned_abs()) else {
            // 0 is the natural index
            return ZIndex::Natural;
        };

        if is_negative {
            ZIndex::Back(abs)
        } else {
            ZIndex::Front(abs)
        }
    }
}

impl PartialOrd for ZIndex {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for ZIndex {
    fn cmp(&self, other: &Self) -> Ordering {
        match (self, other) {
            (ZIndex::Back(a), ZIndex::Back(b)) => a.cmp(b),
            (ZIndex::Front(a), ZIndex::Front(b)) => a.cmp(b),
            (ZIndex::Natural, ZIndex::Natural) => Ordering::Equal,

            (ZIndex::Back(_), _) => Ordering::Less,
            (ZIndex::Front(_), ZIndex::Natural) => Ordering::Greater,
            (ZIndex::Front(_), ZIndex::Back(_)) => Ordering::Greater,
            (ZIndex::Natural, ZIndex::Back(_)) => Ordering::Greater,
            (ZIndex::Natural, ZIndex::Front(_)) => Ordering::Less,
        }
    }
}
