import os
import sys
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage

# Capture output to a file inside the container for easy reading
log_file = "/tmp/llm_debug.txt"

def debug_log(msg):
    with open(log_file, "a") as f:
        f.write(f"{msg}\n")
    print(msg)

debug_log("Starting LLM Diagnostic...")

api_key = os.getenv("OPENROUTER_API_KEY")
base_url = "https://openrouter.ai/api/v1"

if not api_key:
    debug_log("ERROR: OPENROUTER_API_KEY not found in env!")
    sys.exit(1)

# Test 1: Standard model (No Thinking suffix)
debug_log("\n--- TEST 1: Standard claude-3.7-sonnet ---")
llm1 = ChatOpenAI(
    model="anthropic/claude-3.7-sonnet",
    openai_api_key=api_key,
    openai_api_base=base_url,
    temperature=0.7
)

try:
    res1 = llm1.invoke([SystemMessage(content="Respond with SUCCESS-1")])
    debug_log(f"Test 1 Result: {res1.content}")
except Exception as e:
    debug_log(f"Test 1 FAILED: {type(e).__name__}: {str(e)}")

# Test 2: Thinking model with Temp 1.0
debug_log("\n--- TEST 2: Thinking model temp=1.0 ---")
llm2 = ChatOpenAI(
    model="anthropic/claude-3.7-sonnet:thinking",
    openai_api_key=api_key,
    openai_api_base=base_url,
    temperature=1.0
)

try:
    res2 = llm2.invoke([SystemMessage(content="Respond with SUCCESS-2")])
    debug_log(f"Test 2 Result: {res2.content}")
except Exception as e:
    debug_log(f"Test 2 FAILED: {type(e).__name__}: {str(e)}")

debug_log("\nDiagnostic Complete.")
