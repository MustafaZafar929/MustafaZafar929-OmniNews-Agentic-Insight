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
    <div className="overflow-hidden flex items-stretch h-8" style={{ background: 'var(--paper-warm)', borderBottom: '1px solid var(--ink-rule)' }}>
      <div className="px-4 flex items-center shrink-0 z-10" style={{ background: 'var(--ink)' }}>
        <span className="text-[9px] font-bold tracking-[0.25em] uppercase font-mono flex items-center gap-2" style={{ color: 'var(--paper)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
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
            <span key={i} className="text-[10px] font-medium px-6 tracking-wide h-8 flex items-center font-mono"
              style={{ color: 'var(--ink-mid)', borderRight: '1px solid var(--ink-rule)' }}>
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
    className="w-full flex items-center gap-3 px-3 py-2.5 transition-all duration-200 text-left border-l-2"
    style={{
      borderLeftColor: active ? 'var(--ink)' : 'transparent',
      background: active ? 'rgba(24,24,24,0.05)' : 'transparent',
      color: active ? 'var(--ink)' : 'var(--ink-faint)',
    }}
    onMouseOver={e => { if (!active) { e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.background = 'rgba(24,24,24,0.03)'; } }}
    onMouseOut={e => { if (!active) { e.currentTarget.style.color = 'var(--ink-faint)'; e.currentTarget.style.background = 'transparent'; } }}
  >
    <Icon size={15} strokeWidth={active ? 2.5 : 1.8} />
    <span className="text-[11px] tracking-[0.05em] uppercase font-bold flex-1 font-mono">{label}</span>
    {count !== undefined && (
      <span className="text-[9px] font-mono px-1.5 py-0.5" style={{
        background: active ? 'var(--ink)' : 'rgba(24,24,24,0.08)',
        color: active ? 'var(--paper)' : 'var(--ink-faint)',
      }}>
        {count}
      </span>
    )}
  </button>
);

const MobileNav = ({ activeTab, setActiveTab }) => (
  <div className="md:hidden fixed bottom-0 left-0 right-0 z-50" style={{ background: 'var(--paper-warm)', borderTop: '1px solid var(--ink-rule)' }}>
    <div className="flex">
      {[
        { id: 'feed', icon: Rss, label: 'Feed' },
        { id: 'copilot', icon: MessageSquare, label: 'Copilot' },
      ].map(item => (
        <button
          key={item.id}
          onClick={() => setActiveTab(item.id)}
          className="flex-1 flex flex-col items-center gap-1 py-3 text-[9px] tracking-[0.15em] uppercase font-bold transition-colors font-mono"
          style={{ color: activeTab === item.id ? 'var(--ink)' : 'var(--ink-faint)' }}
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
    <header className="border-b" style={{ borderColor: 'var(--ink-rule)', backgroundColor: 'var(--paper)' }}>
      {/* Top rule */}
      <div className="h-[3px] bg-[#1a1a1a]" />

      {/* Masthead row */}
      <div className="px-6 md:px-10 py-5 flex items-end justify-between border-b" style={{ borderColor: 'var(--ink-rule)' }}>
        <div>
          <h1 className="font-['Playfair_Display',_serif] text-4xl md:text-5xl font-black tracking-tight text-[#1a1a1a] leading-none">
            OMNINEWS
          </h1>
          <p className="text-[9px] font-bold tracking-[0.35em] uppercase mt-1.5 font-mono" style={{ color: 'var(--ink-muted)' }}>
            Intelligence · Analysis · Synthesis
          </p>
        </div>
        <div className="hidden md:flex flex-col items-end gap-1">
          <span className="text-[9px] font-mono tracking-widest uppercase" style={{ color: 'var(--ink-muted)' }}>{dateStr}</span>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            <span className="text-[9px] font-mono tracking-widest" style={{ color: 'var(--ink-muted)' }}>LIVE FEED ACTIVE</span>
          </div>
        </div>
      </div>

      {/* Section nav */}
      <div className="px-6 md:px-10 flex items-center gap-0 border-b overflow-x-auto" style={{ borderColor: 'var(--ink-rule)' }}>
        <div className="flex items-center gap-6 py-2.5">
          <span className={`text-[10px] font-bold tracking-[0.2em] uppercase cursor-default pb-0.5 font-mono ${activeTab === 'feed' ? 'border-b-2' : ''}`}
            style={{ color: activeTab === 'feed' ? 'var(--ink)' : 'var(--ink-faint)', borderColor: 'var(--ink)' }}>
            Intelligence Feed
          </span>
          <span className={`text-[10px] font-bold tracking-[0.2em] uppercase cursor-default pb-0.5 font-mono ${activeTab === 'copilot' ? 'border-b-2' : ''}`}
            style={{ color: activeTab === 'copilot' ? 'var(--ink)' : 'var(--ink-faint)', borderColor: 'var(--ink)' }}>
            Copilot
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[9px] font-mono hidden md:block" style={{ color: 'var(--ink-faint)' }}>
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
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium transition-colors cursor-default"
      style={{ background: 'var(--paper-mid)', border: '1px solid var(--ink-rule)', color: 'var(--ink-mid)', fontFamily: 'IBM Plex Mono, monospace' }}>
      <Icon size={9} style={{ color: 'var(--ink-faint)' }} />
      {displayText}
    </span>
  );
};

const KeyEntities = ({ entities }) => {
  if (!entities) return null;
  const { people = [], organizations = [], locations = [] } = entities;
  if (!people.length && !organizations.length && !locations.length) return null;

  return (
    <div className="tint-entities mb-5 mt-5">
      <p className="text-[8px] font-black tracking-[0.3em] uppercase mb-2.5 font-mono flex items-center gap-1.5" style={{ color: 'var(--ink-faint)' }}>
        <Activity size={9} /> Key Entities
      </p>
      <div className="flex flex-wrap gap-1.5">
        {people.slice(0, 4).map((p, i) => <EntityChip key={i} icon={User} label={p} />)}
        {organizations.slice(0, 4).map((o, i) => <EntityChip key={i} icon={Building2} label={o} />)}
        {locations.slice(0, 4).map((l, i) => <EntityChip key={i} icon={MapPin} label={l} />)}
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
    <div className="tint-spectrum mt-5">
      <div className="flex justify-between items-center mb-3">
        <p className="text-[8px] font-black tracking-[0.3em] uppercase font-mono" style={{ color: 'var(--ink-faint)' }}>Media Spectrum</p>
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
    <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--ink-rule-lt)' }}>
      <div className="flex items-center gap-2 mb-5">
        <Swords size={13} style={{ color: 'var(--ink-muted)' }} />
        <p className="text-[8px] font-black tracking-[0.3em] uppercase font-mono" style={{ color: 'var(--ink-faint)' }}>Narrative Duel · Dialectical Analysis</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="tint-west">
          <p className="text-[8px] font-black tracking-[0.25em] uppercase mb-2 font-mono" style={{ color: 'var(--accent-blue)' }}>Atlanticist Strategy</p>
          <p className="text-[12.5px] leading-relaxed italic" style={{ color: 'var(--ink-mid)', fontFamily: "'Source Serif 4', Georgia, serif" }}>{west_summary}</p>
        </div>
        <div className="tint-south">
          <p className="text-[8px] font-black tracking-[0.25em] uppercase mb-2 font-mono" style={{ color: 'var(--accent-green)' }}>Global South Realism</p>
          <p className="text-[12.5px] leading-relaxed italic" style={{ color: 'var(--ink-mid)', fontFamily: "'Source Serif 4', Georgia, serif" }}>{south_summary}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="tint-converge">
          <p className="text-[8px] font-black tracking-[0.25em] uppercase mb-1.5 font-mono flex items-center gap-1.5" style={{ color: 'var(--ink-faint)' }}><Scale size={9} /> Convergence</p>
          <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--ink-muted)', fontFamily: "'Source Serif 4', Georgia, serif" }}>{convergence}</p>
        </div>
        <div className="tint-converge">
          <p className="text-[8px] font-black tracking-[0.25em] uppercase mb-1.5 font-mono flex items-center gap-1.5" style={{ color: 'var(--ink-faint)' }}><Zap size={9} /> Divergence</p>
          <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--ink-muted)', fontFamily: "'Source Serif 4', Georgia, serif" }}>{divergence}</p>
        </div>
      </div>
    </div>
  );
};

