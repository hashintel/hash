let potato = {
    "http://somepropertytype/anObject": {
        "http://anArray": ["anotherString", 23, { "number": 12}],
        "http://foo": "potato2"
    }
}

potato -> object
object -> anObject
anObject -> anArray
anObject -> aString

anArray -> array
array -> "anotherString",
"anotherString" -> 23
23 -> object // linked list?
object -> number
number -> 12
aString -> potato


get Entity potato
get entities with "anObject"
get entities with "anArray"
get values of "anObject"s?
get entities with "number"
get values with "number"


"potato.anObject.anArray[0]" | "anotherString"
"potato.anObject.anArray[1]" | 23
"potato.anObject.anArray[2]number" | 12
"potato.anObject.anArray['0']"
[39855, 3223322, 232312, -1] 

id    | property_name | version
39855 | "potato"      | v0.2


id | source_entity_id | json_path                      | string_value    | number_value             | property_types
--------------------------------------------------------------------------------------------------------------------------
1  | potato           | "$.anObject"                   | "anotherString" | 
3  | potato           | "$.anObject.anArray[0]"        |                 | 23                       | [39855, 3223322, 232312]
4  | potato           | "$.anObject.anArray[1]"        |                 | 
5  | potato           | "$.anObject.anArray[1].number" |                 | 23
6  | potato           |


-- JSONB Table ---

id | source_entity_id | value (JSONB)| property_types
-----------------------------------------------------------------------------------------
3  | potato           |     bytes    | ["anObject", "anArray", "number", "foo"]

Advantages:
- easier to implement db schema
- easier to implement queries
- easier to implement db client (we don't have to construct the JSON object client-side)

Risks:
Referential integrity
JSONB being shit


--- Properties Table ---

id | source_entity_id | source_property_id | property_type | index | string_value    | number_value
--------------------------------------------------------------------------------------------------
0  | potato           |                    | anObject      |       |                 | 
1  | potato           | 0                  | anArray       | 0     | "anotherString" | 
2  | potato           | 0                  | anArray       | 1     |                 | 23
3  | potato           | 0                  | anArray       | 2     |                 | 
4  | potato           | 3                  | number        |       |                 | 12
5  | potato           | 0                  | foo           |       | "potato2"       | 


Advantages:
- more advanced queries on values
- partial updates: updating values of a single property without having to update the entire object
- referential integrity

Risks:
Giant index
Complicated Versioning logic for updates
harder to implement db schema
harder to 


----- Open Questions -----
Linked list, or index column, or fractional index that gets rewritten client side?


let potato = {
    "http://somepropertytype/anObject": {
        "http://anArray": ["anotherString", 23, { "http://number": 12}],
        "http://foo": "potato2"
    }
}
