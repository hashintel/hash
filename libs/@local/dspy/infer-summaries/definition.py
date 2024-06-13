import dspy
import pydantic
from typing import List

# Define the types we will need to refer to in the signature's input and output fields
class EntitySummary(pydantic.BaseModel):
    name: str = pydantic.Field(description="The name of the entity")
    description: str = pydantic.Field(description="A brief description of the entity – one sentence max")

# This model is not used in the Signature, but represents the schema supplied in the input sets
class EntityType(pydantic.BaseModel):
    name: str = pydantic.Field(description="The name of the entity type")
    description: str = pydantic.Field(description="A brief description of the entity type")

# Define the DSPy Signature, which represents the input -> output expectations of the program
class EntityRecognizerSignature(dspy.Signature):
    """
    Infer entities from a piece of context. ALL entities must match the supplied entity_type.
    Each entity inferred must also meet the relevant_entities_description, or have a clear relationship in the context to entities that do (these must also match the supplied type)
    Ignore other entities mentioned in the context.
    """
    context: str = dspy.InputField()
    entity_type: dict = dspy.InputField(description="The type of entities of interest")
    relevant_entities_description: str = dspy.InputField(description="Additional description of which entities are of interest – i.e. a research / relevancy brief.")

    entities: List[EntitySummary] = dspy.OutputField(desc=f"a list of entities, each conforming to the schema {EntitySummary.model_json_schema()}", format=list)
  
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