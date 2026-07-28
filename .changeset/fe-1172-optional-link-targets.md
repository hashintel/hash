---
"@blockprotocol/graph": minor
---

Make `rightEntity` / `leftEntity` on `LinkEntityAndRightEntity` / `LinkEntityAndLeftEntity` possibly `undefined`, reflecting what `getOutgoingLinkAndTargetEntities` / `getIncomingLinkAndSourceEntities` actually return when a link's `has-right-entity` / `has-left-entity` edge is not resolved into the subgraph. Previously an unsafe cast hid this, allowing runtime crashes when consumers indexed into a missing target entity array.
