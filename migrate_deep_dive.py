import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def migrate():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("❌ DATABASE_URL not found.")
        return

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        print("🚀 Adding investigative columns to cluster_summaries...")
        
        # Add investigative_report column (TEXT)
        cur.execute("ALTER TABLE cluster_summaries ADD COLUMN IF NOT EXISTS investigative_report TEXT;")
        
        # Add is_investigating column (BOOLEAN)
        cur.execute("ALTER TABLE cluster_summaries ADD COLUMN IF NOT EXISTS is_investigating BOOLEAN DEFAULT FALSE;")
        
        conn.commit()
        print("✅ Migration successful!")
        
        cur.close()
        conn.close()
    except Exception as e:
        print(f"❌ Migration failed: {e}")

if __name__ == "__main__":
    migrate()
