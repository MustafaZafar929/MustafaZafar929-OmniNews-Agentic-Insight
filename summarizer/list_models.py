import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GOOGLE_AI_STUDIO_API_KEY")

if not api_key:
    print("Error: GOOGLE_AI_STUDIO_API_KEY not found.")
else:
    genai.configure(api_key=api_key)
    try:
        print("Listing available models...")
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(f"Model: {m.name}, Display Name: {m.display_name}")
    except Exception as e:
        print(f"Error listing models: {e}")
