import os
import psycopg2
from typing import List, Dict, Any
from langchain_core.tools import tool
from tavily import TavilyClient
from sentence_transformers import SentenceTransformer

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# --- Configuration ---
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")
EMBEDDING_MODEL_NAME = 'all-MiniLM-L6-v2'

# Global model instance (lazy load)
_model = None

def get_model():
    global _model
    if _model is None:
        print(f"Loading embedding model {EMBEDDING_MODEL_NAME}...")
        _model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    return _model

def get_db_conn():
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL is missing!")
    return psycopg2.connect(DATABASE_URL)

# --- Tools ---

@tool
def web_search(query: str) -> str:
    """
    Search the web for real-time news and information using Tavily.
    Returns a summarized string of the top results.
    """
    if not TAVILY_API_KEY:
        return "Error: TAVILY_API_KEY not configured."

    try:
        client = TavilyClient(api_key=TAVILY_API_KEY)
        response = client.search(query, search_depth="basic", max_results=3)
        
        results = []
        for result in response.get("results", []):
            title = result.get("title", "No Title")
            content = result.get("content", "No Content")
            url = result.get("url", "#")
            results.append(f"Title: {title}\nSource: {url}\nContent: {content}\n")
            
        return "\n---\n".join(results)
    except Exception as e:
        return f"Error performing search: {e}"

@tool
def retrieve_similar_articles(query: str) -> str:
    """
    Search the local vector database for historically similar articles.
    Useful for getting context on ongoing events.
    """
    try:
        model = get_model()
        query_vec = model.encode(query).tolist()
        
        conn = get_db_conn()
        cursor = conn.cursor()
        
        # Determine the vector column name. 
        # In init.sql if we used standard pgvector, often '<->' operator is used
        # We assume the table is 'articles' and column is 'embedding'
        sql = """
            SELECT title, content_summary, published_date, 1 - (embedding <=> %s::vector) as similarity
            FROM articles
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> %s::vector
            LIMIT 3;
        """
        cursor.execute(sql, (query_vec, query_vec))
        rows = cursor.fetchall()
        conn.close()
        
        if not rows:
            return "No relevant past articles found."
            
        results = []
        for row in rows:
            title, summary, date, sim = row
            results.append(f"Title: {title} (Date: {date})\nSummary: {summary}\n")
            
        return "\n---\n".join(results)
        
    except Exception as e:
        return f"Error retrieving articles: {e}"

def log_agent_step(cluster_id: str, agent_name: str, step: int, thought: str, action: str, run_id: str = None):
    """
    Logs the agent's internal state to the database for debugging/transparency.
    """
    try:
        conn = get_db_conn()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO agent_logs (cluster_id, agent_name, step_number, thought_process, action_taken, run_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (cluster_id, agent_name, step, thought, action, run_id)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"CRITICAL: Failed to log agent step for cluster {cluster_id}: {e}")
