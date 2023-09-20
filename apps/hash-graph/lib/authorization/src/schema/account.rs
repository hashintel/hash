use graph_types::account::AccountId;

use crate::zanzibar::Resource;

impl Resource for AccountId {
    type Id = Self;

    fn namespace() -> &'static str {
        "graph/account"
    }

    fn id(&self) -> &Self::Id {
        self
    }
}
