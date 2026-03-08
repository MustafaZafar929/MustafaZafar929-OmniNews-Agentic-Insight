import os
import psycopg2
import psycopg2.extras
import uuid
import time
import threading
import json
from concurrent.futures import ThreadPoolExecutor
from agents.graph import app as agent_app
from dagster import asset, Output, Definitions, define_asset_job, AssetKey, asset_sensor, RunRequest, DefaultSensorStatus
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
    Scout Filter: Strictly prioritizes high-stakes Geopolitics, Economy, and Security.
    """
    h = headline.lower()
    
    # 1. High-Priority Zones & Topics (Geopolitical, Economy, Tech, Security)
    priority = [
        'war', 'conflict', 'military', 'missile', 'strike', 'nuclear', 'security',
        'iran', 'israel', 'palestine', 'gaza', 'lebanon', 'hezbollah', 'hamas',
        'russia', 'ukraine', 'china', 'taiwan', 'usa', 'biden', 'trump', 'election',
        'nato', 'summit', 'diplomatic', 'sanction', 'treaty', 'pentagon', 'kremlin',
        'oil', 'energy', 'brent', 'crude', 'inflation', 'economy', 'fed', 'interest rate',
        'employment', 'jobs report', 'stock market', 'nasdaq', 'sp500', 'recession',
        'cyberattack', 'intelligence', 'cia', 'mossad', 'fsb', 'espionage',
        'anthropic', 'openai', 'ai ', 'artificial intelligence', 'microsoft', 'google', 'alphabet', 
        'tech ', 'silicon valley', 'semiconductor', 'chip', 'regulation', 'antitrust',
        'disaster', 'flood', 'tornado', 'earthquake', 'casualty', 'humanitarian', 'refugee',
        'un ', 'united nations', 'human rights', 'policy', 'safety', 'fda', 'agency',
        'protest', 'unrest', 'riot', 'coup', 'stability'
    ]
    
    # 2. Hard-Ignore Blocks (Noise/Gossip/Lifestyle)
    ignore = [
        'celebrity', 'hollywood', 'kardashian', 'movie', 'actor', 'singer', 'award', 
        'red carpet', 'romance', 'dating', 'fashion', 'gossip', 'entertainment', 'tiktok', 'box office',
        'sports', 'nba', 'nfl', 'football', 'cricket', 'score', 'half-time', 'lifestyle', 'travel'
    ]

    # Special Case: Allow gossip ONLY if tied to high-stakes corruption/politics
    exceptions = ['epstein', 'corruption', 'scandal', 'indictment', 'bribery', 'investigation']
    
    # Logic:
    # If it has a priority word, it's almost always a GO.
    if any(word in h for word in priority):
        return True

    # If it hits an ignore word BUT has a political exception word, it's a GO.
    if any(word in h for word in ignore):
        if any(exc in h for exc in exceptions):
            return True
        return False
            
    # If it doesn't hit any priority or ignore words, we allow it (Soft pass for LLM vetting)
    return True

def find_matching_narrative(cursor, headline):
    """
    Tries to find a narrative_id from a recent cluster (last 7 days) 
    that matches the current headline.
    """
    # Simple keyword-based matching for now
    # We strip common words and check for overlaps
    words = set(headline.lower().split())
    ignore = {'the', 'a', 'in', 'on', 'at', 'for', 'with', 'and', 'over', 'reported', 'says', 'new'}
    keywords = [w for w in words if len(w) > 3 and w not in ignore]
    
    if not keywords: return str(uuid.uuid4())
    
    # Check for recent clusters with overlapping keywords in headline
    # We use a simple ILIKE search for the most unique-looking keyword
    best_keyword = max(keywords, key=len)
    
    query = """
        SELECT narrative_id 
        FROM cluster_summaries 
        WHERE summary_text ILIKE %s 
        AND generated_at > NOW() - INTERVAL '7 days'
        AND narrative_id IS NOT NULL
        LIMIT 1;
    """
    cursor.execute(query, (f"%{best_keyword}%",))
    row = cursor.fetchone()
    
    if row:
        print(f"--- [Linker] Found existing narrative for '{best_keyword}': {row[0]} ---")
        return row[0]
    
    return str(uuid.uuid4())

@asset
def new_cluster_summaries():
    """
    Finds clusters needing summaries and processes them IN PARALLEL.
    """
    conn = get_db_conn()
    cursor = conn.cursor()

    # 1. Find clusters needing summaries (LIMIT 15 to keep jobs responsive)
    query = """
        SELECT DISTINCT a.cluster_id
        FROM articles a
        WHERE a.cluster_id IS NOT NULL
        EXCEPT
        SELECT cluster_id FROM cluster_summaries
        LIMIT 15;
    """
    cursor.execute(query)
    cluster_ids = [row[0] for row in cursor.fetchall()]

    if not cluster_ids:
        print("No new clusters to summarize.")
        conn.close()
        return Output(0, metadata={"status": "No work"})

    total_clusters = len(cluster_ids)
    print(f"Found {total_clusters} clusters to summarize. Starting Parallel Execution (Batch Size: 15)...")

    # 2. Parallel Processing Logic
    incremental_count = 0
    progress_lock = threading.Lock()
    
    def process_cluster(c_id, index):
        nonlocal incremental_count
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
                print(f"--- [Cluster {index+1}/{total_clusters}] Skipping {c_id}: Editorial ---")
                t_cursor.execute(
                    "INSERT INTO cluster_summaries (cluster_id, summary_text) VALUES (%s, %s) ON CONFLICT (cluster_id) DO NOTHING",
                    (str(c_id), f"Skipped: Editorial Filter. Category: {main_headline}")
                )
                t_conn.commit()
                t_conn.close()
                with progress_lock:
                    incremental_count += 1
                return

            # --- NARRATIVE LINKING ---
            n_id = find_matching_narrative(t_cursor, main_headline)

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
            
            print(f"--- [Cluster {index+1}/{total_clusters}] Invoking Agent Analysis for {c_id} ---")
            final_state = agent_app.invoke(inputs)
            
            s_text = final_state.get("final_report", "Agent Error")
            r_score = final_state.get("risk_score", 5)
            i_analysis = final_state.get("impact_analysis", "")
            s_metadata = final_state.get("source_analysis", [])
            k_entities = final_state.get("key_entities", {})
            
            # --- Incremental Save ---
            t_cursor.execute(
                "INSERT INTO cluster_summaries (cluster_id, summary_text, risk_score, impact_analysis, source_metadata, key_entities, narrative_id) VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (cluster_id) DO NOTHING",
                (
                    str(c_id), 
                    s_text, 
                    r_score, 
                    i_analysis,
                    psycopg2.extras.Json(s_metadata),
                    psycopg2.extras.Json(k_entities),
                    n_id
                )
            )
            t_conn.commit()
            t_conn.close()
            
            with progress_lock:
                incremental_count += 1
            print(f"--- [Cluster {index+1}/{total_clusters}] Finished and Saved {c_id} ---")
            
        except Exception as e:
            print(f"!!! [Thread Error] Cluster {c_id}: {e}")

    # Process 3 clusters at a time
    with ThreadPoolExecutor(max_workers=3) as executor:
        for i, c_id in enumerate(cluster_ids):
            executor.submit(process_cluster, c_id, i)
    
    conn.close()
    return Output(incremental_count, metadata={"Generated Summaries": incremental_count})

# --- JOB DEFINITIONS ---
summarize_job = define_asset_job(name="summarize_news_job", selection=["new_cluster_summaries"])

# --- SENSORS ---
@asset_sensor(
    asset_key=AssetKey("topic_clusters"),
    job=summarize_job,
    default_status=DefaultSensorStatus.RUNNING
)
def trigger_summarize_on_clusters(context, asset_event):
    print(f"--- Asset Sensor: detected update for topic_clusters. Requesting summarize_news_job. ---")
    yield RunRequest(
        run_key=context.cursor,
        job_name="summarize_news_job"
    )

defs = Definitions(
    assets=[new_cluster_summaries],
    jobs=[summarize_job],
    sensors=[trigger_summarize_on_clusters]
)
