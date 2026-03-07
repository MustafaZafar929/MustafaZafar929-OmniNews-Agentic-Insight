import os
import psycopg2
import psycopg2.extras
import uuid
import time
import threading
import json
from concurrent.futures import ThreadPoolExecutor
from agents.graph import app as agent_app
from dagster import asset, Output, Definitions, define_asset_job, run_status_sensor, DagsterRunStatus, RunRequest, DefaultSensorStatus, SkipReason
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION ---
def get_db_conn():
    """Establishes a connection to Supabase using the Env Var"""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL is missing! Check your docker-compose.yml")
    return psycopg2.connect(db_url)

def is_editorial_fit(headline: str) -> bool:
    """
    Scout Filter: Checks if the headline matches our editorial priorities.
    """
    h = headline.lower()
    priority = ['war', 'conflict', 'policy', 'government', 'election', 'minister', 'president', 'summit', 
                'nuclear', 'treaty', 'sanction', 'military', 'border', 'inflation', 'economy', 'budget',
                'diplomatic', 'security', 'pentagon', 'white house', 'parliament', 'senate', 'legislation']
    ignore = ['celebrity', 'hollywood', 'jim carrey', 'kardashian', 'movie', 'actor', 'singer', 'award', 
              'red carpet', 'romance', 'dating', 'fashion', 'gossip', 'entertainment', 'tiktok', 'box office']
    
    for word in ignore:
        if word in h: return False
    for word in priority:
        if word in h: return True
    return True

@asset
def new_cluster_summaries():
    """
    Finds clusters needing summaries and processes them IN PARALLEL.
    """
    conn = get_db_conn()
    cursor = conn.cursor()

    # 1. Find clusters needing summaries
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

    print(f"Found {len(cluster_ids)} clusters to summarize. Starting Parallel Execution...")

    # 2. Parallel Processing Logic
    new_summaries = []
    summary_lock = threading.Lock()
    
    def process_cluster(c_id):
        try:
            # Fresh connection per thread
            t_conn = get_db_conn()
            t_cursor = t_conn.cursor()
            
            t_cursor.execute("SELECT title, content_summary, source_domain, link FROM articles WHERE cluster_id = %s", (str(c_id),))
            articles = t_cursor.fetchall()
            
            if not articles:
                t_conn.close()
                return

            main_headline = articles[0][0]
            
            if not is_editorial_fit(main_headline):
                print(f"--- [Thread] Skipping {c_id}: Editorial ---")
                t_cursor.execute(
                    "INSERT INTO cluster_summaries (cluster_id, summary_text) VALUES (%s, %s) ON CONFLICT (cluster_id) DO NOTHING",
                    (str(c_id), f"Skipped: Editorial Filter. Category: {main_headline}")
                )
                t_conn.commit()
                t_conn.close()
                return

            initial_research = [f"Source Article: {t}\nSummary: {s}" for t, s, d, l in articles]
            source_data = [{"domain": d, "link": l} for t, s, d, l in articles]
            
            inputs = {
                "cluster_id": str(c_id),
                "run_id": str(uuid.uuid4()),
                "headline": main_headline,
                "research_notes": initial_research,
                "source_data": source_data,
                "turn_count": 0,
                "status": "researching"
            }
            
            print(f"--- [Thread] Invoking Agent Analysis for {c_id} ---")
            final_state = agent_app.invoke(inputs)
            
            s_text = final_state.get("final_report", "Agent Error")
            r_score = final_state.get("risk_score", 5)
            i_analysis = final_state.get("impact_analysis", "")
            s_metadata = final_state.get("source_analysis", [])
            
            with summary_lock:
                new_summaries.append((
                    str(c_id), 
                    s_text, 
                    r_score, 
                    i_analysis,
                    psycopg2.extras.Json(s_metadata)
                ))
            
            t_conn.close()
            print(f"--- [Thread] Finished {c_id} ---")
            
        except Exception as e:
            print(f"!!! [Thread Error] Cluster {c_id}: {e}")

    # Process 3 clusters at a time (Safety for Tavily Free + Gemini Paid)
    with ThreadPoolExecutor(max_workers=3) as executor:
        executor.map(process_cluster, cluster_ids)
    
    # 3. Batch Save
    if new_summaries:
        print(f"Saving {len(new_summaries)} summaries to DB...")
        cursor.executemany(
            "INSERT INTO cluster_summaries (cluster_id, summary_text, risk_score, impact_analysis, source_metadata) VALUES (%s, %s, %s, %s, %s) ON CONFLICT (cluster_id) DO NOTHING",
            new_summaries
        )
        conn.commit()
    
    conn.close()
    return Output(len(new_summaries), metadata={"Generated Summaries": len(new_summaries)})

# --- JOB DEFINITIONS ---
summarize_job = define_asset_job(name="summarize_news_job", selection=["new_cluster_summaries"])

# --- SENSORS ---
@run_status_sensor(
    run_status=DagsterRunStatus.SUCCESS,
    monitor_all_code_locations=True,
    request_job=summarize_job,
    default_status=DefaultSensorStatus.RUNNING
)
def trigger_summarize_on_process_success(context):
    print(f"--- Sensor Callback: Detected {context.dagster_run.job_name} (Run ID: {context.dagster_run.run_id}) ---")
    if context.dagster_run.job_name == "process_news_job":
        print(f"!!! MATCH! Yielding RunRequest for summarize_news_job !!!")
        yield RunRequest(job_name="summarize_news_job")
    else:
        yield SkipReason(f"Skipping: Job '{context.dagster_run.job_name}' is not 'process_news_job'")

defs = Definitions(
    assets=[new_cluster_summaries],
    jobs=[summarize_job],
    sensors=[trigger_summarize_on_process_success]
)
