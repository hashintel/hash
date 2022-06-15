The Drawing block embeds [tldraw](https://github.com/tldraw/tldraw), providing a complete drawing interface for embedding applications. Pen, eraser, shape, arrow, text, and several other illustration tools allow users to create diagrams, system maps, art, or anything else they can imagine. The block also supports dark and read-only modes.

The block periodically serializes tldraw's document format and calls the Graph Service's `updateEntity` method to store it on the block's entity in the embedding application's storage.
