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
    max_output_tokens=4000,
    google_api_version="v1"
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
            if "429" in err_str or "resource_exhausted" in err_str:
                wait_time = (2 ** i) + random.random() * 2 + 5 # Start with ~7s, scaling up
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
    # Actually, let's use the tools manually or via a clearer prompt for this 'Thinking' model.
    # We will use the tools directly here for simplicity in this implementation phase.
    
    # 1. Decide if we need search
    decision_prompt = f"""
    Headline: {headline}
    Notes So Far: {len(state.get('research_notes', []))} items.
    Feedback: {feedback}
    
    Do you need to search for more information? 
    Reply with "SEARCH: <query>" or "DONE" if you have enough.
    """
    
    try:
        response, token_info = safe_llm_invoke([HumanMessage(content=decision_prompt or "Start")])
        decision = response.content
        print(f"Researcher Decision {token_info}: {decision[:100]}...")
    except Exception as e:
        print(f"CRITICAL: Researcher turn failed: {e}")
        raise e 
    
    new_notes = []
    new_citations = []
    
    if "SEARCH:" in decision:
        query = decision.split("SEARCH:", 1)[1].strip()
        print(f"Researcher Searching: {query}")
        
        # Call Tools
        web_result = web_search.invoke(query)
        db_result = retrieve_similar_articles.invoke(query)
        
        # Synthesize logic would go here, but for now we append the raw tool outputs as 'notes'
        # In a real agent, we'd have the LLM parse this.
        new_notes.append(f"Search Results for '{query}':\n{web_result}")
        new_notes.append(f"DB Context:\n{db_result}")
        
    else:
        print("Researcher decided no more search is needed.")
        log_agent_step(cluster_id, "researcher", turn, f"{decision} {token_info}", f"Deciding to Stop Searching. {token_info}", run_id=run_id)
    
    return {
        "research_notes": new_notes,
        "turn_count": state.get("turn_count", 0) + 1,
        "status": "researching"
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
    
    prompt = f"""
    You are a Senior Journalist and Geopolitical Analyst at a prestigious news outlet. 
    Write a definitive, deep-dive 'Briefing' style report for: "{headline}".
    
    EDITORIAL STREGY:
    - Focus on strategic implications (how this affects international stability or domestic policy).
    - Maintain a serious, analytical tone. No sensationalism.
    
    Use these research notes:
    {notes}
    
    Required Output Structure:
    # {headline}
    
    ## 📰 Executive Summary
    [Comprehensive 2-paragraph overview]
    
    ## 🔍 In-Depth Analysis
    [Deep technical/contextual details. Use bold text for emphasis.]
    
    ## 📊 Key Developments
    | Date/Phase | Event Description | Significance |
    | :--- | :--- | :--- |
    | ... | ... | ... |
    
    ## 🌐 Sources & References
    List all source URLs found in the notes in a neat bulleted list. 
    Format them as: [Source Title](URL) if possible, otherwise just the URL.
    """
    
    try:
        response_obj, token_info = safe_llm_invoke([HumanMessage(content=prompt or "Write report")])
        response = response_obj.content
        log_agent_step(state.get("cluster_id"), "reporter", 100, f"Generating final report. {token_info}", f"Reporting Finished. {token_info}", run_id=state.get("run_id"))
    except Exception as e:
        print(f"CRITICAL: Reporter turn failed: {e}")
        raise e
    
    return {"final_report": response, "status": "done"}

# --- Graph Wiring ---

workflow = StateGraph(AgentState)

workflow.add_node("researcher", researcher)
workflow.add_node("critic", critic)
workflow.add_node("reporter", reporter)

workflow.set_entry_point("researcher")

def router(state: AgentState):
    # Safety Valve
    if state.get("turn_count", 0) > 1:
        print("Turn limit reached (2 turns). Forcing Report for speed.")
        return "reporter"
    
    if state.get("status") == "reporting":
        return "reporter"
    elif state.get("status") == "researching" and state.get("critique_feedback"):
        return "researcher" # Go back for more
    elif state.get("status") == "researching":
        return "critic" # Default flow
    
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
