import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

const cleanSummaryText = (text) => {
  if (!text) return "";
  let cleaned = text;
  cleaned = cleaned.replace(/\[SOURCES_JSON\][\s\S]*?(\[\/SOURCES_JSON\]|(?=\[ENTITIES_JSON\])|$)/gi, "");
  cleaned = cleaned.replace(/\[ENTITIES_JSON\][\s\S]*?(\[\/ENTITIES_JSON\]|$)/gi, "");
  cleaned = cleaned.replace(/\[RISK_SCORE:.*?\]/gi, "");
  cleaned = cleaned.replace(/\[IMPACT:.*?\]/gi, "");
  cleaned = cleaned.replace(/\[[A-Z_]{3,24}(:.*?)?\]/gi, "");
  const lines = cleaned.split('\n');
  const filteredLines = lines.filter(line => {
    const contentOnly = line.replace(/^[#\s\-\*]+/, '').trim();
    return contentOnly.length > 0 || line.trim() === "";
  });
  return filteredLines.join('\n').trim();
};

import { getBriefings, getLogs, getNarrativeBriefings, launchInvestigation, launchDebate, chatWithCopilot, supabase } from './api';
import {
  Globe, AlertTriangle, Search, Activity, LayoutDashboard,
  MessageSquare, Shield, Clock, TrendingUp, History,
  Rocket, Zap, BookOpen, ChevronRight, User, Building2, MapPin,
  BarChart3, ExternalLink, Swords, Scale, Sparkles,
  Menu, X, Radio, Cpu, ArrowRight, Hash, ChevronDown, Rss
} from 'lucide-react';

// ─── Ticker Bar ───────────────────────────────────────────────
const TickerBar = ({ briefings }) => {
  const items = briefings.slice(0, 8);
  if (!items.length) return null;
  const text = items.map(b => {
    const raw = b.summary_text?.split('\n').find(l => l.replace(/^[#\s\-\*]+/, '').trim().length > 4) || b.summary_text?.split('\n')[0] || 'Briefing update';
    return cleanSummaryText(raw).replace(/^#+\s*/, '').replace(/\*\*/g, '').trim() || 'Briefing update';
  });

  return (
    <div className="bg-[#e8e0d0] border-b border-[#c8bfaf] overflow-hidden flex items-stretch h-8">
      <div className="bg-[#1a1a1a] text-[#e8e0d0] px-4 flex items-center shrink-0 z-10">
        <span className="text-[9px] font-bold tracking-[0.25em] uppercase font-mono flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
          LIVE
        </span>
      </div>
      <div className="relative overflow-hidden flex-1">
        <motion.div
          className="flex items-center gap-0 absolute whitespace-nowrap"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
        >
          {[...text, ...text].map((t, i) => (
            <span key={i} className="text-[10px] font-medium text-[#2a2a2a] px-6 tracking-wide border-r border-[#c8bfaf] h-8 flex items-center font-mono">
              {t}
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

// ─── Sidebar ──────────────────────────────────────────────────
const SidebarItem = ({ icon: Icon, label, active, onClick, count }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all duration-200 text-left border-l-2 ${active
      ? 'border-l-[#1a1a1a] bg-[#1a1a1a]/5 text-[#1a1a1a]'
      : 'border-l-transparent text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#1a1a1a]/3'
      }`}
  >
    <Icon size={15} strokeWidth={active ? 2.5 : 1.8} />
    <span className={`text-[11px] tracking-[0.05em] uppercase font-bold flex-1 ${active ? 'font-black' : ''}`}>{label}</span>
    {count !== undefined && (
      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${active ? 'bg-[#1a1a1a] text-[#e8e0d0]' : 'bg-[#1a1a1a]/10 text-[#6b6b6b]'}`}>
        {count}
      </span>
    )}
  </button>
);

const MobileNav = ({ activeTab, setActiveTab }) => (
  <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#f2ede5] border-t border-[#c8bfaf]">
    <div className="flex">
      {[
        { id: 'feed', icon: Rss, label: 'Feed' },
        { id: 'copilot', icon: MessageSquare, label: 'Copilot' },
      ].map(item => (
        <button
          key={item.id}
          onClick={() => setActiveTab(item.id)}
          className={`flex-1 flex flex-col items-center gap-1 py-3 text-[9px] tracking-[0.15em] uppercase font-bold transition-colors ${activeTab === item.id ? 'text-[#1a1a1a]' : 'text-[#9a9a9a]'
            }`}
        >
          <item.icon size={18} strokeWidth={activeTab === item.id ? 2.5 : 1.5} />
          {item.label}
        </button>
      ))}
    </div>
  </div>
);

// ─── Masthead / Header ────────────────────────────────────────
const Masthead = ({ briefings, activeTab }) => {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <header className="border-b border-[#1a1a1a]/20 bg-[#f2ede5]">
      {/* Top rule */}
      <div className="h-[3px] bg-[#1a1a1a]" />

      {/* Masthead row */}
      <div className="px-6 md:px-10 py-5 flex items-end justify-between border-b border-[#c8bfaf]">
        <div>
          <h1 className="font-['Playfair_Display',_serif] text-4xl md:text-5xl font-black tracking-tight text-[#1a1a1a] leading-none">
            OMNINEWS
          </h1>
          <p className="text-[9px] font-bold tracking-[0.35em] text-[#6b6b6b] uppercase mt-1.5 font-mono">
            Intelligence · Analysis · Synthesis
          </p>
        </div>
        <div className="hidden md:flex flex-col items-end gap-1">
          <span className="text-[9px] font-mono text-[#6b6b6b] tracking-widest uppercase">{dateStr}</span>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            <span className="text-[9px] font-mono text-[#6b6b6b] tracking-widest">LIVE FEED ACTIVE</span>
          </div>
        </div>
      </div>

      {/* Section nav */}
      <div className="px-6 md:px-10 flex items-center gap-0 border-b border-[#c8bfaf] overflow-x-auto">
        <div className="flex items-center gap-6 py-2.5">
          <span className={`text-[10px] font-bold tracking-[0.2em] uppercase cursor-default pb-0.5 ${activeTab === 'feed' ? 'text-[#1a1a1a] border-b-2 border-[#1a1a1a]' : 'text-[#9a9a9a]'}`}>
            Intelligence Feed
          </span>
          <span className={`text-[10px] font-bold tracking-[0.2em] uppercase cursor-default pb-0.5 ${activeTab === 'copilot' ? 'text-[#1a1a1a] border-b-2 border-[#1a1a1a]' : 'text-[#9a9a9a]'}`}>
            Copilot
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[9px] font-mono text-[#9a9a9a] hidden md:block">
            {briefings.length} briefings indexed
          </span>
        </div>
      </div>

      <TickerBar briefings={briefings} />
    </header>
  );
};

// ─── Risk Badge ───────────────────────────────────────────────
const RiskBadge = ({ score }) => {
  const level = score >= 7 ? { label: 'CRITICAL', bg: 'bg-red-600', text: 'text-white' }
    : score >= 4 ? { label: 'ELEVATED', bg: 'bg-amber-500', text: 'text-white' }
      : { label: 'STABLE', bg: 'bg-emerald-700', text: 'text-white' };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[8px] font-black tracking-[0.3em] uppercase font-mono ${level.bg} ${level.text}`}>
      <span className="w-1 h-1 rounded-full bg-current opacity-80 animate-pulse" />
      {level.label} {score}/10
    </span>
  );
};

// ─── Entity Chips ─────────────────────────────────────────────
const EntityChip = ({ icon: Icon, label }) => {
  const displayText = typeof label === 'object' && label !== null
    ? (label.name || label.label || JSON.stringify(label))
    : label;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#1a1a1a]/5 border border-[#1a1a1a]/15 text-[10px] font-medium text-[#3a3a3a] hover:bg-[#1a1a1a]/10 transition-colors cursor-default">
      <Icon size={9} className="opacity-60" />
      {displayText}
    </span>
  );
};

const KeyEntities = ({ entities }) => {
  if (!entities) return null;
  const { people = [], organizations = [], locations = [] } = entities;
  if (!people.length && !organizations.length && !locations.length) return null;

  return (
    <div className="mb-6 pt-4 border-t border-[#1a1a1a]/10">
      <p className="text-[8px] font-black tracking-[0.3em] uppercase text-[#9a9a9a] mb-2 font-mono">Key Entities</p>
      <div className="flex flex-wrap gap-1.5">
        {people.slice(0, 4).map((p, i) => (
          <EntityChip key={i} icon={User} label={p} />
        ))}
        {organizations.slice(0, 4).map((o, i) => (
          <EntityChip key={i} icon={Building2} label={o} />
        ))}
        {locations.slice(0, 4).map((l, i) => (
          <EntityChip key={i} icon={MapPin} label={l} />
        ))}
      </div>
    </div>
  );
};

// ─── Media Bias ───────────────────────────────────────────────
const getBiasCategory = (bias) => {
  if (!bias) return 'center';
  const b = bias.toLowerCase();
  if (b.includes('left')) return 'left';
  if (b.includes('right')) return 'right';
  return 'center';
};

const MediaBiasSpectrum = ({ sources }) => {
  if (!sources || sources.length === 0) return null;

  const biasCounts = { left: 0, center: 0, right: 0 };
  sources.forEach(s => {
    biasCounts[getBiasCategory(s.bias)]++;
  });

  const total = sources.length;
  const leftPct = (biasCounts.left / total) * 100;
  const centerPct = (biasCounts.center / total) * 100;
  const rightPct = (biasCounts.right / total) * 100;

  // If everything defaulted to center but we have sources, show an even split indicator
  const allCenter = leftPct === 0 && rightPct === 0;

  return (
    <div className="pt-5 mt-5 border-t border-[#1a1a1a]/10">
      <div className="flex justify-between items-center mb-3">
        <p className="text-[8px] font-black tracking-[0.3em] uppercase text-[#9a9a9a] font-mono">Media Spectrum</p>
        <div className="flex gap-4 text-[8px] font-mono font-bold">
          <span className={biasCounts.left > 0 ? 'text-blue-700' : 'text-[#c8bfaf]'}>L {biasCounts.left}</span>
          <span className={biasCounts.center > 0 ? 'text-[#6b6b6b]' : 'text-[#c8bfaf]'}>C {biasCounts.center}</span>
          <span className={biasCounts.right > 0 ? 'text-red-700' : 'text-[#c8bfaf]'}>R {biasCounts.right}</span>
        </div>
      </div>

      {/* Spectrum bar — always show a visible track */}
      <div className="h-1.5 w-full bg-[#ddd8ce] flex overflow-hidden">
        {allCenter ? (
          <div className="h-full w-full bg-[#a8a09a]" />
        ) : (
          <>
            <motion.div initial={{ width: 0 }} animate={{ width: `${leftPct}%` }} transition={{ duration: 0.8 }} className="h-full bg-blue-600 shrink-0" />
            <motion.div initial={{ width: 0 }} animate={{ width: `${centerPct}%` }} transition={{ duration: 0.8, delay: 0.1 }} className="h-full bg-[#a8a09a] shrink-0" />
            <motion.div initial={{ width: 0 }} animate={{ width: `${rightPct}%` }} transition={{ duration: 0.8, delay: 0.2 }} className="h-full bg-red-600 shrink-0" />
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {sources.slice(0, 6).sort((a, b) => {
          const order = { left: 0, center: 1, right: 2 };
          return order[getBiasCategory(a.bias)] - order[getBiasCategory(b.bias)];
        }).map((source, i) => {
          const label = source.domain || source.name || source.source || "Source";
          const link = source.link || source.url || "#";
          const cat = getBiasCategory(source.bias);
          const dot = cat === 'left' ? 'bg-blue-600' : cat === 'right' ? 'bg-red-600' : 'bg-[#a8a09a]';
          return (
            <a key={i} href={link} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-[#1a1a1a]/15 text-[9px] font-mono text-[#6b6b6b] hover:text-[#1a1a1a] hover:border-[#1a1a1a]/30 transition-colors">
              <span className={`w-1 h-1 rounded-full ${dot}`} />
              {label}
              <ExternalLink size={8} />
            </a>
          );
        })}
      </div>
    </div>
  );
};

// ─── Narrative Duel ───────────────────────────────────────────
const NarrativeDuel = ({ duelData }) => {
  if (!duelData) return null;
  const { west_summary, south_summary, convergence, divergence } = duelData;

  return (
    <div className="mt-6 pt-6 border-t border-[#1a1a1a]/15">
      <div className="flex items-center gap-2 mb-5">
        <Swords size={13} className="text-[#6b6b6b]" />
        <p className="text-[8px] font-black tracking-[0.3em] uppercase text-[#9a9a9a] font-mono">Narrative Duel · Dialectical Analysis</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="border-l-4 border-l-blue-600 pl-4 py-1">
          <p className="text-[8px] font-black tracking-[0.25em] text-blue-700 uppercase mb-2 font-mono">Atlanticist Strategy</p>
          <p className="text-[12px] text-[#3a3a3a] leading-relaxed font-['Georgia',_serif] italic">{west_summary}</p>
        </div>
        <div className="border-l-4 border-l-emerald-600 pl-4 py-1">
          <p className="text-[8px] font-black tracking-[0.25em] text-emerald-700 uppercase mb-2 font-mono">Global South Realism</p>
          <p className="text-[12px] text-[#3a3a3a] leading-relaxed font-['Georgia',_serif] italic">{south_summary}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-[#1a1a1a]/3 p-4 border border-[#1a1a1a]/10">
          <p className="text-[8px] font-black tracking-[0.25em] text-[#9a9a9a] uppercase mb-1.5 font-mono flex items-center gap-1.5"><Scale size={9} /> Convergence</p>
          <p className="text-[11px] text-[#5a5a5a] leading-relaxed">{convergence}</p>
        </div>
        <div className="bg-[#1a1a1a]/3 p-4 border border-[#1a1a1a]/10">
          <p className="text-[8px] font-black tracking-[0.25em] text-[#9a9a9a] uppercase mb-1.5 font-mono flex items-center gap-1.5"><Zap size={9} /> Divergence</p>
          <p className="text-[11px] text-[#5a5a5a] leading-relaxed">{divergence}</p>
        </div>
      </div>
    </div>
  );
};

// ─── Narrative Timeline ───────────────────────────────────────
const NarrativeTimeline = ({ briefings, currentClusterId }) => {
  if (!briefings || briefings.length <= 1) return null;

  return (
    <div className="mt-5 pt-5 border-t border-[#1a1a1a]/10">
      <p className="text-[8px] font-black tracking-[0.3em] uppercase text-[#9a9a9a] mb-4 font-mono flex items-center gap-1.5">
        <History size={9} /> Story Evolution
      </p>
      <div className="space-y-2">
        {briefings.map((b, i) => (
          <div key={b.cluster_id} className={`flex items-start gap-3 py-2 border-b border-[#1a1a1a]/5 last:border-b-0 transition-opacity ${b.cluster_id === currentClusterId ? 'opacity-100' : 'opacity-40'
            }`}>
            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${b.cluster_id === currentClusterId ? 'bg-[#1a1a1a]' : 'bg-[#c8bfaf]'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[#5a5a5a] leading-snug line-clamp-1 font-['Georgia',_serif] italic">
                {cleanSummaryText(b.summary_text?.split('\n').find(l => l.replace(/^[#\s\-\*]+/, '').trim().length > 4) || b.summary_text?.split('\n')[0] || '')
                  .replace(/^#+\s*/, '').replace(/\*\*/g, '').trim()}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[8px] font-mono px-1 py-0.5 ${b.risk_score >= 7 ? 'bg-red-100 text-red-700' : b.risk_score >= 4 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                }`}>{b.risk_score}</span>
              <span className="text-[8px] font-mono text-[#9a9a9a]">
                {new Date(b.generated_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Briefing Card ────────────────────────────────────────────
const BriefingCard = ({ briefing, index }) => {
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [history, setHistory] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [isInvestigating, setIsInvestigating] = useState(briefing.is_investigating || false);
  const [investigativeReport, setInvestigativeReport] = useState(briefing.investigative_report || null);
  const [isDebating, setIsDebating] = useState(briefing.is_debating || false);
  const [duelData, setDuelData] = useState(briefing.narrative_duel || null);

  useEffect(() => {
    if (briefing.narrative_id) {
      getNarrativeBriefings(briefing.narrative_id).then(setHistory).catch(console.error);
    }
  }, [briefing.narrative_id]);

  useEffect(() => {
    const channel = supabase
      .channel(`updates-${briefing.cluster_id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'cluster_summaries',
        filter: `cluster_id=eq.${briefing.cluster_id}`
      }, (payload) => {
        if (payload.new.investigative_report) { setInvestigativeReport(payload.new.investigative_report); setIsInvestigating(false); }
        if (payload.new.is_investigating !== undefined) setIsInvestigating(payload.new.is_investigating);
        if (payload.new.narrative_duel) { setDuelData(payload.new.narrative_duel); setIsDebating(false); }
        if (payload.new.is_debating !== undefined) setIsDebating(payload.new.is_debating);
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [briefing.cluster_id]);

  const fetchLogs = async () => {
    if (!showLogs && !logs.length) {
      setLoadingLogs(true);
      try { const data = await getLogs(briefing.cluster_id); setLogs(data); } catch (e) { console.error(e); }
      setLoadingLogs(false);
    }
    setShowLogs(!showLogs);
  };

  const handleInvestigate = async () => {
    setIsInvestigating(true);
    try { await launchInvestigation(briefing.cluster_id); } catch (e) { console.error(e); setIsInvestigating(false); }
  };

  const handleDebate = async () => {
    setIsDebating(true);
    try { await launchDebate(briefing.cluster_id); } catch (e) { console.error(e); setIsDebating(false); }
  };

  // Extract headline from summary
  const summaryLines = briefing.summary_text?.split('\n') || [];
  const headline = summaryLines.find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || summaryLines[0] || 'Briefing';
  const cleanedText = cleanSummaryText(briefing.summary_text);

  const isLead = index === 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.4 }}
      className={`border-b border-[#1a1a1a]/15 ${isLead ? 'pb-8' : 'py-6'}`}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <RiskBadge score={briefing.risk_score} />
          <span className="text-[8px] font-mono text-[#9a9a9a] tracking-wider">
            {new Date(briefing.generated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          {briefing.narrative_id && (
            <span className="text-[8px] font-mono text-[#9a9a9a] flex items-center gap-1">
              <Hash size={8} /> {briefing.narrative_id?.slice(0, 8)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchLogs}
            className="text-[8px] font-mono text-[#9a9a9a] hover:text-[#1a1a1a] transition-colors tracking-widest uppercase border border-transparent hover:border-[#1a1a1a]/20 px-2 py-1"
          >
            {showLogs ? 'Hide' : 'Logs'}
          </button>
        </div>
      </div>

      {/* Headline */}
      <h2 className={`font-['Playfair_Display',_serif] font-black text-[#1a1a1a] leading-tight mb-3 cursor-pointer hover:text-[#3a3a3a] transition-colors ${isLead ? 'text-2xl md:text-3xl' : 'text-lg md:text-xl'
        }`} onClick={() => setExpanded(!expanded)}>
        {headline}
      </h2>

      {/* Summary preview */}
      <div className={`overflow-hidden transition-all duration-500 ${expanded ? '' : 'max-h-32 relative'}`}>
        <div className="prose max-w-none text-[13px] leading-relaxed text-[#4a4a4a]"
          style={{ fontFamily: 'Georgia, serif' }}>
          <ReactMarkdown
            components={{
              h1: ({ node, ...props }) => null,
              h2: ({ node, ...props }) => <h3 className="text-[11px] font-black tracking-[0.2em] uppercase text-[#9a9a9a] mt-4 mb-1 font-mono not-italic" {...props} />,
              p: ({ node, ...props }) => <p className="mb-3 text-[13px] text-[#4a4a4a] leading-relaxed" style={{ fontFamily: 'Georgia, serif' }} {...props} />,
              strong: ({ node, ...props }) => <strong className="text-[#1a1a1a] font-bold" {...props} />
            }}
          >
            {cleanedText}
          </ReactMarkdown>
        </div>
        {!expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#f2ede5] to-transparent" />
        )}
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[9px] font-black tracking-[0.25em] uppercase text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors mt-2 flex items-center gap-1 font-mono"
      >
        {expanded ? '↑ Collapse' : '↓ Read Full Briefing'}
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <KeyEntities entities={briefing.key_entities} />

            {briefing.impact_analysis && (
              <div className="mt-5 bg-[#2a2520] text-[#e8e0d0] p-5 border-l-2 border-l-[#c8a870]">
                <p className="text-[8px] font-black tracking-[0.3em] uppercase mb-2 font-mono text-[#c8a870] flex items-center gap-1.5">
                  <Shield size={9} /> Strategic Impact Analysis
                </p>
                <p className="text-[12px] leading-relaxed italic text-[#d8d0c0]" style={{ fontFamily: 'Georgia, serif' }}>
                  {briefing.impact_analysis}
                </p>
              </div>
            )}

            <MediaBiasSpectrum sources={briefing.source_metadata} />
            <NarrativeTimeline briefings={history} currentClusterId={briefing.cluster_id} />
            <NarrativeDuel duelData={duelData} />

            {/* Actions */}
            <div className="mt-6 pt-6 border-t border-[#1a1a1a]/10">
              {!investigativeReport && !isInvestigating && !duelData && !isDebating ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleInvestigate}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 border border-[#1a1a1a] bg-[#1a1a1a] text-[#e8e0d0] text-[9px] font-black tracking-[0.2em] uppercase font-mono hover:bg-[#3a3a3a] transition-colors"
                  >
                    <Rocket size={12} /> Deep-Dive Investigation
                  </button>
                  <button
                    onClick={handleDebate}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 border border-[#1a1a1a]/30 text-[#6b6b6b] text-[9px] font-black tracking-[0.2em] uppercase font-mono hover:border-[#1a1a1a] hover:text-[#1a1a1a] transition-colors"
                  >
                    <Swords size={12} /> Narrative Debate
                  </button>
                </div>
              ) : (isInvestigating || isDebating) ? (
                <div className="flex items-center gap-4 py-4 border border-[#1a1a1a]/15 px-5">
                  <div className="w-4 h-4 border-2 border-[#1a1a1a]/20 border-t-[#1a1a1a] rounded-full animate-spin shrink-0" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest font-mono text-[#1a1a1a]">
                      {isInvestigating ? 'Investigation in progress' : 'Dialectical simulation running'}
                    </p>
                    <p className="text-[9px] text-[#9a9a9a] font-mono mt-0.5">
                      {isInvestigating ? 'Searching primary sources...' : 'Modeling narrative divergence...'}
                    </p>
                  </div>
                </div>
              ) : null}

              {investigativeReport && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border border-[#1a1a1a]/20 bg-[#1a1a1a]/2">
                  <div className="border-b border-[#1a1a1a]/15 px-5 py-3 flex items-center gap-2">
                    <BookOpen size={12} className="text-[#6b6b6b]" />
                    <p className="text-[8px] font-black tracking-[0.3em] uppercase font-mono text-[#6b6b6b]">Investigative Report</p>
                  </div>
                  <div className="p-5 prose max-w-none text-[12px] text-[#4a4a4a]" style={{ fontFamily: 'Georgia, serif' }}>
                    <ReactMarkdown>{investigativeReport}</ReactMarkdown>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logs */}
      <AnimatePresence>
        {showLogs && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-4 pt-4 border-t border-[#1a1a1a]/10"
          >
            <p className="text-[8px] font-black tracking-[0.3em] uppercase text-[#9a9a9a] mb-3 font-mono flex items-center gap-1.5">
              <Activity size={9} /> Agent Thought Process
            </p>
            {loadingLogs ? (
              <div className="text-[10px] font-mono text-[#9a9a9a] animate-pulse">Retrieving agent memory...</div>
            ) : (
              <div className="space-y-2">
                {logs.map((log, i) => (
                  <div key={i} className="bg-[#1a1a1a]/3 border border-[#1a1a1a]/10 p-3">
                    <div className="flex justify-between text-[8px] font-mono font-bold mb-1">
                      <span className="text-[#1a1a1a]">{log.agent_name}</span>
                      <span className="text-[#9a9a9a]">Step {log.step_number}</span>
                    </div>
                    <p className="text-[11px] text-[#5a5a5a] italic mb-1.5" style={{ fontFamily: 'Georgia, serif' }}>"{log.thought_process}"</p>
                    <p className="text-[9px] font-mono text-[#9a9a9a] bg-[#1a1a1a]/5 px-2 py-1">{log.action_taken}</p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
};

// ─── Copilot ──────────────────────────────────────────────────
const Copilot = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      setMessages(prev => [...prev, { role: 'assistant', content: `**Sync Error:** ${err.message || "Unknown failure"}` }]);
    }
    setLoading(false);
  };

  return (
    <div className="h-[calc(100vh-240px)] flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-0 pr-1" style={{ scrollbarWidth: 'thin' }}>
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-10 py-20">
            <div className="border border-[#1a1a1a]/15 p-8 max-w-sm">
              <MessageSquare size={28} className="mx-auto text-[#c8bfaf] mb-4" strokeWidth={1.5} />
              <p className="text-[11px] font-mono text-[#9a9a9a] leading-relaxed tracking-wide">
                Query the Intelligence Copilot.<br />
                Responses are grounded in verified briefings.
              </p>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}
          >
            {m.role === 'assistant' && (
              <div className="w-6 h-6 bg-[#1a1a1a] flex items-center justify-center shrink-0 mr-3 mt-1">
                <Shield size={12} className="text-[#e8e0d0]" />
              </div>
            )}
            <div className={`max-w-[82%] ${m.role === 'user'
              ? 'bg-[#1a1a1a] text-[#e8e0d0] px-4 py-3'
              : 'border border-[#1a1a1a]/15 bg-[#faf7f2] px-5 py-4'
              }`}>
              {m.role === 'user' ? (
                <p className="text-[12px] font-mono">{m.content}</p>
              ) : (
                <div className="prose max-w-none text-[12px] text-[#3a3a3a]" style={{ fontFamily: 'Georgia, serif' }}>
                  <ReactMarkdown className="prose prose-sm">{m.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </motion.div>
        ))}
        {loading && (
          <div className="flex justify-start mb-4">
            <div className="w-6 h-6 bg-[#1a1a1a] flex items-center justify-center shrink-0 mr-3 mt-1">
              <Shield size={12} className="text-[#e8e0d0]" />
            </div>
            <div className="border border-[#1a1a1a]/15 bg-[#faf7f2] px-5 py-4">
              <div className="flex gap-1.5 items-center">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 bg-[#1a1a1a]/30 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
                <span className="text-[9px] font-mono text-[#9a9a9a] ml-2">Searching briefings...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="pt-4 border-t border-[#1a1a1a]/15 flex gap-0">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleSend()}
          placeholder="Ask about global events, conflicts, or policy shifts..."
          className="flex-1 bg-[#faf7f2] border border-[#1a1a1a]/20 border-r-0 px-4 py-3 text-[12px] font-mono focus:outline-none focus:border-[#1a1a1a]/50 placeholder:text-[#c8bfaf] text-[#1a1a1a]"
          style={{ fontFamily: 'Georgia, serif' }}
        />
        <button
          onClick={handleSend}
          className="bg-[#1a1a1a] text-[#e8e0d0] px-5 py-3 text-[9px] font-black tracking-[0.2em] uppercase font-mono hover:bg-[#3a3a3a] transition-colors flex items-center gap-2"
        >
          <Search size={13} />
          Query
        </button>
      </div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState('feed');
  const [briefings, setBriefings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBriefings().then(setBriefings).catch(console.error).finally(() => setLoading(false));

    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cluster_summaries' },
        (payload) => setBriefings(prev => [payload.new, ...prev])
      ).subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return (
    <div className="min-h-screen w-full text-[#1a1a1a] flex flex-col" style={{ backgroundColor: '#f2ede5', fontFamily: 'Georgia, serif' }}>
      {/* Load Playfair Display */}
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet" />

      <Masthead briefings={briefings} activeTab={activeTab} />

      <div className="flex flex-1 max-w-screen-xl mx-auto w-full">
        {/* Sidebar */}
        <aside className="hidden md:flex w-52 shrink-0 border-r border-[#1a1a1a]/15 flex-col pt-8 pb-6 sticky top-0 h-[calc(100vh-160px)]">
          <div className="px-4 mb-6">
            <p className="text-[8px] font-black tracking-[0.3em] uppercase text-[#9a9a9a] font-mono mb-3">Navigation</p>
            <nav className="space-y-0.5">
              <SidebarItem icon={Rss} label="Intel Feed" active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} count={briefings.length} />
              <SidebarItem icon={MessageSquare} label="Copilot" active={activeTab === 'copilot'} onClick={() => setActiveTab('copilot')} />
            </nav>
          </div>

          <div className="px-4 mt-6 border-t border-[#1a1a1a]/10 pt-6">
            <p className="text-[8px] font-black tracking-[0.3em] uppercase text-[#9a9a9a] font-mono mb-3">Status</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                <span className="text-[9px] font-mono text-[#6b6b6b]">Feed Active</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                <span className="text-[9px] font-mono text-[#6b6b6b]">Embeddings Ready</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#9a9a9a]" />
                <span className="text-[9px] font-mono text-[#6b6b6b]">Vector Search</span>
              </div>
            </div>
          </div>

          <div className="mt-auto px-4 pt-4 border-t border-[#1a1a1a]/10">
            <p className="text-[8px] font-mono text-[#c8bfaf] leading-relaxed">
              Multi-agent news intelligence system. Data sourced from global verified outlets.
            </p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-6 md:px-10 pt-8 pb-32 md:pb-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              {activeTab === 'feed' ? (
                loading ? (
                  <div className="space-y-6">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="border-b border-[#1a1a1a]/15 pb-6 animate-pulse">
                        <div className="h-3 bg-[#1a1a1a]/10 w-24 mb-3 rounded" />
                        <div className="h-8 bg-[#1a1a1a]/10 w-3/4 mb-2 rounded" />
                        <div className="h-3 bg-[#1a1a1a]/5 w-full mb-1 rounded" />
                        <div className="h-3 bg-[#1a1a1a]/5 w-5/6 rounded" />
                      </div>
                    ))}
                  </div>
                ) : briefings.length > 0 ? (
                  <div>
                    {briefings.map((b, i) => (
                      <BriefingCard key={b.cluster_id} briefing={b} index={i} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-24 border border-dashed border-[#1a1a1a]/15">
                    <p className="text-[11px] font-mono text-[#9a9a9a]">No active narratives detected.</p>
                    <p className="text-[9px] font-mono text-[#c8bfaf] mt-1">Ensure ingestion service is running.</p>
                  </div>
                )
              ) : (
                <div>
                  <div className="border-b border-[#1a1a1a]/15 pb-6 mb-8">
                    <h2 className="font-['Playfair_Display',_serif] text-2xl font-black text-[#1a1a1a] mb-1">Intelligence Copilot</h2>
                    <p className="text-[11px] font-mono text-[#9a9a9a]">Ask the AI about any topic covered in the current briefings.</p>
                  </div>
                  <Copilot />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Right rail - desktop only */}
        <aside className="hidden lg:block w-56 shrink-0 border-l border-[#1a1a1a]/15 pt-8 pb-6 px-5 sticky top-0 h-[calc(100vh-160px)]">
          <p className="text-[8px] font-black tracking-[0.3em] uppercase text-[#9a9a9a] font-mono mb-4">Risk Summary</p>
          {!loading && briefings.length > 0 && (
            <div className="space-y-2">
              {[
                { label: 'Critical', min: 7, color: 'bg-red-600' },
                { label: 'Elevated', min: 4, max: 7, color: 'bg-amber-500' },
                { label: 'Stable', max: 4, color: 'bg-emerald-700' },
              ].map(tier => {
                const count = briefings.filter(b =>
                  (tier.min === undefined || b.risk_score >= tier.min) &&
                  (tier.max === undefined || b.risk_score < tier.max)
                ).length;
                return (
                  <div key={tier.label} className="flex items-center justify-between py-1.5 border-b border-[#1a1a1a]/8">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-sm ${tier.color}`} />
                      <span className="text-[9px] font-mono text-[#6b6b6b]">{tier.label}</span>
                    </div>
                    <span className="text-[10px] font-black font-mono text-[#1a1a1a]">{count}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-[#1a1a1a]/10">
            <p className="text-[8px] font-black tracking-[0.3em] uppercase text-[#9a9a9a] font-mono mb-3">Latest Update</p>
            {briefings[0] && (
              <p className="text-[9px] font-mono text-[#9a9a9a] leading-relaxed">
                {new Date(briefings[0].generated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </aside>
      </div>

      <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
