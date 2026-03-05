import os
import uuid
import asyncio
from agents.graph import app as agent_app
from agents.state import AgentState

async def run_test():
    headline = "Why Are Pakistan and Afghanistan Fighting?"
    c_id = "test-cluster-123"
    
    inputs = {
        "cluster_id": c_id,
        "run_id": str(uuid.uuid4()),
        "headline": headline,
        "original_source_url": c_id,
        "research_notes": ["Initial Fact: Tensions are rising on the border."], 
        "citations": [],
        "turn_count": 0,
        "status": "researching"
    }
    
    print(f"--- Testing Agent with Headline: {headline} ---")
    try:
        # Using astream to see steps
        async for output in agent_app.astream(inputs):
            for key, value in output.items():
                print(f"\n[Node: {key}]")
                if "status" in value:
                    print(f"Status: {value['status']}")
                if "research_notes" in value:
                    print(f"Notes Added: {len(value['research_notes'])}")
                if "final_report" in value:
                    print(f"REPORT GENERATED! Length: {len(value['final_report'])}")
                    print("-" * 20)
                    print(value['final_report'][:200] + "...")
        
        print("\n--- TEST COMPLETE ---")
    except Exception as e:
        import traceback
        print(f"\n!!! TEST FAILED !!!")
        print(f"Error: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(run_test())
