from langchain import PromptTemplate
from langchain.embeddings.openai import OpenAIEmbeddings
from langchain.chat_models import ChatOpenAI
from langchain.vectorstores import Qdrant
from langchain.embeddings import OpenAIEmbeddings
from langchain.chains import RetrievalQA

from qdrant_client import QdrantClient

from .io_types import *


def main(agent_input: Input) -> Output:
    """
    Main function of the agent
    :param agent_input: Input defined in `io_types.ts`
    :return: Output defined in `io_types.ts`
    """

    qdrant_client = QdrantClient(host="localhost", port=6333)

    embeddings = OpenAIEmbeddings(model="text-embedding-ada-002")
    qdrant = Qdrant(
        client=qdrant_client,
        collection_name="entities",
        content_payload_key="contents",
        embedding_function=embeddings.embed_query,
    )
    retriever = qdrant.as_retriever()
    prompt_template = """Use the following pieces of context to answer/fulfil the inquiry at the end. If you don't know the answer, just say that you don't know, don't try to make up an answer. Do not reply with raw IDs that would be meaningless to users. Treat the context entities as information you know, and not information the user can/should see. Answer precisely and concisely.

Context: ---
{context}
---

Inquiry: {question}
Helpful Answer:"""
    PROMPT = PromptTemplate(
        template=prompt_template, input_variables=["context", "question"]
    )
    llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0.15)
    retrievalQA = RetrievalQA.from_llm(llm=llm, retriever=retriever, prompt=PROMPT)
    result = retrievalQA.run(agent_input.query)
    return Output(answer=result)


if __name__ == "HASH":
    """This is used when running the agent from the server or the agent orchestrator"""

    # `IN` and `OUT` are defined by the agent orchestrator
    global IN, OUT
    OUT = main(IN)

if __name__ == "__main__":
    """This is used when running the agent from the command line"""
    from ... import setup
    from logging import getLogger

    setup()

    output = main(Input(query="Who is bob's friend?"))
    print(f"output: {output.answer}")
