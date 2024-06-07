import dspy
import json
from pydantic import BaseModel, Field
from typing import List, Optional

# Define the types we will need to refer to in the DSPy program signature's input and output fields
class Fact(BaseModel):
    text: str = Field(description="A single fact expressed as a [subject] [predicate] [object] sentence")
    prepositionalPhrases: List[str] = Field(description="A list of prepositional phrases that provide additional context to the predicate in the fact")
    objectEntityLocalId: Optional[str] = Field(description="The localId of the entity that is the object if the fact, if any. Facts don't need to have entities as their object", default = None)

class EntitySummary(BaseModel):
    localId: str = Field(description="The localId of the entity")
    name: str = Field(description="The name of the entity")

# Define the DSPy Signature, which represents the input -> output expectations of the program
class FactInferrer(dspy.Signature):
    """Infer facts about named entities from a piece of context"""
    
    context: str = dspy.InputField()
    subjectEntity: EntitySummary = dspy.InputField(description="The entity that must be the subject of the facts")
    potentialObjectEntities: List[EntitySummary] = dspy.InputField(description="The entities that could be the object of the facts")

    facts: list[Fact] = dspy.OutputField()
  
# Load the language model to use
gpt4o = dspy.OpenAI(model='gpt-4o', max_tokens=80_000)
dspy.settings.configure(lm=gpt4o)

with open("input.json") as f:
    input_data = json.load(f)
    print(input_data)