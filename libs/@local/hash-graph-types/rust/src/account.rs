use std::fmt;

#[cfg(feature = "postgres")]
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "wasm", derive(tsify::Tsify))]
#[cfg_attr(feature = "wasm", tsify(into_wasm_abi, from_wasm_abi))]
#[repr(transparent)]
pub struct AccountId(Uuid);

#[cfg(feature = "wasm")]
impl From<AccountId> for wasm_bindgen::JsValue {
    fn from(value: AccountId) -> Self {
        <AccountId as tsify::Tsify>::into_js(&value)
            .unwrap() // TODO: don't unwrap lol
            .into()
    }
}

impl AccountId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }
}

impl fmt::Display for AccountId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "wasm", derive(tsify::Tsify))]
#[cfg_attr(feature = "wasm", tsify(into_wasm_abi, from_wasm_abi))]
#[repr(transparent)]
pub struct AccountGroupId(Uuid);

#[cfg(feature = "wasm")]
impl From<AccountGroupId> for wasm_bindgen::JsValue {
    fn from(value: AccountGroupId) -> Self {
        <AccountGroupId as tsify::Tsify>::into_js(&value)
            .unwrap() // TODO: don't unwrap lol
            .into()
    }
}

impl AccountGroupId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }
}

impl fmt::Display for AccountGroupId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}
