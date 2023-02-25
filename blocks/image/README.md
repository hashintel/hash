The Image block allows JPG, GIF, and PNG images to be displayed with an optional caption and adjustable width. Images can be uploaded directly or provided via URL.

On initialization, the embedding application may provide an `initialCaption`, an `initialWidth`, and a `url` for the image. If no image URL is provided, the block displays an interface for entering an image URL or uploading an image file.

Once the user has provided a URL or file, the block uses the Graph Module `uploadFile` method to store the image in the embedding application as a separate entity to the block's entity. The block then uses the Graph Module `createLinks` method to create a link between the block's entity and the image file entity. If an existing link to an image file entity is found, the block deletes it before creating the new one. The block then uses the file URL returned from the embedding application to render the image.

The image's display width can be changed by dragging handles which appear on hover at the sides of the image. The caption below the image can also be edited directly.
