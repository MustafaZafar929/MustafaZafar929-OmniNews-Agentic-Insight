import { createClient } from '@supabase/supabase-js';
// import { pipeline } from '@xenova/transformers';
import axios from 'axios';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Critical Error: Supabase URL or Anon Key is missing from environment variables.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cache for the embedding pipeline
let embeddingPipeline = null;

const getEmbedding = async (text) => {
    // Dummy embedding for testing
    return new Array(384).fill(0);
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
            match_count: 3
        });

        if (rpcError) throw rpcError;

        const context = articles.map(a => `Title: ${a.title}\nInfo: ${a.content_summary}`).join('\n\n');

        if (!OPENROUTER_API_KEY) {
            return { response: `Context Found:\n${context}\n\n(Configure OPENROUTER_API_KEY to get an AI answer)` };
        }

        // 3. Call OpenRouter directly from browser
        const prompt = `
            Answer the user's question based ONLY on the news context provided. 
            If it's not in the context, say you don't know based on current briefings.
            
            Context:
            ${context}
            
            Question: ${message}
        `;

        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: 'anthropic/claude-3-haiku',
            messages: [{ role: 'user', content: prompt }]
        }, {
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        return { response: response.data.choices[0].message.content, context };

    } catch (err) {
        console.error("Copilot Error:", err);
        throw err;
    }
};

export default supabase;
