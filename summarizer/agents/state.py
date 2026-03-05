from typing import TypedDict, List, Optional, Annotated
import operator

class AgentState(TypedDict):
    """
    The 'Clipboard' passed between agents in the workflow.
    """
    cluster_id: str
    run_id: str
    headline: str
    original_source_url: str
    
    # Research Data
    research_notes: Annotated[List[str], operator.add] # Append-only list of facts
    citations: Annotated[List[str], operator.add]      # Append-only list of URLs
    
    # Critique
    critique_feedback: Optional[str]                   # Feedback from the Critic
    turn_count: int                                    # Safety limit to prevent infinite loops
    
    # Output
    final_report: Optional[str]                        # The final markdown report
    status: str                                        # 'researching', 'critiquing', 'reporting', 'done'
