import os
import json
from typing import Annotated, Sequence, TypedDict, Union
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END

# --- LLM Setup ---
GOOGLE_KEY = os.getenv("GOOGLE_AI_STUDIO_API_KEY")
llm = ChatGoogleGenerativeAI(model="gemini-flash-latest", google_api_key=GOOGLE_KEY, temperature=0.7)

class DuelState(TypedDict):
    cluster_id: str
    headline: str
    context: str # Shared research context
    atlanticist_report: str
    global_south_report: str
    convergence: str
    divergence: str
    final_output: dict
    status: str

def atlanticist_analyst(state: DuelState):
    """
    Persona: Pro-Western, Security/NATO focused, Market Stability prioritizer.
    """
    prompt = f"""
    ROLE: You are an Atlanticist Strategic Analyst representing the Western Security Establishment.
    HEADLINE: {state['headline']}
    CONTEXT: {state['context']}
    
    TASK: Analyze this situation from the perspective of NATO, the G7, and Global Market stability.
    - Focus on: Security of supply chains, democratic alliances, stability of the liberal international order.
    - Risk assessment: Use a Western-centric framework.
    
    Write a concise strategic report (max 250 words).
    """
    response = llm.invoke([HumanMessage(content=prompt)])
    return {"atlanticist_report": response.content}

def global_south_realist(state: DuelState):
    """
    Persona: Regional Sovereignty focused, Anti-Hegemonic, BRICS leaning.
    """
    prompt = f"""
    ROLE: You are a Global South Realist and Sovereignty Advocate.
    HEADLINE: {state['headline']}
    CONTEXT: {state['context']}
    
    TASK: Analyze this situation from the perspective of regional sovereignty, non-Western alliances (BRICS+), and anti-hegemonic interests.
    - Focus on: Economic self-determination, regional security architectures (outside US/NATO), and the impact of Western intervention/sanctions.
    - Perspective: Highlight the interests of developing and emerging nations.
    
    Write a concise strategic report (max 250 words).
    """
    response = llm.invoke([HumanMessage(content=prompt)])
    return {"global_south_report": response.content}

def synthesizer(state: DuelState):
    """
    Dialectical Node: Compares the two reports.
    """
    prompt = f"""
    You are a Dialectical Intelligence Node. You have been given two opposing reports on: "{state['headline']}".
    
    ATLANTICIST REPORT:
    {state['atlanticist_report']}
    
    GLOBAL SOUTH REPORT:
    {state['global_south_report']}
    
    TASK:
    1. Identify "POINTS OF CONVERGENCE": Facts or risks both agree on.
    2. Identify "POINTS OF DIVERGENCE": Where their core interpretations or proposed actions conflict.
    
    FORMAT YOUR RESPONSE AS JSON:
    {{
      "convergence": "...",
      "divergence": "...",
      "west_summary": "Summary of Western view",
      "south_summary": "Summary of Global South view"
    }}
    """
    response = llm.invoke([HumanMessage(content=prompt)])
    try:
        # Clean up possible markdown code blocks
        clean_json = response.content.replace("```json", "").replace("```", "").strip()
        result = json.loads(clean_json)
        return {
            "convergence": result.get("convergence"),
            "divergence": result.get("divergence"),
            "final_output": result,
            "status": "done"
        }
    except:
        return {"status": "error", "convergence": "Parsing failed", "divergence": "Parsing failed"}

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
