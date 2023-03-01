The Video block allows MP4 and WEBM videos to be embedded with an optional caption. The player features mute, full-screen, playback speed, picture-in-picture, and download options. Videos can be uploaded directly or provided via URL.

On initialization, the embedding application may provide an [`https://blockprotocol.org/@blockprotocol/types/property-type/caption/`](https://blockprotocol.org/@blockprotocol/types/property-type/caption/).

The Video URL is provided by linking to a `RemoteFileEntity` entity with the following properties:

- [`https://blockprotocol.org/@blockprotocol/types/property-type/file-url/`](https://blockprotocol.org/@blockprotocol/types/property-type/file-url/`)
- [`https://blockprotocol.org/@blockprotocol/types/property-type/file-name/`](https://blockprotocol.org/@blockprotocol/types/property-type/file-name/)
- [`https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/`](https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/)

This should be linked to by a link of entity type ID [`"https://blockprotocol.org/@hash/types/entity-type/displays-media-file/v/1"`](`"https://blockprotocol.org/@hash/types/entity-type/displays-media-file/v/1")

Once the user has provided a URL or file, the block uses the Graph Module `uploadFile` method to store the video in the embedding application as a separate entity to the block's entity. The block then uses the Graph Module `createEntity` and `updateEntity` method to create a link between the block's entity and the video file entity. If an existing link to an video file entity is found, the block deletes it before creating the new one. The block then uses the file URL returned from the embedding application to render the video.
