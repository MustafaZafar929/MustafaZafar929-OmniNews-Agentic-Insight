import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def migrate():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("❌ DATABASE_URL not found in environment.")
        return

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        print("🚀 Adding narrative_duel column and is_debating flag...")
        
        # Add narrative_duel column (JSONB for structured dual-reports)
        # Add is_debating flag to track pulse in UI
        cur.execute("""
            ALTER TABLE cluster_summaries 
            ADD COLUMN IF NOT EXISTS narrative_duel JSONB,
            ADD COLUMN IF NOT EXISTS is_debating BOOLEAN DEFAULT FALSE;
        """)
        
        conn.commit()
        cur.close()
        conn.close()
        print("✅ Migration successful: Multi-Agent Narrative Duel schema ready.")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")

if __name__ == "__main__":
    migrate()
