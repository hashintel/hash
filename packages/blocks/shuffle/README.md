The Shuffle Block allows us to create a list of 'Things' and set them into a random order.

It accepts the property `items` which consists of an array of objects with an `id` (string) and a `value` (string).
If this property is not provided, the list will default to:

```
[
  { id: uuid(), value: "Item 1" },
  { id: uuid(), value: "Item 2" },
];
```
