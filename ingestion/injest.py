import feedparser
import psycopg2
import os
import requests
from datetime import datetime, timedelta, timezone
from time import mktime
from dagster import asset, Output, Definitions, ScheduleDefinition, define_asset_job
from dotenv import load_dotenv

load_dotenv()


# --- CONFIGURATION ---
RSS_FEEDS = [

    # ---- Global Straight / Wire ----
    "https://www.reuters.com/rssFeed/worldNews",
    "https://www.reuters.com/rssFeed/businessNews",
    "https://apnews.com/apf-topnews?format=rss",
    "https://feeds.bbci.co.uk/news/rss.xml",
    "https://feeds.npr.org/1001/rss.xml",
    "https://rss.cnn.com/rss/edition_world.rss",
    "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    "https://www.france24.com/en/rss",
    "https://www.voanews.com/api/epiqq",
    "https://www.straitstimes.com/news/world/rss.xml",
    "https://www.scmp.com/rss/91/feed",

    # ---- Center-Left / International ----
    "https://www.aljazeera.com/xml/rss/all.xml",
    "https://www.theguardian.com/world/rss",
    "https://www.dw.com/en/top-stories/rss",
    "https://www.ft.com/world?format=rss",

    # ---- Left / Progressive ----
    "https://www.msnbc.com/feeds/latest",
    "https://www.thenation.com/feed/",
    "https://truthout.org/feed/",
    "https://www.democracynow.org/democracynow.rss",

    # ---- Center-Right ----
    "https://www.wsj.com/xml/rss/3_7031.xml",
    "https://www.economist.com/rss",
    "https://www.politico.com/rss/politics08.xml",
    "https://thehill.com/rss/syndicator/19110",

    # ---- Right / Conservative ----
    "https://moxie.foxnews.com/google-publisher/latest.xml",
    "https://www.washingtontimes.com/rss/headlines/news/",
    "https://www.nationalreview.com/feed/",
    "https://dailycaller.com/feed/",

    # ---- Independent / Investigative ----
    "https://theintercept.com/feed/?rss",
    "https://www.propublica.org/rss/all.rss",
    "https://www.icij.org/feed/",
    "https://www.bellingcat.com/feed/",
    "https://www.opendemocracy.net/en/rss.xml",
    "https://consortiumnews.com/feed/",
    "https://www.mintpressnews.com/feed/",

    # ---- Economy / Markets / Energy ----
    "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    "https://www.cnbc.com/id/15839072/device/rss/rss.html", # Economy
    "https://www.bloomberg.com/politics/feeds/site.xml",
    "https://oilprice.com/rss/main",
    "https://www.marketwatch.com/rss/topstories",
    "https://www.investing.com/rss/news.rss",
    
    # ---- Middle East Depth (Iran / Israel / Arab Space) ----
    "https://www.tehrantimes.com/rss",
    "https://www.timesofisrael.com/feed/",
    "https://www.haaretz.com/cmlink/1.4624422",
    "https://www.anews.com.tr/rss/world",
    "https://www.jordantimes.com/rss",
    "https://www.dailysabah.com/rss/world.xml",

    # ---- Geopolitics / Conflict / Security ----
    "https://www.foreignaffairs.com/rss.xml",
    "https://foreignpolicy.com/feed/",
    "https://www.crisisgroup.org/rss.xml",
    "https://www.defensenews.com/arc/outboundfeeds/rss/",
    "https://jamestown.org/feed/",
    "https://www.mei.edu/rss.xml",
    "https://www.atlanticcouncil.org/feed/",
    "https://www.chathamhouse.org/rss.xml",

    # ---- Think Tanks / Policy ----
    "https://www.brookings.edu/feed/",
    "https://www.cfr.org/rss",
    "https://carnegieendowment.org/rss",
    "https://www.usip.org/rss.xml",
    "https://www.csis.org/rss.xml",

    # ---- Pakistan Mainstream ----
    "https://www.dawn.com/feeds/home",
    "https://tribune.com.pk/feed",
    "https://www.thenews.com.pk/rss/1/1",
    "https://nation.com.pk/rss",
    "https://www.brecorder.com/rss",
    "https://www.pakistantoday.com.pk/feed/",
    "https://www.geo.tv/rss/1/1",
    "https://arynews.tv/en/feed/",
    "https://www.samaa.tv/rss.xml",
    "https://www.dailytimes.com.pk/feed/",

    # ---- Pakistan Independent / Opinion ----
    "https://www.thefridaytimes.com/feed/",
    "https://nayadaur.tv/feed/",
    "https://humenglish.com/feed/",

    # ---- South Asia Regional ----
    "https://www.thehindu.com/news/international/feeder/default.rss",
    "https://indianexpress.com/feed/",
    "https://www.hindustantimes.com/feeds/rss/world-news/rssfeed.xml",
    "https://tolonews.com/rss",
    "https://www.pajhwok.com/en/rss.xml",
    "https://www.thedailystar.net/frontpage/rss.xml",

    # ---- Non-Western / State-Backed ----
    "https://www.rt.com/rss/",
    "https://sputniknews.com/export/rss2/archive/index.xml",
    "https://english.news.cn/rss/worldrss.xml",
    "https://www.presstv.ir/rss",
    "https://www.globaltimes.cn/rss/outbrain.xml",
    "https://www.tasnimnews.com/en/rss/all", # Iranian Agency
    "https://en.mehrnews.com/rss" # Iranian Agency
]


