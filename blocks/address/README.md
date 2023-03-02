The address block powered by the Mapbox API allows for finding and displaying information about a specific address or location.

Whenever an address is selected, the Graph Modules's `createEntity` method is called to save the address information into an `Address` entity and the address map into a `RemoteFile` entity, which are linked to the block.

The block also stores its state locally in `title` (the address display title), `description`, `addressId` and `zoomLevel` properties.
