import os
import uuid
import threading
import psycopg2
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Import graphs
from agents.graph import app as agent_app
from agents.duel_graph import app as duel_app

load_dotenv()

app = FastAPI(title="OmniNews Intelligence Server")

# ... (Previous code remains)

def run_narrative_duel(cluster_id: str, headline: str, context: str):
    """
    Background worker: Runs the dual-agent debate and saves the results.
    """
    try:
        print(f"⚔️ Launching Narrative Duel for {cluster_id}")
        initial_state = {
            "cluster_id": cluster_id,
            "headline": headline,
            "context": context,
            "status": "starting"
        }
        
        result = duel_app.invoke(initial_state)
        output = result.get("final_output", {})
        
        # Save to Database
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("""
            UPDATE cluster_summaries 
            SET narrative_duel = %s, is_debating = FALSE 
            WHERE cluster_id = %s
        """, (json.dumps(output), cluster_id))
        conn.commit()
        cur.close()
        conn.close()
        print(f"✅ Narrative Duel Complete for {cluster_id}")
        
    except Exception as e:
        print(f"❌ Narrative Duel Error for {cluster_id}: {e}")
        try:
            conn = get_db_conn()
            cur = conn.cursor()
            cur.execute("UPDATE cluster_summaries SET is_debating = FALSE WHERE cluster_id = %s", (cluster_id,))
            conn.commit()
            conn.close()
        except: pass

@app.post("/debate/{cluster_id}")
async def start_debate(cluster_id: str, background_tasks: BackgroundTasks):
    """
    Triggers a side-by-side narrative duel for a specific briefing.
    """
    conn = get_db_conn()
    cur = conn.cursor()
    
    # 1. Get context (Full investigative report if exists, else summary) from both tables
    cur.execute("""
        SELECT a.title, COALESCE(s.investigative_report, s.summary_text) 
        FROM cluster_summaries s
        JOIN articles a ON s.cluster_id = a.cluster_id
        WHERE s.cluster_id = %s
        LIMIT 1
    """, (cluster_id,))
    res = cur.fetchone()
    
    if not res:
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Briefing not found")
    
    headline, context = res
    
    # 2. Mark as debating
    cur.execute("UPDATE cluster_summaries SET is_debating = TRUE WHERE cluster_id = %s", (cluster_id,))
    conn.commit()
    cur.close()
    conn.close()
    
    # 3. Trigger background job
    background_tasks.add_task(run_narrative_duel, cluster_id, headline, context)
    
    return {"status": "duel_started", "cluster_id": cluster_id}

# Enable CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_conn():
    db_url = os.getenv("DATABASE_URL")
    return psycopg2.connect(db_url)

def run_deep_dive(cluster_id: str, headline: str):
    """
    Background worker: Runs the agent in Deep-Dive mode and saves the report.
    """
    try:
        run_id = str(uuid.uuid4())
        print(f"🚀 Starting Deep-Dive for {cluster_id} (Run: {run_id})")
        
        # 1. Initialize State
        initial_state = {
            "cluster_id": cluster_id,
            "run_id": run_id,
            "headline": headline,
            "research_notes": [],
            "citations": [],
            "turn_count": 0,
            "status": "researching",
            "is_deep_dive": True
        }
        
        # 2. Run Agent Graph
        result = agent_app.invoke(initial_state)
        report = result.get("final_report", "Deep-dive failed to generate a report.")
        
        # 3. Save to Database
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("""
            UPDATE cluster_summaries 
            SET investigative_report = %s, is_investigating = FALSE 
            WHERE cluster_id = %s
        """, (report, cluster_id))
        conn.commit()
        cur.close()
        conn.close()
        print(f"✅ Deep-Dive Complete for {cluster_id}")
        
    except Exception as e:
        print(f"❌ Deep-Dive Error for {cluster_id}: {e}")
        # Reset investigating state on failure
        try:
            conn = get_db_conn()
            cur = conn.cursor()
            cur.execute("UPDATE cluster_summaries SET is_investigating = FALSE WHERE cluster_id = %s", (cluster_id,))
            conn.commit()
            conn.close()
        except: pass

@app.post("/investigate/{cluster_id}")
async def start_investigation(cluster_id: str, background_tasks: BackgroundTasks):
    """
    Triggers a multi-turn autonomous investigation for a specific briefing.
    """
    conn = get_db_conn()
    cur = conn.cursor()
    
    # Check if cluster exists and get headline
    cur.execute("SELECT title FROM articles WHERE cluster_id = %s LIMIT 1", (cluster_id,))
    res = cur.fetchone()
    if not res:
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    headline = res[0]
    
    # Mark as investigating
    cur.execute("UPDATE cluster_summaries SET is_investigating = TRUE WHERE cluster_id = %s", (cluster_id,))
    conn.commit()
    cur.close()
    conn.close()
    
    # Trigger background job
    background_tasks.add_task(run_deep_dive, cluster_id, headline)
    
    return {"status": "investigation_started", "cluster_id": cluster_id}

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
