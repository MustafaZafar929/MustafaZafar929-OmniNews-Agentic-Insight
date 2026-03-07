import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def migrate():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not found")
        return

    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        print("Adding narrative_id column to cluster_summaries...")
        cursor.execute("ALTER TABLE cluster_summaries ADD COLUMN IF NOT EXISTS narrative_id UUID;")
        conn.commit()
        print("Migration successful!")
        conn.close()
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
