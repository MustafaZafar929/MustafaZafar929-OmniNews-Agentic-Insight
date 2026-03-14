import { createClient } from '@supabase/supabase-js';
import { pipeline, env } from '@xenova/transformers';

import axios from 'axios';

// Fix: Ensure Transformers.js doesn't try to load models from the local Vite server
// which would return HTML fallback (index.html) and cause SyntaxError
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.remoteHost = 'https://huggingface.co/';
env.remotePathTemplate = '{model}/resolve/{revision}/';
// Set an invalid local path to definitely fail if local loading is attempted
env.localModelPath = '/NON_EXISTENT_PATH_FORCE_REMOTE/'; 

console.log("Transformers API Env Status:", {
    allowLocalModels: env.allowLocalModels,
    remoteHost: env.remoteHost,
    localPath: env.localModelPath
});

// Debug interceptor
axios.interceptors.request.use(request => {
    console.log('Outgoing Request:', request.method.toUpperCase(), request.url);
    return request;
});

axios.interceptors.response.use(
    response => response,
    error => {
        console.error('Axios Error Details:', {
            url: error.config?.url,
            status: error.response?.status,
            data: typeof error.response?.data === 'string' ? error.response.data.substring(0, 100) : 'JSON data'
        });
        return Promise.reject(error);
    }
);

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';
const GOOGLE_AI_STUDIO_API_KEY = import.meta.env.VITE_GOOGLE_AI_STUDIO_API_KEY || '';

console.log("Vite Env Check:", {
    SUPABASE_URL: !!SUPABASE_URL,
    SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY,
    GOOGLE_KEY: !!GOOGLE_AI_STUDIO_API_KEY
});

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Critical Error: Supabase URL or Anon Key is missing from environment variables.");
}

// Ensure URL is valid and doesn't point to local dev server accidentally
if (SUPABASE_URL && SUPABASE_URL.includes("localhost")) {
    console.warn("Warning: SUPABASE_URL is pointing to localhost. This might fail in Docker unless using specific host mapping.");
}

export const supabase = createClient(SUPABASE_URL || "https://placeholder.supabase.co", SUPABASE_ANON_KEY || "placeholder");

// Cache for the embedding pipeline
let embeddingPipeline = null;

const getEmbedding = async (text) => {
    if (!embeddingPipeline) {
        console.log("Initializing Embedding Pipeline with Env:", {
            allowLocal: env.allowLocalModels,
            remoteHost: env.remoteHost
        });
        // Load the model from Xenova for in-browser embeddings
        embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    
    // Process text
    const result = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
    
    // Return array representation of the Float32Array tensor data
    return Array.from(result.data);
};

export const getBriefings = async () => {
    const { data, error } = await supabase
        .from('cluster_summaries')
        .select('*')
        .order('generated_at', { ascending: false })
        .limit(20);

    if (error) throw error;
    return data;
};

export const getNarrativeBriefings = async (narrativeId) => {
    if (!narrativeId) return [];
    const { data, error } = await supabase
        .from('cluster_summaries')
        .select('generated_at, risk_score, cluster_id, summary_text')
        .eq('narrative_id', narrativeId)
        .order('generated_at', { ascending: true });

    if (error) throw error;
    return data;
};

export const getLogs = async (clusterId) => {
    const { data, error } = await supabase
        .from('agent_logs')
        .select('*')
        .eq('cluster_id', clusterId)
        .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
};

export const chatWithCopilot = async (message) => {
    try {
        // 1. Generate local embedding
        const embedding = await getEmbedding(message);

        // 2. Vector search via RPC
        const { data: articles, error: rpcError } = await supabase.rpc('match_articles', {
            query_embedding: embedding,
            match_threshold: 0.1, // Adjust as needed
            match_count: 5 // get slightly more context
        });

        if (rpcError) throw rpcError;

        const context = articles.map(a => `Title: ${a.title}\nInfo: ${a.content_summary}`).join('\n\n');

        if (!GOOGLE_AI_STUDIO_API_KEY) {
            return { response: `Context Found:\n${context}\n\n(Configure VITE_GOOGLE_AI_STUDIO_API_KEY to get an AI answer)` };
        }

        // 3. Call Google Gemini directly from browser
        const prompt = `
            You are a highly intelligent News Copilot.
            Answer the user's question with detail and insight based ONLY on the news context provided. 
            Do NOT provide extremely brief answers. Give comprehensive but concise answers.
            If the answer is not in the context, clearly state that you do not have enough information based on current briefings.
            
            Context:
            ${context}
            
            Question: ${message}
        `;

        const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GOOGLE_AI_STUDIO_API_KEY}`, {
            contents: [{ parts: [{ text: prompt }] }]
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Parse Gemini response format
        const responseText = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
        
        return { response: responseText, context };

    } catch (err) {
        console.error("Copilot Error:", err);
        throw err;
    }
};

export const launchInvestigation = async (clusterId) => {
    try {
        const response = await axios.post(`/api/investigate/${clusterId}`);
        return response.data;
    } catch (err) {
        console.error("Investigation Error:", err);
        throw err;
    }
};

export const launchDebate = async (clusterId) => {
    try {
        const response = await axios.post(`/api/debate/${clusterId}`);
        return response.data;
    } catch (err) {
        console.error("Debate Error:", err);
        throw err;
    }
};

export default supabase;
