from agents.graph import app
from agents.state import AgentState

def test_run():
    print("Initializing Test Run...")
    
    initial_state = {
        "headline": "New AI Agent architecture released by Google DeepMind",
        "original_source_url": "http://google.com/news",
        "research_notes": [],
        "citations": [],
        "turn_count": 0,
        "status": "researching"
    }
    
    print(f"Starting Workflow with headline: {initial_state['headline']}")
    
    # Run the graph
    for output in app.stream(initial_state):
        for key, value in output.items():
            print(f"Finished Node: {key}")
            print(f"State Update: {value}")
            print("-" * 20)

if __name__ == "__main__":
    test_run()
