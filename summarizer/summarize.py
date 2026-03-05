import os
import psycopg2
import uuid
import time
from agents.graph import app as agent_app
from dagster import asset, Output, Definitions, define_asset_job, RunStatusSensorDefinition, run_status_sensor, DagsterRunStatus, RunRequest
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# OpenRouter Configuration
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
    default_headers={
        "HTTP-Referer": "http://localhost:3000", # Optional, for OpenRouter rankings
        "X-Title": "Dagster News ETL", # Optional
    }
)

# --- CONFIGURATION ---
def get_db_conn():
    """Establishes a connection to Supabase using the Env Var"""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL is missing! Check your docker-compose.yml")
    return psycopg2.connect(db_url)

# Note: Old generate_summary function removed in favor of Agent Graph

def is_editorial_fit(headline: str) -> bool:
    """
    Scout Filter: Checks if the headline matches our editorial priorities.
    """
    h = headline.lower()
    
    # Positive Keywords (Priority)
    priority = ['war', 'conflict', 'policy', 'government', 'election', 'minister', 'president', 'summit', 
                'nuclear', 'treaty', 'sanction', 'military', 'border', 'inflation', 'economy', 'budget',
                'diplomatic', 'security', 'pentagon', 'white house', 'parliament', 'senate', 'legislation']
    
    # Negative Keywords (Avoid)
    ignore = ['celebrity', 'hollywood', 'jim carrey', 'kardashian', 'movie', 'actor', 'singer', 'award', 
              'red carpet', 'romance', 'dating', 'fashion', 'gossip', 'entertainment', 'tiktok', 'box office']
    
    # 1. Hard Skip
    for word in ignore:
        if word in h:
            return False
            
    # 2. Hard Keep (Priority)
    for word in priority:
        if word in h:
            return True
            
    # 3. Default: Medium/High confidence news only?
    # Let's be semi-relaxed but cautious.
    return True # Allow others unless explicitly ignored

@asset
def new_cluster_summaries():
    """
    Finds clusters that don't have a summary yet, allows for LLM processing,
    and saves the result to the cluster_summaries table.
    """
    conn = get_db_conn()
    cursor = conn.cursor()

    # 1. Find clusters needing summaries
    # Logic: Get unique cluster_ids from articles 
    #        EXCEPT those already in cluster_summaries
    query = """
        SELECT DISTINCT a.cluster_id
        FROM articles a
        WHERE a.cluster_id IS NOT NULL
        EXCEPT
        SELECT cluster_id FROM cluster_summaries;
    """
    cursor.execute(query)
    cluster_ids = [row[0] for row in cursor.fetchall()]

    if not cluster_ids:
        print("No new clusters to summarize.")
        conn.close()
        return Output(0, metadata={"status": "No work"})

    print(f"Found {len(cluster_ids)} clusters to summarize.")

    # 2. Process each cluster
    new_summaries = []
    
    for c_id in cluster_ids:
        # Fetch articles for this cluster
        cursor.execute("SELECT title, content_summary FROM articles WHERE cluster_id = %s", (str(c_id),))
        articles = cursor.fetchall()
        
        if not articles:
            continue

        # Prepare Agent Input using the first article as the "Headline" equivalent
        main_headline = articles[0][0] 
        
        # --- SCOUT FILTER ---
        if not is_editorial_fit(main_headline):
            print(f"--- Skipping Cluster {c_id}: Does not meet editorial standards ({main_headline}) ---")
            # We insert a skip record so we don't try again
            cursor.execute(
                "INSERT INTO cluster_summaries (cluster_id, summary_text) VALUES (%s, %s)",
                (str(c_id), f"Skipped: Editorial Filter (Sensationalism/Celebrity). Category: {main_headline}")
            )
            conn.commit()
            continue

        initial_research = [f"Source Article: {t}\nSummary: {s}" for t, s in articles]
        
        inputs = {
            "cluster_id": str(c_id),
            "run_id": str(uuid.uuid4()),
            "headline": main_headline,
            "original_source_url": str(c_id), # Legacy field
            "research_notes": initial_research, 
            "citations": [],
            "turn_count": 0,
            "status": "researching"
        }
        
        print(f"--- Invoking Agent for Cluster {c_id} ---")
        try:
            # Invoke the graph
            final_state = agent_app.invoke(inputs)
            summary_text = final_state.get("final_report", "Error: No Report Generated")
        except Exception as e:
            import traceback
            print(f"Agent Logic Failed for cluster {c_id}: {e}")
            with open("/tmp/agent_error.log", "a") as f:
                f.write(f"--- FAILURE: Cluster {c_id} ---\n")
                f.write(f"Error: {str(e)}\n")
                f.write(traceback.format_exc() + "\n")
            traceback.print_exc()
            summary_text = f"Agent Error. Context: {main_headline}"
            
        new_summaries.append((str(c_id), summary_text))
        
        # --- THROTTLE ---
        # Reduced to 1s for PAID tier speed while maintaining stability
        print("Pausing 1s for API stability...")
        time.sleep(1)
    
    # 3. Save to DB
    print(f"Saving {len(new_summaries)} summaries...")
    cursor.executemany(
        "INSERT INTO cluster_summaries (cluster_id, summary_text) VALUES (%s, %s)",
        new_summaries
    )
    conn.commit()
    conn.close()

    return Output(len(new_summaries), metadata={"Generated Summaries": len(new_summaries)})

# --- JOB DEFINITIONS ---
summarize_job = define_asset_job(name="summarize_news_job", selection=["new_cluster_summaries"])

# --- SENSORS ---
@run_status_sensor(run_status=DagsterRunStatus.SUCCESS, request_job=summarize_job)
def trigger_summarize_on_process_success(context):
    """
    Triggers the summarization job when the processing job succeeds.
    Note: Cross-location monitoring may require additional setup in workspace.yaml
    """
    if context.dagster_run.job_name == "process_news_job":
        yield RunRequest(job_name="summarize_news_job")

defs = Definitions(
    assets=[new_cluster_summaries],
    jobs=[summarize_job],
    sensors=[trigger_summarize_on_process_success]
)
