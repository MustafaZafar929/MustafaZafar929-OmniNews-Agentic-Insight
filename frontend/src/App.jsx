import React, { useState, useEffect } from 'react';
import { LayoutDashboard, MessageSquare, Shield, Activity, Search, Globe, ChevronRight, AlertTriangle, ExternalLink, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getBriefings, getLogs, chatWithCopilot, supabase } from './api';
import ReactMarkdown from 'react-markdown';

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${active
      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
      : 'text-gray-400 hover:bg-white/5 hover:text-white'
      }`}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
    {active && <motion.div layoutId="active" className="ml-auto"><ChevronRight size={16} /></motion.div>}
  </button>
);

const MediaBiasSpectrum = ({ sources }) => {
  if (!sources || sources.length === 0) return null;

  const biasCounts = { left: 0, center: 0, right: 0 };
  sources.forEach(s => {
    const b = (s.bias || 'center').toLowerCase();
    if (biasCounts[b] !== undefined) biasCounts[b]++;
    else biasCounts.center++;
  });

  const total = sources.length;
  const leftPct = (biasCounts.left / total) * 100;
  const centerPct = (biasCounts.center / total) * 100;
  const rightPct = (biasCounts.right / total) * 100;

  return (
    <div className="mt-6 pt-6 border-t border-white/5">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-cyan-500/80 flex items-center gap-2">
          <BarChart3 size={14} className="text-cyan-400" /> Media Narrative Landscape
        </h4>
        <div className="flex gap-4 text-[9px] font-bold font-mono">
          <span className="flex items-center gap-1.5 text-blue-400">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" /> LEFT
          </span>
          <span className="flex items-center gap-1.5 text-gray-400">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-500" /> CENTER
          </span>
          <span className="flex items-center gap-1.5 text-red-400">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" /> RIGHT
          </span>
        </div>
      </div>

      {/* Premium Spectrum Bar */}
      <div className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden flex shadow-inner">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${leftPct}%` }}
          className="h-full bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.3)]"
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${centerPct}%` }}
          className="h-full bg-gray-500/30"
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${rightPct}%` }}
          className="h-full bg-gradient-to-l from-red-600 to-red-400 shadow-[0_0_10px_rgba(239,68,68,0.3)]"
        />
      </div>

      {/* Source Chips */}
      <div className="flex flex-wrap gap-2 mt-4">
        {sources.sort((a, b) => {
          const order = { left: 1, center: 2, right: 3 };
          return order[a.bias] - order[b.bias];
        }).map((source, i) => (
          <a
            key={i}
            href={source.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all group hover:scale-105"
          >
            <div className={`w-1.5 h-1.5 rounded-full ${source.bias === 'left' ? 'bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]' :
                source.bias === 'right' ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 'bg-gray-500'
              }`} />
            <span className="text-[10px] font-medium text-gray-400 group-hover:text-white capitalize tracking-tight">{source.domain}</span>
            <ExternalLink size={10} className="text-gray-600 group-hover:text-cyan-500 transition-colors" />
          </a>
        ))}
      </div>
    </div>
  );
};

