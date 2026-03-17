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
    You are a Strategic Intelligence Analyst specializing in Geopolitics and Global Economics.
    Headline: "{headline}"
    
    Current Notes:
    {existing_notes or "None"}
    
    Feedback from Critic (Address this!):
    {feedback or "None"}
    
    GOAL: Gather critical facts to assess global stability and market impact.
    
    STRATEGIC PRIORITIES:
    - CONFLICT ZONES: Prioritize Iran, Middle East, USA, Israel, Palestine, Lebanon, Russia/Ukraine, and China/Taiwan.
    - ECONOMIC IMPACT: Focus on news affecting Oil Prices, Stock Markets, Employment, Inflation, and Central Bank policies.
    - SENSATIONALISM FILTER: Strictly ignore celebrity gossip, hollywood news, or entertainment drama UNLESS it is directly tied to political corruption (e.g., Epstein-related) or high-level policy.
    
    INSTRUCTIONS:
    1. Assess if the headline has strategic importance. If it's purely sensational, state why and suggest stopping.
    2. If strategic, gather detailed facts using the Search Tool to uncover regional stability risks or economic ripples.
    3. Return a list of NEW facts found. Prefix with "FACT:". Include [Source] for citations.
    """
    
    # Bind tools to the LLM (simple implementation without bind_tools for now to keep it explicit)
    new_notes = []
    new_citations = []
    
    # STREAMLINED: Decision + Research in one call if it's the first turn
    is_deep_dive = state.get("is_deep_dive", False)
    
    if turn == 0:
        print(f"--- Auto-Searching for Cluster {cluster_id} (Deep Dive: {is_deep_dive}) ---")
        web_result = web_search.invoke(headline)
        new_notes.append(f"Initial Research for '{headline}':\n{web_result}")
    else:
        # Subsequent turns (if feedback exists or if it's a deep dive)
        context = f"Headline: {headline}\nNotes: {existing_notes}\nFeedback: {feedback}"
        if is_deep_dive:
            role = "You are a Private Investigator. Gather hidden details, primary sources, and conflicting reports."
        else:
            role = "You are a News Researcher. Gather facts for a briefing."
            
        decision_prompt = f"{role}\n{context}\nReply with 'SEARCH: <query>' or 'DONE'."
        response, _ = safe_llm_invoke([HumanMessage(content=decision_prompt)])
        if "SEARCH:" in response.content:
            query = response.content.split("SEARCH:", 1)[1].strip()
            web_result = web_search.invoke(query)
            new_notes.append(f"Follow-up Search for '{query}':\n{web_result}")

    # Logic to decide next state
    next_status = "reporting"
    if is_deep_dive and turn < 5: # Allow 5 research steps in deep dive
        next_status = "researching"
    elif turn < 1 and not is_deep_dive:
        next_status = "researching" # Standard gets at least 1-2 turns

    return {
        "research_notes": new_notes,
        "turn_count": state.get("turn_count", 0) + 1,
        "status": next_status
    }

def critic(state: AgentState):
    """
    The Critic: Reviews the notes to ensure quality.
    """
    print("--- Critic ---")
    
    notes = "\n".join(state.get("research_notes", []))
    headline = state["headline"]
    
    prompt = f"""
    You are a Senior Intelligence Editor. Review the research notes for: "{headline}".
    
    Notes:
    {notes}
    
    STRICT COMPLIANCE CHECK:
    1. Geopolitical/Economic Focus: Does this report focus on real-world conflicts, security, or markets?
    2. Zero Sensationalism: Is it free from celebrity gossip, pure clickbait, or irrelevant 'soft' news?
    3. Depth: Does it provide enough context to assess "Stability Risk" or "Market Implications"?
    4. Epistein/Corruption Clause: Gossip is ONLY allowed if it directly involves high-level political corruption.
    
    If it passes this high-stakes filter, reply: "PASS".
    If it fails (too sensational or low-impact), reply: "FAIL: <reason> - pivot to strategic context."
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
    import re
    import json
    
    notes = "\n".join(state.get("research_notes", []))
    headline = state["headline"]
    source_data = state.get("source_data", [])
    
    source_info = "\n".join([f"- {s.get('domain')}: {s.get('link')}" for s in source_data])
    
    prompt = f"""
    You are a Sovereign Intelligence Analyst. Write a definitive Strategic Briefing.
    Headline: "{headline}"
    
    RESEARCH NOTES:
    {notes}
    
    SOURCES:
    {source_info}
    
    STRUCTURE REQUIREMENTS:
    1. STABILITY RISK: Assign a score (1-10) based on regional/global escalation potential.
    2. MARKET IMPACT: Analyze specific effects on Oil, Stocks, Currency, or Employment.
    3. SOURCE BIAS: Categorize sources as left/center/right.
    4. ENTITIES: Extract major People, Organizations, and Locations.
    5. THE REPORT: Write a professional, data-driven intelligence report. Avoid flowery language; focus on strategic outcomes.
    
    FORMATTING:
    - [RISK_SCORE: X]
    - [IMPACT: Market and Stability analysis]
    - [SOURCES_JSON] {{"sources": [ {{"domain": "...", "bias": "...", "link": "..."}}, ... ] }} [/SOURCES_JSON]
    - [ENTITIES_JSON] {{"people": [...], "organizations": [...], "locations": [...]}} [/ENTITIES_JSON]
    - Full Markdown starts with # {headline}.
    """
    
    try:
        response_obj, token_info = safe_llm_invoke([HumanMessage(content=prompt or "Write report")])
        content = response_obj.content
        
        # Helper to extract tags using regex for robustness
        def extract_tag(text, tag_name):
            pattern = rf"\[{tag_name}[:\s]*([^\]]*)\]"
            match = re.search(pattern, text)
            return match.group(1).strip() if match else None

        def extract_json_block(text, tag_name):
            start_tag = f"[{tag_name}]"
            end_tag = f"[/{tag_name}]"
            if start_tag in text and end_tag in text:
                block = text.split(start_tag)[1].split(end_tag)[0].strip()
                # Clean markdown code blocks if any
                block = re.sub(r'```(?:json)?\s*', '', block)
                block = re.sub(r'\s*```', '', block).strip()
                return block
            return None

        # Parse Risk Score
        risk_score = 5 # Default
        rs_match = extract_tag(content, "RISK_SCORE")
        if rs_match:
            try:
                risk_score = int(rs_match)
            except: pass
            
        # Parse Impact
        impact_analysis = "Regional security/market implications expected."
        impact_match = extract_tag(content, "IMPACT")
        if impact_match:
            impact_analysis = impact_match
            
        # Parse Source Analysis
        source_analysis = []
        source_block = extract_json_block(content, "SOURCES_JSON")
        if source_block:
            try:
                parsed = json.loads(source_block)
                if isinstance(parsed, dict):
                    source_analysis = parsed.get("sources", [])
                elif isinstance(parsed, list):
                    source_analysis = parsed
            except Exception as e:
                print(f"⚠️ Failed to parse SOURCES_JSON: {e}")
            
        # Parse Entities
        key_entities = {"people": [], "organizations": [], "locations": []}
        entities_block = extract_json_block(content, "ENTITIES_JSON")
        if entities_block:
            try:
                key_entities = json.loads(entities_block)
            except Exception as e:
                print(f"⚠️ Failed to parse ENTITIES_JSON: {e}")

        # Clean Final Report (Aggressive v3 Regex)
        cleaned = content
        
        # 1. Strip JSON blocks even if closing tags are missing (greedy match)
        cleaned = re.sub(r'\[SOURCES_JSON\][\s\S]*?(\[\/SOURCES_JSON\]|(?=\[ENTITIES_JSON\])|$)', '', cleaned, flags=re.IGNORECASE|re.DOTALL)
        cleaned = re.sub(r'\[ENTITIES_JSON\][\s\S]*?(\[\/ENTITIES_JSON\]|$)', '', cleaned, flags=re.IGNORECASE|re.DOTALL)
        
        # 2. Strip single-line tags
        cleaned = re.sub(r'\[RISK_SCORE:.*?\]', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\[IMPACT:.*?\]', '', cleaned, flags=re.IGNORECASE)
        
        # 3. Catch-all for any [UPPERCASE_TAG]
        cleaned = re.sub(r'\[[A-Z_]{3,24}(:.*?)?\]', '', cleaned, flags=re.IGNORECASE)
        
        # 4. Filter out lines that are now empty or just markdown headers (## )
        lines = cleaned.split('\n')
        filtered_lines = []
        for line in lines:
            content_only = re.sub(r'^[#\s\-\*]+', '', line).strip()
            if content_only:
                filtered_lines.append(line)
            elif line.strip() == "":
                filtered_lines.append("")
        
        final_report = '\n'.join(filtered_lines).strip()

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
    is_deep_dive = state.get("is_deep_dive", False)
    turn_limit = 5 if is_deep_dive else 1
    
    if state.get("turn_count", 0) >= turn_limit:
        return "reporter"
    
    if state.get("status") == "reporting":
        return "reporter"
        
    return "researcher"

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
