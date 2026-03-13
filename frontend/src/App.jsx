import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getBriefings, getLogs, getNarrativeBriefings, launchInvestigation, launchDebate, chatWithCopilot, supabase } from './api';
import {
  Globe, AlertTriangle, Search, Activity, LayoutDashboard,
  MessageSquare, Shield, Clock, TrendingUp, History,
  Cpu, Rocket, Zap, BookOpen, ChevronRight, User, Building2, MapPin,
  BarChart3, ExternalLink, Swords, Scale, Sparkles
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-500 group ${active
      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
      : 'text-gray-500 hover:text-gray-200'
      }`}
  >
    <div className={`p-2 rounded-lg transition-all duration-500 ${active ? 'bg-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'group-hover:bg-white/5'}`}>
      <Icon size={18} />
    </div>
    <span className="font-medium text-sm tracking-wide">{label}</span>
    {active && <motion.div layoutId="active" className="ml-auto text-cyan-500"><ChevronRight size={16} /></motion.div>}
  </button>
);

const EntityChip = ({ icon: Icon, label, colorClass }) => {
  const displayText = typeof label === 'object' && label !== null 
    ? (label.name || label.label || JSON.stringify(label)) 
    : label;
  
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 transition-all cursor-default group`}>
      <Icon size={12} className={colorClass} />
      <span className="text-[10px] font-medium text-gray-300 group-hover:text-white transition-colors">
        {displayText}
      </span>
    </div>
  );
};

const KeyEntities = ({ entities }) => {
  if (!entities) return null;
  const { people = [], organizations = [], locations = [] } = entities;
  if (people.length === 0 && organizations.length === 0 && locations.length === 0) return null;

  return (
    <div className="mb-6">
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
        <Activity size={12} /> Key Intelligence Entities
      </h4>
      <div className="flex flex-wrap gap-2">
        {people.slice(0, 5).map((p, i) => (
          <EntityChip key={p?.name || p?.label || (typeof p === 'string' ? p : i)} icon={User} label={p} colorClass="text-cyan-400" />
        ))}
        {organizations.slice(0, 5).map((o, i) => (
          <EntityChip key={o?.name || o?.label || (typeof o === 'string' ? o : i)} icon={Building2} label={o} colorClass="text-purple-400" />
        ))}
        {locations.slice(0, 5).map((l, i) => (
          <EntityChip key={l?.name || l?.label || (typeof l === 'string' ? l : i)} icon={MapPin} label={l} colorClass="text-emerald-400" />
        ))}
      </div>
    </div>
  );
};

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

const NarrativeDuel = ({ duelData }) => {
  if (!duelData) return null;
  const { west_summary, south_summary, convergence, divergence } = duelData;

  return (
    <div className="mt-10 pt-10 border-t border-white/5">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center border border-amber-500/30">
          <Swords className="text-amber-400" size={20} />
        </div>
        <div>
          <h4 className="text-xl font-outfit font-bold text-white leading-none">Narrative Duel</h4>
          <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mt-1">Dialectical Intelligence</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Western Perspective */}
        <div className="glass-card p-6 rounded-2xl border-l-4 border-l-blue-500/50">
          <h5 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Globe size={12} /> Atlanticist Strategy
          </h5>
          <p className="text-sm text-gray-300 leading-relaxed italic">{west_summary}</p>
        </div>

        {/* Global South Perspective */}
        <div className="glass-card p-6 rounded-2xl border-l-4 border-l-emerald-500/50">
          <h5 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <MapPin size={12} /> Global South Realism
          </h5>
          <p className="text-sm text-gray-300 leading-relaxed italic">{south_summary}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
          <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Scale size={14} className="text-cyan-400" /> Points of Convergence
          </h5>
          <p className="text-sm text-gray-400 leading-relaxed">{convergence}</p>
        </div>
        <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
          <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Zap size={14} className="text-amber-400" /> Narrative Divergence
          </h5>
          <p className="text-sm text-gray-400 leading-relaxed">{divergence}</p>
        </div>
      </div>
    </div>
  );
};

const NarrativeTimeline = ({ briefings, currentClusterId }) => {
  if (!briefings || briefings.length <= 1) return null;

  return (
    <div className="mt-8 pt-8 border-t border-white/5">
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/80 mb-4 flex items-center gap-2">
        <History size={14} className="text-emerald-400" /> Story Evolution (Chronology)
      </h4>

      <div className="relative pl-6 border-l border-white/10 space-y-6">
        {briefings.map((b, i) => (
          <div key={b.cluster_id} className="relative">
            {/* Timeline Dot */}
            <div className={`absolute -left-[31px] top-1.5 w-2.5 h-2.5 rounded-full border-2 ${b.cluster_id === currentClusterId
              ? 'bg-cyan-500 border-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]'
              : 'bg-gray-800 border-white/20'
              }`} />

            <div className={`flex flex-col gap-1 ${b.cluster_id === currentClusterId ? 'opacity-100' : 'opacity-50'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-gray-500">
                  {new Date(b.generated_at).toLocaleDateString()} at {new Date(b.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${b.risk_score >= 7 ? 'bg-red-500/10 text-red-500' :
                  b.risk_score >= 4 ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'
                  }`}>
                  RISK: {b.risk_score}/10
                </span>
              </div>
              <p className="text-xs text-gray-400 line-clamp-1 italic">
                {b.summary_text.split('\n')[0].replace('#', '').trim()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const BriefingCard = ({ briefing }) => {
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const fetchHistory = async () => {
      if (briefing.narrative_id) {
        try {
          const data = await getNarrativeBriefings(briefing.narrative_id);
          setHistory(data);
        } catch (err) {
          console.error("Failed to fetch narrative history", err);
        }
      }
    };
    fetchHistory();
  }, [briefing.narrative_id]);

  // Real-time listener for updates (Investigation & Duel)
  useEffect(() => {
    const channel = supabase
      .channel(`updates-${briefing.cluster_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cluster_summaries',
          filter: `cluster_id=eq.${briefing.cluster_id}`
        },
        (payload) => {
          if (payload.new.investigative_report) {
            setInvestigativeReport(payload.new.investigative_report);
            setIsInvestigating(false);
          }
          if (payload.new.is_investigating !== undefined) {
            setIsInvestigating(payload.new.is_investigating);
          }
          if (payload.new.narrative_duel) {
            setDuelData(payload.new.narrative_duel);
            setIsDebating(false);
          }
          if (payload.new.is_debating !== undefined) {
            setIsDebating(payload.new.is_debating);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [briefing.cluster_id]);

  const [isInvestigating, setIsInvestigating] = useState(briefing.is_investigating || false);
  const [investigativeReport, setInvestigativeReport] = useState(briefing.investigative_report || null);
  const [isDebating, setIsDebating] = useState(briefing.is_debating || false);
  const [duelData, setDuelData] = useState(briefing.narrative_duel || null);

  const handleInvestigate = async () => {
    setIsInvestigating(true);
    try {
      await launchInvestigation(briefing.cluster_id);
    } catch (err) {
      console.error("Failed to start investigation", err);
      setIsInvestigating(false);
    }
  };

  const handleDebate = async () => {
    setIsDebating(true);
    try {
      await launchDebate(briefing.cluster_id);
    } catch (err) {
      console.error("Failed to start debate", err);
      setIsDebating(false);
    }
  };

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

  const getRiskColor = (score) => {
    if (score >= 7) return 'text-red-500 border-red-500/30 bg-red-500/10 shadow-[0_0_10px_rgba(239,68,68,0.2)]';
    if (score >= 4) return 'text-amber-500 border-amber-500/30 bg-amber-500/10 shadow-[0_0_10px_rgba(245,158,11,0.2)]';
    return 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.2)]';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass glass-hover rounded-3xl p-8 mb-8 relative overflow-hidden group"
    >
      <div className="flex justify-between items-start mb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase flex items-center gap-2">
              <Globe size={12} /> Intelligence Feed
            </span>
            <span className="text-gray-800 text-[10px]">•</span>
            <span className="text-[10px] font-mono text-gray-500">
              {new Date(briefing.generated_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>

          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-bold tracking-widest uppercase transition-all duration-700 ${getRiskColor(briefing.risk_score)}`}>
            <div className={`w-1.5 h-1.5 rounded-full bg-current animate-pulse`} />
            STABILITY INDEX: {briefing.risk_score}/10
          </div>
        </div>

        <button
          onClick={fetchLogs}
          className="px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2"
        >
          <Search size={14} /> {showLogs ? 'Hide Logs' : 'View Intelligence Logs'}
        </button>
      </div>

      <div className="prose prose-invert max-w-none prose-sm mb-10">
        <ReactMarkdown
          components={{
            h1: ({ node, ...props }) => <h1 className="text-3xl font-extrabold tracking-tight text-white mb-6 font-outfit leading-tight" {...props} />,
            h2: ({ node, ...props }) => <h2 className="text-xl font-bold text-cyan-400 mt-8 mb-4 font-outfit" {...props} />,
            p: ({ node, ...props }) => <p className="text-gray-300 leading-relaxed text-base mb-5" {...props} />,
            strong: ({ node, ...props }) => <strong className="text-white font-semibold" {...props} />
          }}
        >
          {briefing.summary_text}
        </ReactMarkdown>
      </div>

      <KeyEntities entities={briefing.key_entities} />

      <NarrativeTimeline briefings={history} currentClusterId={briefing.cluster_id} />

      {briefing.impact_analysis && (
        <div className="bg-white/10 border border-white/10 rounded-2xl p-6 mb-6">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-cyan-500 mb-3 flex items-center gap-2">
            <Shield size={12} /> Strategic Impact Analysis
          </h4>
          <p className="text-sm text-gray-400 leading-relaxed italic">
            {briefing.impact_analysis}
          </p>
        </div>
      )}

      <MediaBiasSpectrum sources={briefing.source_metadata} />

      <NarrativeDuel duelData={duelData} />

      {/* Duel & Investigation Actions */}
      <div className="mt-10 pt-10 border-t border-white/5">
        {!investigativeReport && !isInvestigating && !duelData && !isDebating ? (
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-cyan-500/5 rounded-3xl border border-dashed border-cyan-500/20 group-hover:border-cyan-500/40 transition-all">
              <Rocket className="text-cyan-500 mb-4 animate-bounce" size={24} />
              <h4 className="text-sm font-outfit font-bold text-white mb-2">Deep Intelligence</h4>
              <button
                onClick={handleInvestigate}
                className="bg-cyan-500 hover:bg-cyan-400 text-black px-6 py-2.5 rounded-xl font-bold text-[10px] transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
              >
                <Zap size={14} fill="currentColor" /> Launch Deep-Dive
              </button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-amber-500/5 rounded-3xl border border-dashed border-amber-500/20 group-hover:border-amber-500/40 transition-all">
              <Swords className="text-amber-500 mb-4" size={24} />
              <h4 className="text-sm font-outfit font-bold text-white mb-2">Narrative Dual</h4>
              <button
                onClick={handleDebate}
                className="bg-amber-500 hover:bg-amber-400 text-black px-6 py-2.5 rounded-xl font-bold text-[10px] transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.3)]"
              >
                <Scale size={14} /> Start Debate Mode
              </button>
            </div>
          </div>
        ) : isInvestigating || isDebating ? (
          <div className="p-12 bg-black/40 rounded-3xl border border-white/10 flex flex-col items-center">
            <div className="relative w-16 h-16 mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-cyan-500/20 border-t-cyan-500 animate-spin"></div>
              {isInvestigating ? <Cpu className="absolute inset-4 text-cyan-500 animate-pulse" size={32} /> : <Swords className="absolute inset-4 text-amber-500 animate-pulse" size={32} />}
            </div>
            <h4 className="text-lg font-outfit font-bold text-white mb-2">Agent {isInvestigating ? 'Investigation' : 'Duel'} in Progress</h4>
            <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-widest font-mono">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              {isInvestigating ? 'Searching Primary Sources...' : 'Simulating Dialectical Narrative...'}
            </div>
          </div>
        ) : null}

        {investigativeReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-cyan-500/[0.03] border border-cyan-500/10 rounded-3xl p-10 relative overflow-hidden"
          >
            <div className="absolute top-0 right-10 w-24 h-24 bg-cyan-500/5 blur-3xl rounded-full"></div>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center border border-cyan-500/30">
                <BookOpen className="text-cyan-400" size={20} />
              </div>
              <div>
                <h4 className="text-xl font-outfit font-bold text-white leading-none">Investigative Report</h4>
                <p className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest mt-1">Sovereign Intel</p>
              </div>
            </div>
            <div className="prose prose-invert max-w-none prose-sm leading-relaxed text-gray-300">
              <ReactMarkdown>{investigativeReport}</ReactMarkdown>
            </div>
          </motion.div>
        )}
      </div>

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
    <div className="min-h-screen w-full bg-[#030303] text-gray-100 flex overflow-hidden">
      {/* Sidebar - Fixed Glass Panel */}
      <aside className="w-72 border-r border-white/5 flex flex-col p-8 glass z-20">
        <div className="flex items-center gap-4 mb-12 px-2 group cursor-pointer">
          <div className="w-12 h-12 bg-cyan-500 rounded-2xl flex items-center justify-center neon-border transition-transform transform group-hover:rotate-12 duration-500">
            <Shield className="text-black" size={28} />
          </div>
          <div>
            <h1 className="font-outfit font-extrabold tracking-tighter text-2xl text-white">OMNINEWS</h1>
            <p className="text-[10px] font-bold text-cyan-500 uppercase tracking-[0.3em] leading-none mt-1">Intelligence</p>
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

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-16 custom-scrollbar relative z-10">
        <header className="mb-20 max-w-4xl">
          <motion.h2
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-5xl font-outfit font-extrabold tracking-tight text-white mb-4 leading-tight"
          >
            {activeTab === 'feed' ? 'Intelligence Feed' : 'Agentic News Copilot'}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-gray-400 font-light leading-relaxed max-w-2xl"
          >
            {activeTab === 'feed'
              ? 'Real-time multi-agent analysis of global events, verified through diverse sources and historical context.'
              : 'Direct interface with the OmniNews Intelligence Core. Query the entire knowledge graph.'}
          </motion.p>
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
