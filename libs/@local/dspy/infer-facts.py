import dspy
import json
import random
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
    # subjectEntity: EntitySummary = dspy.InputField(description="The entity that must be the subject of the facts", format=dict)
    subjectEntity: str = dspy.InputField(desc="The entity that must be the subject of the facts")
    # potentialObjectEntities: List[EntitySummary] = dspy.InputField(description="The entities that could be the object of the facts", required=False, format=list)

    facts = dspy.OutputField(desc=f"a list of Fact objects, each of which should confirm to the schema {Fact.model_json_schema()}", format=list)
  
# Load the language model to use
gpt4o = dspy.OpenAI(model='gpt-4o', max_tokens=4_000)
dspy.settings.configure(lm=gpt4o)

with open("input.json") as f:
    input_data = json.load(f)

def cache_busting_config():
    return dict(temperature=0.7 + 0.0001 * random.uniform(-1, 1))

predictor = dspy.Predict(FactInferrer)

pred = predictor(**input_data)

print("Simple predictor answer:")
print(f"{pred.facts}")

cot = dspy.ChainOfThought(FactInferrer, **cache_busting_config())

pred = cot(**input_data)

print("Chain of Thought answer:")
print(f"{pred.facts}")