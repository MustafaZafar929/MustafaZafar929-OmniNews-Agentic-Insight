import os
import requests
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage

# Load env variables manually if needed
api_key = os.getenv("OPENROUTER_API_KEY")
base_url = "https://openrouter.ai/api/v1"

print(f"Testing with API Key: {api_key[:5]}...")

llm = ChatOpenAI(
    model="anthropic/claude-3.7-sonnet:thinking",
    openai_api_key=api_key,
    openai_api_base=base_url,
    temperature=1.0 # Standard for thinking models
)

try:
    print("Sending test prompt...")
    response = llm.invoke([SystemMessage(content="Hello, respond with 'SUCCESS'")])
    print(f"Response: {response.content}")
except Exception as e:
    print(f"Test Failed: {e}")
