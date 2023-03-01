The Shuffle Block allows us to create a list of 'Things' and set them into a random order.

It accepts the property [`https://blockprotocol.org/@hash/types/property-type/shuffle-block-item/`](https://blockprotocol.org/@hash/types/property-type/shuffle-block-item/) which consists of an array of objects, which look like one of the two options below

Option one: a textual content item

```json
{
  "https://blockprotocol.org/@hash/types/property-type/shuffle-block-item-id/": "1",
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/": "abc"
}
```

Option two: a representation of another entity

```json
{
  "https://blockprotocol.org/@hash/types/property-type/shuffle-block-item-id/": "1",
  "https://blockprotocol.org/@hash/types/property-type/shuffle-block-item-associated-link-entity-id/": "abc"
}
```

When using the latter, there must be a link of entity type [`https://blockprotocol.org/@hash/types/entity-type/has-representative-shuffle-block-item/v/1`](https://blockprotocol.org/@hash/types/entity-type/has-representative-shuffle-block-item/v/1) pointing to an entity to represent. The Graph module's `parseLabelFromEntity` will be used to render it.