// ─── Narrative Timeline ───────────────────────────────────────
const NarrativeTimeline = ({ briefings, currentClusterId }) => {
  if (!briefings || briefings.length <= 1) return null;

  return (
    <div className="tint-timeline mt-5">
      <p className="text-[8px] font-black tracking-[0.3em] uppercase mb-4 font-mono flex items-center gap-1.5" style={{ color: 'var(--ink-faint)' }}>
        <History size={9} /> Story Evolution
      </p>
      <div className="space-y-0">
        {briefings.map((b, i) => (
          <div key={b.cluster_id} className={`flex items-start gap-3 py-2.5 border-b last:border-b-0 transition-opacity ${b.cluster_id === currentClusterId ? 'opacity-100' : 'opacity-35'
            }`} style={{ borderColor: 'var(--ink-rule-lt)' }}>
            <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{
              background: b.cluster_id === currentClusterId ? 'var(--ink)' : 'var(--ink-faint)'
            }} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] leading-snug line-clamp-1 italic" style={{ color: 'var(--ink-muted)', fontFamily: "'Source Serif 4', Georgia, serif" }}>
                {cleanSummaryText(b.summary_text?.split('\n').find(l => l.replace(/^[#\s\-\*]+/, '').trim().length > 4) || b.summary_text?.split('\n')[0] || '')
                  .replace(/^#+\s*/, '').replace(/\*\*/g, '').trim()}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[8px] font-mono px-1 py-0.5" style={{
                background: b.risk_score >= 7 ? '#f8e8e6' : b.risk_score >= 4 ? '#f8f0e0' : '#e8f2ec',
                color: b.risk_score >= 7 ? 'var(--accent-red)' : b.risk_score >= 4 ? 'var(--accent-amber)' : 'var(--accent-green)'
              }}>{b.risk_score}</span>
              <span className="text-[8px] font-mono" style={{ color: 'var(--ink-faint)' }}>
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
      className={`border-b ${isLead ? 'pb-8' : 'py-6'}`} style={{ borderColor: 'var(--ink-rule)' }}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <RiskBadge score={briefing.risk_score} />
          <span className="text-[8px] font-mono tracking-wider" style={{ color: 'var(--ink-faint)' }}>
            {new Date(briefing.generated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          {briefing.narrative_id && (
            <span className="text-[8px] font-mono flex items-center gap-1" style={{ color: 'var(--ink-faint)' }}>
              <Hash size={8} /> {briefing.narrative_id?.slice(0, 8)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchLogs}
            className="text-[8px] font-mono tracking-widest uppercase px-2 py-1 transition-colors border border-transparent"
            style={{ color: 'var(--ink-faint)' }}
            onMouseOver={e => { e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.borderColor = 'var(--ink-rule)'; }}
            onMouseOut={e => { e.currentTarget.style.color = 'var(--ink-faint)'; e.currentTarget.style.borderColor = 'transparent'; }}
          >
            {showLogs ? 'Hide' : 'Logs'}
          </button>
        </div>
      </div>

      {/* Headline */}
      <h2
        className={`font-black leading-tight mb-3 cursor-pointer transition-colors ${isLead ? 'text-2xl md:text-3xl' : 'text-lg md:text-xl'}`}
        style={{ fontFamily: "'Playfair Display', Georgia, serif", color: 'var(--ink)' }}
        onClick={() => setExpanded(!expanded)}
      >
        {headline}
      </h2>

      {/* Summary preview */}
      <div className={`overflow-hidden transition-all duration-500 ${expanded ? '' : 'max-h-32 relative'}`}>
        <div className="prose max-w-none">
          <ReactMarkdown
            components={{
              h1: ({ node, ...props }) => null,
              h2: ({ node, ...props }) => (
                <p className="text-[8px] font-black tracking-[0.28em] uppercase mt-5 mb-1.5 font-mono not-italic" style={{ color: 'var(--ink-faint)' }} {...props} />
              ),
              p: ({ node, ...props }) => (
                <p className="mb-3 text-[13.5px] leading-[1.74]" style={{ color: 'var(--ink-mid)', fontFamily: "'Source Serif 4', Georgia, serif" }} {...props} />
              ),
              strong: ({ node, ...props }) => <strong style={{ color: 'var(--ink)', fontWeight: 600 }} {...props} />
            }}
          >
            {cleanedText}
          </ReactMarkdown>
        </div>
        {!expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-14" style={{ background: 'linear-gradient(to top, var(--paper), transparent)' }} />
        )}
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[9px] font-black tracking-[0.25em] uppercase mt-2 flex items-center gap-1 font-mono transition-colors"
        style={{ color: 'var(--ink-muted)' }}
        onMouseOver={e => e.currentTarget.style.color = 'var(--ink)'}
        onMouseOut={e => e.currentTarget.style.color = 'var(--ink-muted)'}
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
              <div className="tint-impact mt-5">
                <p className="text-[8px] font-black tracking-[0.3em] uppercase mb-2 font-mono flex items-center gap-1.5" style={{ color: '#b8933a' }}>
                  <Shield size={9} /> Strategic Impact Analysis
                </p>
                <p className="text-[12.5px] leading-relaxed italic" style={{ color: '#d8cfc0', fontFamily: "'Source Serif 4', Georgia, serif" }}>
                  {briefing.impact_analysis}
                </p>
              </div>
            )}

            <MediaBiasSpectrum sources={briefing.source_metadata} />
            <NarrativeTimeline briefings={history} currentClusterId={briefing.cluster_id} />
            <NarrativeDuel duelData={duelData} />

            {/* Actions */}
            <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--ink-rule-lt)' }}>
              {!investigativeReport && !isInvestigating && !duelData && !isDebating ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleInvestigate}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 text-[9px] font-black tracking-[0.2em] uppercase font-mono transition-colors"
                    style={{ border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--paper)' }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--ink-mid)'}
                    onMouseOut={e => e.currentTarget.style.background = 'var(--ink)'}
                  >
                    <Rocket size={12} /> Deep-Dive Investigation
                  </button>
                  <button
                    onClick={handleDebate}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 text-[9px] font-black tracking-[0.2em] uppercase font-mono transition-colors"
                    style={{ border: '1px solid var(--ink-rule)', color: 'var(--ink-muted)' }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--ink)'; e.currentTarget.style.color = 'var(--ink)'; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--ink-rule)'; e.currentTarget.style.color = 'var(--ink-muted)'; }}
                  >
                    <Swords size={12} /> Narrative Debate
                  </button>
                </div>
              ) : (isInvestigating || isDebating) ? (
                <div className="flex items-center gap-4 py-4 px-5 border" style={{ borderColor: 'var(--ink-rule)' }}>
                  <div className="w-4 h-4 rounded-full animate-spin shrink-0" style={{ border: '2px solid var(--ink-rule)', borderTopColor: 'var(--ink)' }} />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest font-mono" style={{ color: 'var(--ink)' }}>
                      {isInvestigating ? 'Investigation in progress' : 'Dialectical simulation running'}
                    </p>
                    <p className="text-[9px] font-mono mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                      {isInvestigating ? 'Searching primary sources...' : 'Modeling narrative divergence...'}
                    </p>
                  </div>
                </div>
              ) : null}

              {investigativeReport && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="tint-report">
                  <div className="px-5 py-3 flex items-center gap-2 border-b" style={{ borderColor: 'var(--ink-rule)' }}>
                    <BookOpen size={12} style={{ color: 'var(--ink-muted)' }} />
                    <p className="text-[8px] font-black tracking-[0.3em] uppercase font-mono" style={{ color: 'var(--ink-muted)' }}>Investigative Report</p>
                  </div>
                  <div className="p-5 prose max-w-none" style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: '13px', color: 'var(--ink-mid)' }}>
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
            className="overflow-hidden mt-4 pt-4 border-t" style={{ borderColor: 'var(--ink-rule-lt)' }}
          >
            <p className="text-[8px] font-black tracking-[0.3em] uppercase mb-3 font-mono flex items-center gap-1.5" style={{ color: 'var(--ink-faint)' }}>
              <Activity size={9} /> Agent Thought Process
            </p>
            {loadingLogs ? (
              <div className="text-[10px] font-mono animate-pulse" style={{ color: 'var(--ink-faint)' }}>Retrieving agent memory...</div>
            ) : (
              <div className="space-y-2">
                {logs.map((log, i) => (
                  <div key={i} className="tint-log">
                    <div className="flex justify-between text-[8px] font-mono font-bold mb-1.5">
                      <span style={{ color: '#d4c9b8' }}>{log.agent_name}</span>
                      <span style={{ color: '#6b6259' }}>Step {log.step_number}</span>
                    </div>
                    <p className="text-[11px] italic mb-1.5" style={{ color: '#a89d8e', fontFamily: "'Source Serif 4', Georgia, serif" }}>"{log.thought_process}"</p>
                    <p className="text-[9px] font-mono px-2 py-1" style={{ color: '#7a7066', background: 'rgba(255,255,255,0.04)' }}>{log.action_taken}</p>
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
            <div className="p-8 max-w-sm" style={{ border: '1px solid var(--ink-rule)' }}>
              <MessageSquare size={28} className="mx-auto mb-4" strokeWidth={1.5} style={{ color: 'var(--ink-faint)' }} />
              <p className="text-[11px] font-mono leading-relaxed tracking-wide" style={{ color: 'var(--ink-faint)' }}>
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
              <div className="w-6 h-6 flex items-center justify-center shrink-0 mr-3 mt-1" style={{ background: 'var(--ink)' }}>
                <Shield size={12} style={{ color: 'var(--paper)' }} />
              </div>
            )}
            <div className="max-w-[82%]" style={m.role === 'user'
              ? { background: 'var(--ink)', color: 'var(--paper)', padding: '0.75rem 1rem' }
              : { border: '1px solid var(--ink-rule)', background: 'var(--paper-mid)', padding: '1rem 1.25rem' }
            }>
              {m.role === 'user' ? (
                <p className="text-[12px] font-mono" style={{ color: 'var(--paper)' }}>{m.content}</p>
              ) : (
                <div className="prose max-w-none text-[13px]" style={{ fontFamily: "'Source Serif 4', Georgia, serif", color: 'var(--ink-mid)' }}>
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </motion.div>
        ))}
        {loading && (
          <div className="flex justify-start mb-4">
            <div className="w-6 h-6 flex items-center justify-center shrink-0 mr-3 mt-1" style={{ background: 'var(--ink)' }}>
              <Shield size={12} style={{ color: 'var(--paper)' }} />
            </div>
            <div className="px-5 py-4" style={{ border: '1px solid var(--ink-rule)', background: 'var(--paper-mid)' }}>
              <div className="flex gap-1.5 items-center">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--ink-rule)', animationDelay: `${i * 0.15}s` }} />
                ))}
                <span className="text-[9px] font-mono ml-2" style={{ color: 'var(--ink-faint)' }}>Searching briefings...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="pt-4 flex gap-0" style={{ borderTop: '1px solid var(--ink-rule)' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleSend()}
          placeholder="Ask about global events, conflicts, or policy shifts..."
          className="flex-1 px-4 py-3 text-[13px] focus:outline-none"
          style={{
            fontFamily: "'Source Serif 4', Georgia, serif",
            background: 'var(--paper-mid)',
            border: '1px solid var(--ink-rule)',
            borderRight: 'none',
            color: 'var(--ink)',
          }}
        />
        <button
          onClick={handleSend}
          className="px-5 py-3 text-[9px] font-black tracking-[0.2em] uppercase font-mono transition-colors flex items-center gap-2"
          style={{ background: 'var(--ink)', color: 'var(--paper)' }}
          onMouseOver={e => e.currentTarget.style.background = 'var(--ink-mid)'}
          onMouseOut={e => e.currentTarget.style.background = 'var(--ink)'}
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
    <div className="min-h-screen w-full flex flex-col" style={{ backgroundColor: 'var(--paper)', color: 'var(--ink)', fontFamily: "'Source Serif 4', Georgia, serif" }}>
      {/* Load fonts */}
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400;1,700&family=IBM+Plex+Mono:wght@400;500;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;1,8..60,300;1,8..60,400&display=swap" rel="stylesheet" />

      <Masthead briefings={briefings} activeTab={activeTab} />

      <div className="flex flex-1 max-w-screen-xl mx-auto w-full">
        {/* Sidebar */}
        <aside className="hidden md:flex w-52 shrink-0 flex-col pt-8 pb-6 sticky top-0 h-[calc(100vh-160px)]"
          style={{ borderRight: '1px solid var(--ink-rule)', background: 'var(--paper-warm)' }}>
          <div className="px-4 mb-6">
            <p className="text-[8px] font-black tracking-[0.3em] uppercase font-mono mb-3" style={{ color: 'var(--ink-faint)' }}>Navigation</p>
            <nav className="space-y-0.5">
              <SidebarItem icon={Rss} label="Intel Feed" active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} count={briefings.length} />
              <SidebarItem icon={MessageSquare} label="Copilot" active={activeTab === 'copilot'} onClick={() => setActiveTab('copilot')} />
            </nav>
          </div>

          <div className="px-4 mt-6 pt-6" style={{ borderTop: '1px solid var(--ink-rule-lt)' }}>
            <p className="text-[8px] font-black tracking-[0.3em] uppercase font-mono mb-3" style={{ color: 'var(--ink-faint)' }}>Status</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-green)' }} />
                <span className="text-[9px] font-mono" style={{ color: 'var(--ink-muted)' }}>Feed Active</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-blue)' }} />
                <span className="text-[9px] font-mono" style={{ color: 'var(--ink-muted)' }}>Embeddings Ready</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--ink-faint)' }} />
                <span className="text-[9px] font-mono" style={{ color: 'var(--ink-muted)' }}>Vector Search</span>
              </div>
            </div>
          </div>

          <div className="mt-auto px-4 pt-4" style={{ borderTop: '1px solid var(--ink-rule-lt)' }}>
            <p className="text-[8px] font-mono leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
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
                      <div key={i} className="pb-6 animate-pulse" style={{ borderBottom: '1px solid var(--ink-rule)' }}>
                        <div className="h-2.5 w-24 mb-3 rounded" style={{ background: 'var(--ink-rule)' }} />
                        <div className="h-7 w-3/4 mb-2 rounded" style={{ background: 'var(--ink-rule)' }} />
                        <div className="h-3 w-full mb-1 rounded" style={{ background: 'var(--ink-rule-lt)' }} />
                        <div className="h-3 w-5/6 rounded" style={{ background: 'var(--ink-rule-lt)' }} />
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
                  <div className="text-center py-24 border border-dashed" style={{ borderColor: 'var(--ink-rule)' }}>
                    <p className="text-[11px] font-mono" style={{ color: 'var(--ink-faint)' }}>No active narratives detected.</p>
                    <p className="text-[9px] font-mono mt-1" style={{ color: 'var(--ink-faint)', opacity: 0.6 }}>Ensure ingestion service is running.</p>
                  </div>
                )
              ) : (
                <div>
                  <div className="pb-6 mb-8" style={{ borderBottom: '1px solid var(--ink-rule)' }}>
                    <h2 className="text-2xl font-black mb-1" style={{ fontFamily: "'Playfair Display', Georgia, serif", color: 'var(--ink)' }}>Intelligence Copilot</h2>
                    <p className="text-[11px] font-mono" style={{ color: 'var(--ink-faint)' }}>Ask the AI about any topic covered in the current briefings.</p>
                  </div>
                  <Copilot />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Right rail - desktop only */}
        <aside className="hidden lg:block w-56 shrink-0 pt-8 pb-6 px-5 sticky top-0 h-[calc(100vh-160px)]"
          style={{ borderLeft: '1px solid var(--ink-rule)', background: 'var(--paper-warm)' }}>
          <p className="text-[8px] font-black tracking-[0.3em] uppercase font-mono mb-4" style={{ color: 'var(--ink-faint)' }}>Risk Summary</p>
          {!loading && briefings.length > 0 && (
            <div className="space-y-0">
              {[
                { label: 'Critical', min: 7, dotColor: 'var(--accent-red)' },
                { label: 'Elevated', min: 4, max: 7, dotColor: 'var(--accent-amber)' },
                { label: 'Stable', max: 4, dotColor: 'var(--accent-green)' },
              ].map(tier => {
                const count = briefings.filter(b =>
                  (tier.min === undefined || b.risk_score >= tier.min) &&
                  (tier.max === undefined || b.risk_score < tier.max)
                ).length;
                return (
                  <div key={tier.label} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--ink-rule-lt)' }}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-sm" style={{ background: tier.dotColor }} />
                      <span className="text-[9px] font-mono" style={{ color: 'var(--ink-muted)' }}>{tier.label}</span>
                    </div>
                    <span className="text-[11px] font-black font-mono" style={{ color: 'var(--ink)' }}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--ink-rule-lt)' }}>
            <p className="text-[8px] font-black tracking-[0.3em] uppercase font-mono mb-3" style={{ color: 'var(--ink-faint)' }}>Latest Update</p>
            {briefings[0] && (
              <p className="text-[9px] font-mono leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
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
