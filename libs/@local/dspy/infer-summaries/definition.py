import dspy
import pydantic
from typing import List

# Define the types we will need to refer to in the signature's input and output fields
class EntitySummary(pydantic.BaseModel):
    name: str = pydantic.Field(description="The name of the entity")
    description: str = pydantic.Field(description="A one sentence description of the entity")

class EntityType(pydantic.BaseModel):
    name: str = pydantic.Field(description="The name of the entity type")
    description: str = pydantic.Field(description="A brief description of the entity type")

# Define the DSPy Signature, which represents the input -> output expectations of the program
class EntityRecognizerSignature(dspy.Signature):
    """Infer named entities from a piece of context."""
    context: str = dspy.InputField()
    entityType: List[EntityType] = dspy.InputField(description="The types of entities to identify in the context", format=list)

    entities: List[EntitySummary] = dspy.OutputField(desc=f"a list of entities {EntitySummary.model_json_schema()}", format=list)
  
# Define the DSPy Program, a wrapper which calls other modules (in this case only one) to perform a task
class EntityRecognizerProgram(dspy.Module):
    def __init__(self):
        super().__init__()
        # Use the TypedPredictor module with the EntityRecognizerSignature when the program is run
        # TypedChainOfThought has issues with outputting valid JSON – see https://github.com/stanfordnlp/dspy/issues/1125
        self.prog = dspy.TypedPredictor(EntityRecognizerSignature)
    
    def forward(self, **args):
        result = self.prog(**args)
        return result