def get_db_conn():
    """Establishes a connection to Supabase using the Env Var"""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL is missing!")
    return psycopg2.connect(db_url)

@asset
def raw_news_articles():
    """
    Scrapes RSS feeds, FILTERS out old news, and saves to Postgres.
    """
    conn = get_db_conn()
    cursor = conn.cursor()
    
    # 1. Define the Cutoff (7 Days ago for wider analysis)
    # 24 hours is too strict for think tanks and long-form analysis.
    # ON CONFLICT (link) DO NOTHING ensures we don't duplicate.
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=7)
    print(f"Filtering articles older than: {cutoff_date}")

    total_inserted = 0
    
    for feed_url in RSS_FEEDS:
        print(f"Scraping: {feed_url}")
        try:
            # We use requests with a timeout to prevent hanging and IncompleteRead
            # Some servers are flaky; requests handles certain edge cases better than feedparser's internal client
            response = requests.get(feed_url, timeout=15, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"})
            response.raise_for_status()
            feed = feedparser.parse(response.content)
        except Exception as e:
            print(f"Failed to fetch {feed_url}: {e}")
            continue
        
        if feed.bozo:
             print(f"Warning: {feed_url} returned malformed XML (Bozo bit set)")
        
        for entry in feed.entries:
            # --- Fallback for Missing Dates ---
            if hasattr(entry, 'published_parsed') and entry.published_parsed:
                article_dt = datetime.fromtimestamp(mktime(entry.published_parsed), timezone.utc)
            else:
                # If no date, we use current time as a fallback so it's ingestible
                # but only if it's a truly new link.
                article_dt = datetime.now(timezone.utc)

            # The Gatekeeper: If it's old, skip it.
            if article_dt < cutoff_date:
                continue

            # --- Data Preparation ---
            title = entry.get('title', '')
            link = entry.get('link', '')
            summary = entry.get('summary', '')
            source_domain = feed_url.split('/')[2] # naive domain extraction
            
            # --- Insertion ---
            # We use ON CONFLICT DO NOTHING to ensure we don't crash if we
            # pick up the same article twice in one day.
            # (Requires a UNIQUE constraint on 'link' or 'title' in your DB)
            try:
                cursor.execute("""
                    INSERT INTO articles (title, content_summary, source_domain, published_date, link)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (link) DO NOTHING; 
                """, (title, summary, source_domain, article_dt, link))
                
                # Check if a row was actually inserted
                if cursor.rowcount > 0:
                    total_inserted += 1
                    
            except Exception as e:
                print(f"Error inserting {title}: {e}")
                conn.rollback() # Reset transaction on error
                continue

    conn.commit()
    conn.close()

    return Output(
        total_inserted, 
        metadata={
            "New Articles": total_inserted, 
            "Sources Scraped": len(RSS_FEEDS)
        }
    )

# --- JOB & SCHEDULE ---
news_job = define_asset_job(name="ingest_news_job", selection=["raw_news_articles"])

news_schedule = ScheduleDefinition(
    job=news_job,
    cron_schedule="0 8,16 * * *", 
    execution_timezone="Asia/Karachi",
    name="bi_daily_ingestion"
)

defs = Definitions(
    assets=[raw_news_articles],
    jobs=[news_job],
    schedules=[news_schedule]
)





# ... (End of your existing code) ...

# Add this at the bottom to allow running via "python ingest_job.py"
if __name__ == "__main__":
    from dagster import materialize
    import os
    
    # Load env vars manually for local testing if not set
    # (Or make sure you have your .env file in the same folder)
    if not os.getenv("DATABASE_URL"):
        print("⚠️ WARNING: DATABASE_URL not found. Setting manually for test...")
        # Paste your Supabase URL here for testing ONLY
        os.environ["DATABASE_URL"] = "postgresql://postgres.xxxx:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require"

    print("🚀 Starting local test run...")
    result = materialize([raw_news_articles])
    
    if result.success:
        print("✅ Success!")
    else:
        print("❌ Failed!")