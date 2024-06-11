import dspy
import pydantic
from typing import List, Optional

# Define the types we will need to refer to in the signature's input and output fields
class Fact(pydantic.BaseModel):
    text: str = pydantic.Field(description="""
      The text containing the fact, which:
      - must follow a consistent sentence structure, with a single subject, a single predicate and a single object
      - must have the subject_entity as the singular subject of the fact, so must follow the format <subject_entity> <predicate> <object>"
      - must be concise statements that are true based on the information provided in the text
      - must be standalone, and not depend on any contextual information to make sense
      - must not contain any pronouns, and refer to all entities by their provided "name"
      - must not be lists or contain multiple pieces of information, each piece of information must be expressed as a standalone fact
      - must not contain conjunctions or compound sentences, and therefore must not contain "and", "or", "but" or a comma (",")
      - must not include prepositional phrases, these must be provided separately in the "prepositionalPhrases" argument
      - must include full and complete units when specifying numeric data as the object of the fact
          """)
    prepositionalPhrases: List[str] = pydantic.Field(description="""
      A list of prepositional phrases that provide additional context to the predicate in the fact. Predicate phrases:
      - must not refer to other entities
      - must not provide additional information about the subject or object themselves, only focus on the predicate
      
      Examples of prepositional phrases for the example fact "Company X acquired Company Y":
      - "on January 1, 2022"
      - "for $8.5 billion"
      - "with a combination of cash and stock"
                              """)
    objectEntityLocalId: Optional[str] = pydantic.Field(description="The localId of the entity that is the object if the fact, if any. Facts don't need to have entities as their object", default = None)

fact_array_schema = {
    "type": "array",
    "items": Fact.model_json_schema()
}

class ExistingEntity(pydantic.BaseModel):
    localId: str = pydantic.Field(description="The localId of the entity")
    name: str = pydantic.Field(description="The name of the entity")

# Define the DSPy Signature, which represents the input -> output expectations of the program
class FactInferrerSignature(dspy.Signature):
    """Infer facts about named entities from a piece of context, with a JSON-formatted response."""
    
    context: str = dspy.InputField()
    subject_entity: str = dspy.InputField(desc="The entity that must be the subject of the facts")
    # @todo support referring to existing entities as the object of a fact
    # potentialObjectEntities: List[ExistingEntity] = dspy.InputField(description="The entities that could be the object of the facts", required=False, format=list)

    facts: List[Fact] = dspy.OutputField(desc=f"a list of facts, each conforming to the schema {Fact.model_json_schema()}.", format=list)
  
# Define the DSPy Program, a wrapper which calls other modules (in this case only one) to perform a task
class FactInferrerProgram(dspy.Module):
    def __init__(self):
        super().__init__()
        # Use the TypedPredictor module with the FactInferrerSignature when the program is run
        # TypedChainOfThought has issues with outputting valid JSON – see https://github.com/stanfordnlp/dspy/issues/1125
        self.prog = dspy.TypedPredictor(FactInferrerSignature)
    
    def forward(self, **args):
        result = self.prog(**args)
        return result
