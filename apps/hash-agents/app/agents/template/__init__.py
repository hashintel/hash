from typing import Coroutine, Self

from beartype import beartype
from langchain import LLMMathChain
from langchain.chat_models import ChatOpenAI

from app.agents.abc import Agent

from .io import Input, Output


class Math(Agent[Input, Output]):
    Input = Input
    Output = Output

    def __init__(self):
        self.llm = ChatOpenAI(model_name='gpt-3.5-turbo', temperature=0)
        self.math = LLMMathChain(llm=self.llm, verbose=True)

    @beartype
    async def execute(self, input: Input) -> Coroutine[None, None, Output]:
        result = await self.math.arun(input.expression)

        return Output(result=float(result[8:]))
