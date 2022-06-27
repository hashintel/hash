import json
from hypothesis import given

from hypothesis_jsonschema import from_schema

data_type_schema = {
  "$id": "https://blockprotocol.org/type-system/0.2/schema/meta/data-type",
  "description": "Specifies the structure of a Data Type",
  "type": "object",
  "properties": {
    "kind": {
      "const": "dataType"
    },
    "$id": { "type": "string", "format": "uri" },
    "name": { "type": "string" },
    "description": { "type": "string" },
    "type": { "type": "string" }
  },
  "required": ["kind", "$id", "name", "type"]
}


property_type_schema = {
  "$id": "https://blockprotocol.org/type-system/0.2/schema/meta/property-type",
  "description": "Specifies the structure of a Property Type",
  "type": "object",
  "properties": {
    "kind": {
      "const": "propertyType"
    },
    "$id": {
      "type": "string",
      "format": "uri"
    },
    "name": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "oneOf": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/propertyValues"
      }
    }
  },
  "required": ["kind", "$id", "name", "oneOf"],
  "$defs": {
    "propertyValues": {
      "$comment": "The definition of potential property values, made up of a `oneOf` keyword which has a list of options of either references to Data Types, or objects made up of more Property Types",
      "oneOf": [
        {
          "$ref": "#/$defs/propertyTypeObject"
        },
        {
          "$ref": "#/$defs/dataTypeReference"
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "const": "array"
            },
            "items": {
              "type": "object",
              "properties": {
                "oneOf": {
                  "type": "array",
                  "items": {
                    "$ref": "#/$defs/propertyValues"
                  },
                  "minItems": 1
                }
              },
              "additionalProperties": False
            },
            "minItems": {
              "type": "integer",
              "minimum": 0
            },
            "maxItems": {
              "type": "integer",
              "minimum": 0
            }
          },
          "required": ["type", "items"]
        }
      ]
    },
    "propertyTypeObject": {
      "type": "object",
      "properties": {
        "type": {
          "const": "object"
        },
        "properties": {
          "type": "object",
          "propertyNames": {
            "$comment": "Property names must be a valid URI to a Property Type",
            "type": "string",
            "format": "uri"
          },
          "patternProperties": {
            ".*": {
              "oneOf": [
                {
                  "$ref": "#/$defs/propertyTypeReference"
                },
                {
                  "type": "object",
                  "properties": {
                    "type": {
                      "const": "array"
                    },
                    "items": {
                      "$ref": "#/$defs/propertyTypeReference"
                    },
                    "minItems": {
                      "type": "integer",
                      "minimum": 0
                    },
                    "maxItems": {
                      "type": "integer",
                      "minimum": 0
                    }
                  },
                  "required": ["type", "items"],
                  "additionalProperties": False
                }
              ]
            }
          },
          "minimumProperties": 1
        },
        "required": {
          "type": "array",
          "items": { 
            "type": "string",
            "format": "uri"
          }
        }
      },
      "additionalProperties": False
    },
    "propertyTypeReference": {
      "type": "object",
      "properties": {
        "$ref": {
          "$comment": "Property Object values must be defined through references to the same valid URI to a Property Type",
          "type": "string",
          "format": "uri"
        }
      },
      "additionalProperties": False,
      "required": ["$ref"]
    },
    "dataTypeReference": {
      "type": "object",
      "properties": {
        "$ref": {
          "type": "string",
          "format": "uri"
        }
      },
      "additionalProperties": False,
      "required": ["$ref"]
    }
  }
}


entity_type_schema = {
  "$id": "https://blockprotocol.org/type-system/0.2/schema/meta/entity-type",
  "description": "Specifies the structure of an Entity Type",
  "type": "object",
  "properties": {
    "kind": {
      "const": "entityType"
    },
    "$id": {
      "type": "string",
      "format": "uri"
    },
    "name": { "type": "string" },
    "description": { "type": "string" },
    "properties": { "$ref": "#/$defs/propertyTypeObject" },
    "required": {
      "type": "array",
      "items": { 
        "type": "string",
        "format": "uri"
      }
    },
    "requiredLinks": {
      "$comment": "A list of link-types which are required. This is a separate field to 'required' to avoid breaking standard JSON schema validation",
      "type": "array",
      "items": { "type": "string" }
    },
    "links": {
      "type": "object",
      "propertyNames": {
        "$comment": "Property names must be a valid URI to a link-type",
        "type": "string",
        "format": "uri"
      },
      "patternProperties": {
        ".*": {
          "type": "object",
          "oneOf": [
            {
              "properties": {
                "ordered": { "type": "boolean", "default": False },
                "type": { "const": "array" }
              },
              "required": ["ordered", "type"]
            },
            {}
          ],
          "additionalProperties": False
        }
      }
    }
  },
  "additionalProperties": False,
  "required": ["kind", "$id", "name", "properties"],
  "$defs": {
    "propertyTypeObject": {
      "type": "object",
      "properties": {
        "type": {
          "const": "object"
        },
        "properties": {
          "type": "object",
          "propertyNames": {
            "$comment": "Property names must be a valid URI to a Property Type",
            "type": "string",
            "format": "uri"
          },
          "patternProperties": {
            ".*": {
              "oneOf": [
                {
                  "$ref": "#/$defs/propertyTypeReference"
                },
                {
                  "type": "object",
                  "properties": {
                    "type": {
                      "const": "array"
                    },
                    "items": {
                      "$ref": "#/$defs/propertyTypeReference"
                    },
                    "minItems": {
                      "type": "integer",
                      "minimum": 0
                    },
                    "maxItems": {
                      "type": "integer",
                      "minimum": 0
                    }
                  },
                  "required": [
                    "type",
                    "items"
                  ],
                  "additionalProperties": False
                }
              ]
            }
          }
        },
        "required": {
          "type": "array",
          "items": {
            "type": "string",
            "format": "uri"
          }
        }
      },
      "required": [
        "type",
        "properties"
      ],
      "additionalProperties": False
    },
    "propertyTypeReference": {
      "type": "object",
      "properties": {
        "$ref": {
          "$comment": "Property Object values must be defined through references to the same valid URI to a Property Type",
          "type": "string",
          "format": "uri"
        }
      },
      "required": ["$ref"],
      "additionalProperties": False
    }
  }
}

@given(from_schema(entity_type_schema))
def print_property_type(value):
    print(json.dumps(value, indent=2))


if __name__ == "__main__":
    print_property_type()