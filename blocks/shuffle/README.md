The Shuffle Block allows us to create a list of 'Things' and shuffle them into a random order.

## Programmatic Usage

It accepts the following property ([view the Shuffle Block entity type](https://blockprotocol.org/@hash/types/entity-type/shuffle-block/v/2) to see it in context)

- [`Shuffle Block Item`](https://blockprotocol.org/@hash/types/property-type/shuffle-block-item/)

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

When using the latter, there must be a link entity of entity type [`Has Representative Shuffle Block Item`](https://blockprotocol.org/@hash/types/entity-type/has-representative-shuffle-block-item/v/1) pointing to an entity to represent. The Graph module's `parseLabelFromEntity` will be used to render it.