const BriefingCard = ({ briefing }) => {
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const fetchLogs = async () => {
    if (!showLogs && logs.length === 0) {
      setLoadingLogs(true);
      try {
        const data = await getLogs(briefing.cluster_id);
        setLogs(data);
      } catch (err) {
        console.error("Failed to fetch logs", err);
      }
      setLoadingLogs(false);
    }
    setShowLogs(!showLogs);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6 rounded-2xl mb-6 border-l-4"
      style={{ borderLeftColor: briefing.risk_score >= 7 ? '#ef4444' : briefing.risk_score >= 4 ? '#f59e0b' : '#10b981' }}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-500/70">
            <Globe size={14} />
            <span>{new Date(briefing.generated_at).toLocaleString()}</span>
          </div>
          {briefing.risk_score && (
            <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider ${briefing.risk_score >= 7 ? 'text-red-500' : briefing.risk_score >= 4 ? 'text-amber-500' : 'text-emerald-500'}`}>
              <AlertTriangle size={12} />
              Stability Index: {briefing.risk_score}/10
            </div>
          )}
        </div>
        <button
          onClick={fetchLogs}
          className="text-xs font-mono px-3 py-1 rounded-full border border-white/10 hover:border-cyan-500/50 transition-all"
        >
          {showLogs ? 'Hide Intelligence Logs' : 'View Intelligence Logs'}
        </button>
      </div>

      <div className="prose prose-invert max-w-none prose-sm mb-4">
        <ReactMarkdown>{briefing.summary_text}</ReactMarkdown>
      </div>

      {briefing.impact_analysis && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-cyan-500 mb-2 flex items-center gap-2">
            <Shield size={12} /> Strategic Impact Analysis
          </h4>
          <p className="text-xs text-gray-400 leading-relaxed italic">
            {briefing.impact_analysis}
          </p>
        </div>
      )}

      <MediaBiasSpectrum sources={briefing.source_metadata} />

      <AnimatePresence>
        {showLogs && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-6 pt-6 border-t border-white/5"
          >
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4 flex items-center gap-2">
              <Activity size={14} /> Multi-Agent Thought Process
            </h4>
            {loadingLogs ? (
              <div className="animate-pulse flex gap-2 items-center text-gray-600 text-xs">
                <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                Retrieving agent memory...
              </div>
            ) : (
              <div className="space-y-4">
                {logs.map((log, i) => (
                  <div key={i} className="bg-black/40 rounded-lg p-3 border border-white/5">
                    <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                      <span className="text-cyan-400">{log.agent_name}</span>
                      <span className="text-gray-600">Step {log.step_number}</span>
                    </div>
                    <p className="text-xs text-gray-300 italic mb-2">"{log.thought_process}"</p>
                    <div className="text-[10px] font-mono text-cyan-500/50 bg-cyan-500/5 p-1 rounded">
                      {log.action_taken}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const Copilot = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const data = await chatWithCopilot(input);
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Error communicating with intelligence backend." }]);
    }
    setLoading(false);
  };

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      <div className="flex-1 overflow-y-auto space-y-4 pr-4 custom-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center p-10">
            <MessageSquare size={48} className="mb-4 opacity-20" />
            <p className="text-sm">Ask the OmniNews Copilot about recent events.<br />The agent will search verified briefings to answer.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <motion.div
            initial={{ opacity: 0, x: m.role === 'user' ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] p-4 rounded-2xl ${m.role === 'user'
              ? 'bg-cyan-500/10 border border-cyan-500/20 text-white'
              : 'glass-card text-gray-200'
              }`}>
              <ReactMarkdown className="prose prose-invert prose-sm">{m.content}</ReactMarkdown>
            </div>
          </motion.div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="glass-card p-4 rounded-2xl animate-pulse text-xs text-gray-500 italic">
              Agent is searching memory...
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask about global security, tech trends, or conflicts..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500/50 transition-all placeholder:text-gray-600"
        />
        <button
          onClick={handleSend}
          className="bg-cyan-500 hover:bg-cyan-400 text-black px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2"
        >
          <Search size={18} />
          Search
        </button>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState('feed');
  const [briefings, setBriefings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const data = await getBriefings();
        setBriefings(data);
      } catch (err) {
        console.error("Failed to fetch briefings", err);
      }
      setLoading(false);
    };

    fetchInitialData();

    // --- REALTIME SUBSCRIPTION ---
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'cluster_summaries'
        },
        (payload) => {
          console.log('Real-time Briefing Received:', payload.new);
          // Prepend the new briefing to the list
          setBriefings(prev => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="min-h-screen w-full bg-[#050505] text-gray-100 flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/5 flex flex-col p-6 glass">
        <div className="flex items-center gap-3 mb-10 px-2 transition-transform hover:scale-105 cursor-pointer">
          <div className="w-10 h-10 bg-cyan-500 rounded-lg flex items-center justify-center neon-border">
            <Shield className="text-black" size={24} />
          </div>
          <div>
            <h1 className="font-black tracking-tighter text-xl">OMNINEWS</h1>
            <p className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest leading-none">Intelligence</p>
          </div>
        </div>

        <nav className="space-y-2 flex-1">
          <SidebarItem
            icon={LayoutDashboard}
            label="Daily Feed"
            active={activeTab === 'feed'}
            onClick={() => setActiveTab('feed')}
          />
          <SidebarItem
            icon={MessageSquare}
            label="News Copilot"
            active={activeTab === 'copilot'}
            onClick={() => setActiveTab('copilot')}
          />
        </nav>

        <div className="mt-auto pt-6 border-t border-white/5">
          <div className="flex items-center gap-3 px-2 opacity-50">
            <Activity size={16} />
            <span className="text-xs font-mono">System Active</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-12 custom-scrollbar">
        <header className="mb-12">
          <h2 className="text-4xl font-extrabold tracking-tight mb-2">
            {activeTab === 'feed' ? 'Real-time Intelligence' : 'Agentic News Copilot'}
          </h2>
          <p className="text-gray-500 max-w-2xl">
            {activeTab === 'feed'
              ? 'Aggregated reports from the multi-agent research team, verified against global sources.'
              : 'Interact with the intelligence core to drill down into specific news events and entities.'}
          </p>
        </header>

        <section className="max-w-4xl">
          {activeTab === 'feed' ? (
            loading ? (
              <div className="space-y-6">
                {[1, 2, 3].map(i => <div key={i} className="glass-card h-48 rounded-2xl animate-pulse" />)}
              </div>
            ) : briefings.length > 0 ? (
              briefings.map(b => <BriefingCard key={b.cluster_id} briefing={b} />)
            ) : (
              <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
                <p className="text-gray-500">No briefings found. Ensure the ingestion service is active.</p>
              </div>
            )
          ) : (
            <Copilot />
          )}
        </section>
      </main>
    </div>
  );
}
