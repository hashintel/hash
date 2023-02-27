The Video block allows MP4 and WEBM videos to be embedded with an optional caption. The player features mute, full-screen, playback speed, picture-in-picture, and download options. Videos can be uploaded directly or provided via URL.

On initialization, the embedding application may provide an `initialCaption` and a `url` for the video. If no video URL is provided, the block displays an interface for entering a video URL or uploading a video file.

Once the user has provided a URL or file, the block uses the Graph Module `uploadFile` method to store the video in the embedding application as a separate entity to the block's entity. The block then uses the Graph Module `createLinks` method to create a link between the block's entity and the video file entity. If an existing link to a video file entity is found, the block deletes it before creating the new one. The block then uses the file URL returned from the embedding application to render the video player.

The caption below the image can also be edited directly.
