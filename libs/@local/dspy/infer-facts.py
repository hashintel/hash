import dspy
from pydantic import BaseModel, Field

gpt4o = dspy.OpenAI(model='gpt-4o', max_tokens=80_000)
dspy.settings.configure(lm=gpt4o)

class Fact(BaseModel):
    text: str = Field(description="A single fact expressed as a [subject] [predicate] [object] sentence")
    prepositionalPhrases: str = Field(description="A list of prepositional phrases that provide additional context to the predicate in the fact")
    date: datetime.date
    confidence: float = Field(gt=0, lt=1)

class FactInferrer(dspy.Signature):
    """Infer facts about named entities from a piece of context"""
    
    context = dspy.InputField
    facts: list[Fact] = dspy.OutputField
  