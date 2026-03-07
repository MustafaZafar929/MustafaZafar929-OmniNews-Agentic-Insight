import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def check_db():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not found")
        return
    
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        cur.execute("SELECT count(*) FROM articles WHERE embedding IS NULL")
        null_embeddings = cur.fetchone()[0]
        
        cur.execute("SELECT count(*) FROM articles WHERE cluster_id IS NULL AND embedding IS NOT NULL")
        null_clusters = cur.fetchone()[0]
        
        cur.execute("SELECT count(*) FROM cluster_summaries")
        summary_count = cur.fetchone()[0]
        
        cur.execute("SELECT title, cluster_id FROM articles WHERE cluster_id IS NOT NULL LIMIT 10")
        clustered_samples = cur.fetchall()
        
        print(f"Articles with NULL embedding: {null_embeddings}")
        print(f"Articles with NULL cluster_id (but embedded): {null_clusters}")
        print(f"Total Summaries: {summary_count}")
        print(f"Sample clustered articles: {clustered_samples}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_db()
