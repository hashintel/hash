## Overview

The **kanban board** allows the user to capture information in cards, then organize these cards by dragging them between columns. Columns are customizable & sortable.
​
Coming soon:
​

- The ability to query and load entities into the board, in addition to or instead of manually inputted data

## Technical Information

This block uses [`@dnd-kit`](https://docs.dndkit.com/) for drag-and-drop behavior of columns & cards.

It has the properties `title`, `kanban-column-order` and `kanban-columns`.

- `title`: Title of the board
- `kanban-board-column-order`: A string array, used to track the order of the columns.
  - It should contain ID's of the existing columns.
  - Example: `["col-1", "col-2"]`
- `kanban-board-columns`: An object, used to store data of each column.

  - Keys of this object should be column ID's.
  - Values of this object should be `column` datas
  - Example:

    ```json
    {
      "col-1": {
        "id": "col-1",
        "title": "Column 1",
        "cards": [{ "id": "card-1", "content": "First card" }]
      }
    }
    ```
