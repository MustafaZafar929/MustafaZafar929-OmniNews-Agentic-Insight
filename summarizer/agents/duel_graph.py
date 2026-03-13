import os
import json
import time
import random
import re
from typing import TypedDict
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from langgraph.graph import StateGraph, END

# --- LLM Setup ---
# Using the same model name as graph.py
GOOGLE_KEY = os.getenv("GOOGLE_AI_STUDIO_API_KEY")
llm = ChatGoogleGenerativeAI(
    model="gemini-flash-latest", 
    google_api_key=GOOGLE_KEY, 
    temperature=0.7, 
    max_output_tokens=2000,
    timeout=45 # 45s timeout per call
)

def clean_text(text: str) -> str:
    """Removes HTML tags and excess whitespace to save tokens/processing time."""
    if not text: return ""
    # Remove HTML tags
    text = re.sub(r'<[^>]*>', ' ', text)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def safe_duel_invoke(messages, label="duel", max_retries=3):
    """Exponential backoff wrapper for Gemini API with timeouts."""
    for i in range(max_retries):
        try:
            response = llm.invoke(messages)
            content = response.content
            if isinstance(content, list):
                text_parts = []
                for part in content:
                    if isinstance(part, str):
                        text_parts.append(part)
                    elif isinstance(part, dict) and "text" in part:
                        text_parts.append(part["text"])
                content = "\n".join(text_parts)
            return content
        except Exception as e:
            err_str = str(e).lower()
            if "429" in err_str or "resource_exhausted" in err_str or "deadline_exceeded" in err_str:
                wait = (2 ** (i + 1)) + random.uniform(0, 1)
                print(f"⏳ [{label}] Delay/Timeout (Attempt {i+1}/{max_retries}). Retrying in {wait:.1f}s...")
                time.sleep(wait)
            else:
                print(f"❌ [{label}] LLM Error: {e}")
                raise e
    raise Exception(f"[{label}] Failed after {max_retries} attempts")

class DuelState(TypedDict):
    cluster_id: str
    headline: str
    context: str
    atlanticist_report: str
    global_south_report: str
    convergence: str
    divergence: str
    final_output: dict
    status: str

def atlanticist_analyst(state: DuelState):
    ctx = clean_text(state.get('context', ''))[:1500] # Aggressive pruning
    print(f"🔵 [Atlanticist] Analyzing: {state['headline'][:50]}... (Context: {len(ctx)} chars)")
    
    prompt = f"""
    ROLE: You are an Atlanticist Strategic Analyst representing the Western Security Establishment.
    HEADLINE: {state['headline']}
    CONTEXT: {ctx}
    
    TASK: Analyze this situation from the perspective of NATO, the G7, and Global Market stability.
    - Focus on: Security of supply chains, democratic alliances, stability of the liberal international order.
    - Risk assessment: Use a Western-centric framework.
    
    Write a concise strategic report (max 200 words).
    """
    content = safe_duel_invoke([HumanMessage(content=prompt)], label="Atlanticist")
    print(f"🔵 [Atlanticist] Done ({len(content)} chars)")
    return {"atlanticist_report": content}

def global_south_realist(state: DuelState):
    ctx = clean_text(state.get('context', ''))[:1500]
    print(f"🟢 [Global South] Analyzing: {state['headline'][:50]}... (Context: {len(ctx)} chars)")
    
    prompt = f"""
    ROLE: You are a Global South Realist and Sovereignty Advocate.
    HEADLINE: {state['headline']}
    CONTEXT: {ctx}
    
    TASK: Analyze this situation from the perspective of regional sovereignty, non-Western alliances (BRICS+), and anti-hegemonic interests.
    - Focus on: Economic self-determination, regional security architectures (outside US/NATO), and the impact of Western intervention/sanctions.
    - Perspective: Highlight the interests of developing and emerging nations.
    
    Write a concise strategic report (max 200 words).
    """
    content = safe_duel_invoke([HumanMessage(content=prompt)], label="Global South")
    print(f"🟢 [Global South] Done ({len(content)} chars)")
    return {"global_south_report": content}

def synthesizer(state: DuelState):
    print(f"⚖️ [Synthesizer] Synthesizing perspectives...")
    prompt = f"""
    You are a Dialectical Intelligence Node. You have been given two opposing reports on: "{state['headline']}".
    
    ATLANTICIST REPORT:
    {state['atlanticist_report']}
    
    GLOBAL SOUTH REPORT:
    {state['global_south_report']}
    
    TASK:
    1. Identify "POINTS OF CONVERGENCE": Facts or risks both agree on.
    2. Identify "POINTS OF DIVERGENCE": Where their core interpretations or proposed actions conflict.
    
    FORMAT YOUR RESPONSE AS JSON ONLY (no markdown, no explanation):
    {{
      "convergence": "...",
      "divergence": "...",
      "west_summary": "Summary of Western view",
      "south_summary": "Summary of Global South view"
    }}
    """
    content = safe_duel_invoke([HumanMessage(content=prompt)], label="Synthesizer")
    print(f"⚖️ [Synthesizer] Completion received.")
    try:
        # Clean up markdown if model returns it
        clean_json = re.sub(r'```json\s*', '', content)
        clean_json = re.sub(r'\s*```', '', clean_json).strip()
        result = json.loads(clean_json)
        print(f"✅ [Synthesizer] Parsed output successfully")
        return {
            "convergence": result.get("convergence"),
            "divergence": result.get("divergence"),
            "final_output": result,
            "status": "done"
        }
    except Exception as e:
        print(f"⚠️ [Synthesizer] JSON parse failed: {e}. Falling back to raw text.")
        return {
            "status": "done",
            "convergence": content[:1000],
            "divergence": "Parsing failed - raw text provided",
            "final_output": {
                "convergence": content[:1000],
                "divergence": "Parsing error",
                "west_summary": state.get("atlanticist_report", "")[:400],
                "south_summary": state.get("global_south_report", "")[:400]
            }
        }

# --- Graph Wiring ---
workflow = StateGraph(DuelState)

workflow.add_node("atlanticist", atlanticist_analyst)
workflow.add_node("global_south", global_south_realist)
workflow.add_node("synthesizer", synthesizer)

workflow.set_entry_point("atlanticist")
workflow.add_edge("atlanticist", "global_south")
workflow.add_edge("global_south", "synthesizer")
workflow.add_edge("synthesizer", END)

app = workflow.compile()
