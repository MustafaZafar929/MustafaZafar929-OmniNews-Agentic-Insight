import os
import operator
import time
import random
from typing import Annotated, Sequence, TypedDict, Union

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END

from .state import AgentState
from .tools import web_search, retrieve_similar_articles, log_agent_step

# --- LLM Setup ---
GOOGLE_KEY = os.getenv("GOOGLE_AI_STUDIO_API_KEY")

llm = ChatGoogleGenerativeAI(
    model="gemini-flash-latest",
    google_api_key=GOOGLE_KEY,
    temperature=0.7,
    max_output_tokens=4000
)

# Compatibility aliases
llm_fast = llm
llm_think = llm

def force_string(content):
    """
    Recent Gemini/LangChain versions return a list of dicts for multimodal content.
    This helper extracts the textual parts.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        # Join all text pieces found in the list
        text_parts = []
        for part in content:
            if isinstance(part, str):
                text_parts.append(part)
            elif isinstance(part, dict) and "text" in part:
                text_parts.append(part["text"])
        return "\n".join(text_parts)
    return str(content)

def safe_llm_invoke(messages, max_retries=5):
    """
    Exponential backoff wrapper for Gemini API to handle 429 (Rate Limit) errors.
    """
    for i in range(max_retries):
        try:
            response = llm.invoke(messages)
            
            # Extract usage metadata
            usage = getattr(response, 'usage_metadata', {})
            token_info = f"[Input: {usage.get('input_tokens', '?')}, Output: {usage.get('output_tokens', '?')}, Total: {usage.get('total_tokens', '?')}]"
            
            # CRITICAL: Ensure content is a clean string
            response.content = force_string(response.content)
            
            return response, token_info
        except Exception as e:
            err_str = str(e).lower()
            if any(code in err_str for code in ["429", "503", "502", "504", "resource_exhausted", "service_unavailable"]):
                # Streamlined for Paid Tier: shorter initial wait (2s vs 7s)
                wait_time = (1.5 ** i) + random.random() * 2 + 2 
                print(f"⚠️ Rate limit hit (429). Retrying in {wait_time:.1f}s... (Attempt {i+1}/{max_retries})")
                time.sleep(wait_time)
                continue
            else:
                print(f"❌ Non-rate-limit error in LLM: {e}")
                raise e
    raise Exception(f"Failed to call LLM after {max_retries} retries due to rate limits.")

# --- Nodes ---

def researcher(state: AgentState):
    """
    The Researcher: Looks at the headline, decides what to search, and adds facts.
    """
    headline = state["headline"]
    cluster_id = state.get("cluster_id", "unknown")
    run_id = state.get("run_id", "unknown")
    
    # 0. Log Start
    turn = state.get('turn_count', 0)
    print(f"--- Researcher (Turn {turn}) for {cluster_id} ---")
    log_agent_step(cluster_id, "researcher", turn, f"Analyzing headline: {headline}", "Starting reasoning", run_id=run_id)
    feedback = state.get("critique_feedback", "")
    existing_notes = "\n".join(state.get("research_notes", []))
    
    prompt = f"""
    You are a thorough News Researcher. 
    Headline: "{headline}"
    
    Current Notes:
    {existing_notes or "None"}
    
    Feedback from Critic (Address this!):
    {feedback or "None"}
    
    Your goal is to gather facts to write a comprehensive geopolitical and policy briefing.
    
    EDITORIAL PRIORITIES:
    - PRIORITIZE: Conflict developments, international relations, policy changes, and security analysis.
    - AVOID: Celebrity news, local crime, or purely sensational/clickbait headlines unless they have significant national or global impact.
    
    1. If you have enough info, just summarize the key NEW facts you found.
    2. If you need more info (or if the Critic gave feedback), use the Search Tool.
    
    Return a list of NEW facts found in this turn. 
    Prefix each fact with "FACT:".
    If you used a tool, include the Source URL in brackets [Source].
    """
    
    # Bind tools to the LLM (simple implementation without bind_tools for now to keep it explicit)
    new_notes = []
    new_citations = []
    
    # STREAMLINED: Decision + Research in one call if it's the first turn
    if turn == 0:
        print(f"--- Auto-Searching for Cluster {cluster_id} ---")
        web_result = web_search.invoke(headline)
        new_notes.append(f"Initial Research for '{headline}':\n{web_result}")
    else:
        # Subsequent turns (if feedback exists)
        decision_prompt = f"Headline: {headline}\nFeedback: {feedback}\nReply with 'SEARCH: <query>' or 'DONE'."
        response, _ = safe_llm_invoke([HumanMessage(content=decision_prompt)])
        if "SEARCH:" in response.content:
            query = response.content.split("SEARCH:", 1)[1].strip()
            web_result = web_search.invoke(query)
            new_notes.append(f"Follow-up for '{query}':\n{web_result}")

    return {
        "research_notes": new_notes,
        "turn_count": state.get("turn_count", 0) + 1,
        "status": "reporting" # Go straight to reporter unless critically lacking
    }

def critic(state: AgentState):
    """
    The Critic: Reviews the notes to ensure quality.
    """
    print("--- Critic ---")
    
    notes = "\n".join(state.get("research_notes", []))
    headline = state["headline"]
    
    prompt = f"""
    You are a strict News Editor. Review the research notes for the headline: "{headline}".
    
    Notes:
    {notes}
    
    Checklist:
    1. Are there at least 2 distinct sources? (Quality check - reduced for speed)
    2. Does it focus on Geopolitics, Policy, War, or Security? 
    3. Is it free from sensationalism and clickbait? (If it's just 'vague drama', FAIL it).
    4. Are there enough details for a 500-word deep dive?
    
    If it passes, reply exactly: "PASS".
    If it fails, reply with "FAIL: <reason and instructions for researcher>".
    """
    
    try:
        response_obj, token_info = safe_llm_invoke([HumanMessage(content=prompt or "Evaluate notes")])
        response = response_obj.content
        print(f"Critic Decision {token_info}: {response}")
    except Exception as e:
        print(f"CRITICAL: Critic turn failed: {e}")
        raise e
    
    
    if "PASS" in response:
        log_agent_step(state.get("cluster_id"), "critic", 99, f"{response} {token_info}", f"PASSED. {token_info}", run_id=state.get("run_id"))
        return {"critique_feedback": None, "status": "reporting"}
    else:
        log_agent_step(state.get("cluster_id"), "critic", 99, f"{response} {token_info}", f"FAILED - Requesting Changes. {token_info}", run_id=state.get("run_id"))
        return {"critique_feedback": response, "status": "researching"}

def reporter(state: AgentState):
    """
    The Reporter: Writes the final markdown briefing.
    """
    print("--- Reporter ---")
    
    notes = "\n".join(state.get("research_notes", []))
    headline = state["headline"]
    source_data = state.get("source_data", [])
    
    source_info = "\n".join([f"- {s.get('domain')}: {s.get('link')}" for s in source_data])
    
    prompt = f"""
    You are a Senior Journalist and Geopolitical Analyst. 
    Write a definitive briefing for: "{headline}".
    
    RESEARCH NOTES:
    {notes}
    
    SOURCES IN THIS CLUSTER:
    {source_info}
    
    YOUR TASK:
    1. Write the briefing in Markdown.
    2. Assign a "Stability Risk Score" (1-10).
    3. Write a brief "Impact Analysis".
    4. ANALYZE SOURCES: For each source listed above, categorize its political/editorial orientation as: "left", "center", or "right".
    5. EXTRACT ENTITIES: Identify the most important People, Organizations, and Locations mentioned.
    
    FORMATTING RULES:
    - Start with [RISK_SCORE: X]
    - Then [IMPACT: Your analysis]
    - Then [SOURCES_JSON] {{"sources": [{{"domain": "...", "link": "...", "bias": "left/center/right"}}, ...]}} [/SOURCES_JSON]
    - Then [ENTITIES_JSON] {{"people": ["..."], "organizations": ["..."], "locations": ["..."]}} [/ENTITIES_JSON]
    - Then write the full Markdown report starting with # {headline}.
    """
    
    try:
        response_obj, token_info = safe_llm_invoke([HumanMessage(content=prompt or "Write report")])
        content = response_obj.content
        
        # Parse Risk Score
        risk_score = 5 # Default
        if "[RISK_SCORE:" in content:
            try:
                risk_score = int(content.split("[RISK_SCORE:")[1].split("]")[0].strip())
            except: pass
            
        # Parse Impact
        impact_analysis = "Regional security/market implications expected."
        if "[IMPACT:" in content:
            try:
                impact_analysis = content.split("[IMPACT:")[1].split("]")[0].strip()
            except: pass
            
        # Parse Source Analysis
        source_analysis = []
        if "[SOURCES_JSON]" in content:
            try:
                import json
                json_str = content.split("[SOURCES_JSON]")[1].split("[/SOURCES_JSON]")[0].strip()
                source_analysis = json.loads(json_str).get("sources", [])
            except: pass
            
        # Parse Entities
        key_entities = {"people": [], "organizations": [], "locations": []}
        if "[ENTITIES_JSON]" in content:
            try:
                import json
                json_str = content.split("[ENTITIES_JSON]")[1].split("[/ENTITIES_JSON]")[0].strip()
                key_entities = json.loads(json_str)
            except: pass

        # Clean Final Report (Remove tags)
        final_report = content
        if "[RISK_SCORE:" in final_report:
            final_report = final_report.split("#", 1)[-1]
            final_report = "# " + final_report.strip()

        log_agent_step(state.get("cluster_id"), "reporter", 100, f"Score: {risk_score}", f"Reporting Finished. {token_info}", run_id=state.get("run_id"))
        
        return {
            "final_report": final_report, 
            "risk_score": risk_score, 
            "impact_analysis": impact_analysis,
            "source_analysis": source_analysis,
            "key_entities": key_entities,
            "status": "done"
        }
    except Exception as e:
        print(f"CRITICAL: Reporter turn failed: {e}")
        raise e

# --- Graph Wiring ---

workflow = StateGraph(AgentState)

workflow.add_node("researcher", researcher)
workflow.add_node("critic", critic)
workflow.add_node("reporter", reporter)

workflow.set_entry_point("researcher")

def router(state: AgentState):
    # SAFETY VALVE: 1 turn for speed
    if state.get("turn_count", 0) >= 1:
        return "reporter"
    
    if state.get("status") == "reporting":
        return "reporter"
    return "critic"

workflow.add_conditional_edges(
    "researcher",
    router,
    {
        "researcher": "researcher",
        "critic": "critic",
        "reporter": "reporter"
    }
)

workflow.add_conditional_edges(
    "critic",
    router,
    {
        "researcher": "researcher",
        "reporter": "reporter"
    }
)

workflow.add_edge("reporter", END)

# Compile
app = workflow.compile()
