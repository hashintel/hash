The Image block allows JPG, GIF, and PNG images to be displayed with an optional caption and adjustable width. Images can be uploaded directly or provided via URL.

The image's display width can be changed by dragging handles which appear on hover at the sides of the image. The caption below the image can also be edited directly.

## Programmatic Usage

On initialization, the embedding application may provide the following properties ([view the Image Block entity type](https://blockprotocol.org/@hash/types/entity-type/image-block/v/2) to see these in context):

- [`Caption`](https://blockprotocol.org/@blockprotocol/types/property-type/caption/)
- [`Width in Pixels`](https://blockprotocol.org/@blockprotocol/types/property-type/width-in-pixels/).

The Image URL is provided by linking to an entity of the [`Remote File` entity type](https://blockprotocol.org/@blockprotocol/types/entity-type/remote-file/)

This should be linked to by a link entity of entity type [`Displays Media File`](https://blockprotocol.org/@hash/types/entity-type/displays-media-file/v/1)

If no image link is provided, the block displays an interface for entering an image URL or uploading an image file.

Once the user has provided a URL or file, the block uses the Graph Module `uploadFile` method to store the image in the embedding application as a separate entity to the block's entity. The block then uses the Graph Module `createEntity` and `updateEntity` methods to create a link between the block's entity and the image file entity. If an existing link to an image file entity is found, the block deletes it before creating the new one. The block then uses the file URL returned from the embedding application to render the image.
