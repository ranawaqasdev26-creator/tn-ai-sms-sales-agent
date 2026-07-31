import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Send, Pause, Play, Trophy, XCircle, Bot, User, MessageCircle, Phone, Search, X, UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, Conversation, Message, Agent } from '../api';
import StatusBadge from '../components/StatusBadge';
import StatusSelector from '../components/StatusSelector';
import SentimentBadge from '../components/SentimentBadge';
import type { ConversationStatus } from '../components/statusConfig';

interface Props {
  refreshKey: number;
}

export default function Conversations({ refreshKey }: Props) {
  const { agent } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation & { messages: Message[] } | null>(null);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedId = searchParams.get('id');
  const isAdmin = agent?.role === 'admin';

  useEffect(() => {
    api.getConversations().then(setConversations).finally(() => setLoading(false));
  }, [refreshKey]);

  useEffect(() => {
    if (isAdmin) api.getAgents().then(setAgents);
  }, [isAdmin]);

  useEffect(() => {
    if (selectedId) {
      api.getConversation(selectedId).then(setSelected);
    }
  }, [selectedId, refreshKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selected?.messages]);

  const selectConversation = (id: string) => {
    setSearchParams({ id });
    api.getConversation(id).then(setSelected);
  };

  const refreshSelected = async (id: string) => {
    const updated = await api.getConversation(id);
    setSelected(updated);
    const convos = await api.getConversations();
    setConversations(convos);
  };

  const handleReply = async () => {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      await api.reply(selected.id, reply);
      await refreshSelected(selected.id);
      setReply('');
    } finally {
      setSending(false);
    }
  };

  const handlePause = async () => {
    if (!selected) return;
    await api.pauseAI(selected.id);
    await refreshSelected(selected.id);
  };

  const handleResume = async () => {
    if (!selected) return;
    await api.resumeAI(selected.id);
    await refreshSelected(selected.id);
  };

  const handleClose = async (outcome: 'won' | 'lost') => {
    if (!selected) return;
    await api.closeConversation(selected.id, outcome);
    await refreshSelected(selected.id);
  };

  const handleReopen = async () => {
    if (!selected) return;
    await api.reopenConversation(selected.id);
    await refreshSelected(selected.id);
  };

  const handleStatusChange = async (status: ConversationStatus) => {
    if (!selected || status === selected.status) return;
    await api.updateStatus(selected.id, status);
    await refreshSelected(selected.id);
  };

  const handleAssign = async (agentId: string | null) => {
    if (!selected) return;
    await api.assignConversation(selected.id, agentId);
    await refreshSelected(selected.id);
  };

  const filterOptions = ['all', 'active', 'escalated', 'paused', 'won', 'lost'] as const;

  const filterCounts = filterOptions.reduce((acc, f) => {
    acc[f] = f === 'all' ? conversations.length : conversations.filter((c) => c.status === f).length;
    return acc;
  }, {} as Record<string, number>);

  const filtered = conversations.filter((c) => {
    if (filter !== 'all' && c.status !== filter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.lead_name.toLowerCase().includes(q) ||
      c.lead_phone.toLowerCase().includes(q) ||
      (c.lead_company || '').toLowerCase().includes(q) ||
      (c.last_message || '').toLowerCase().includes(q)
    );
  });

  const isClosed = selected?.status === 'won' || selected?.status === 'lost';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      <div className="w-[26rem] min-w-[22rem] shrink-0 card flex flex-col overflow-hidden">
        <div className="p-3 border-b border-luxury-200 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-luxury-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="input pl-8 pr-8 py-1.5 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-luxury-400 hover:text-luxury-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {filterOptions.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-xs rounded-full capitalize transition-all duration-200 ${
                  filter === f
                    ? 'bg-gold-50 text-navy-800 border border-gold-300 font-medium shadow-sm'
                    : 'bg-white text-luxury-500 border border-luxury-200 hover:border-gold-300 hover:text-luxury-800'
                }`}
              >
                {f} <span className="opacity-70">({filterCounts[f]})</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-luxury-150">
          {filtered.length === 0 ? (
            <p className="p-6 text-sm text-luxury-400 text-center">
              {search ? 'No conversations match your search' : 'No conversations in this filter'}
            </p>
          ) : (
          filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => selectConversation(c.id)}
              className={`w-full text-left p-3 hover:bg-luxury-50 transition-colors ${
                selectedId === c.id ? 'bg-gold-50/80 border-l-2 border-gold-400' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm truncate text-luxury-800">{c.lead_name}</span>
                <StatusBadge status={c.status} small />
              </div>
              <p className="text-xs text-luxury-500 truncate">{c.last_message}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <SentimentBadge sentiment={c.sentiment} />
                <span className="text-xs text-luxury-400">{c.message_count} msgs</span>
                {c.assigned_agent_id ? (
                  <span className="text-xs text-luxury-400 truncate">· {c.assigned_agent}</span>
                ) : (
                  <span className="text-xs text-gold-600 truncate">· Unclaimed</span>
                )}
              </div>
            </button>
          )))}
        </div>
      </div>

      <div className="flex-1 card flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-luxury-400">
            <div className="text-center">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Select a conversation to view</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-luxury-200 flex items-center justify-between bg-luxury-50/50">
              <div>
                <h3 className="font-semibold text-luxury-900">{selected.lead_name}</h3>
                <div className="flex items-center gap-3 text-sm text-luxury-500 mt-0.5">
                  <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{selected.lead_phone}</span>
                  {selected.lead_company && <span>{selected.lead_company}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {isAdmin ? (
                  <select
                    value={selected.assigned_agent_id ?? ''}
                    onChange={(e) => handleAssign(e.target.value || null)}
                    className="input py-1.5 text-xs w-auto"
                  >
                    <option value="">Unassigned</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                ) : selected.assigned_agent_id === agent?.id ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <UserCheck className="w-3.5 h-3.5" /> Assigned to you
                  </span>
                ) : !selected.assigned_agent_id ? (
                  <button
                    onClick={() => handleAssign(agent!.id)}
                    className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"
                  >
                    <UserCheck className="w-3.5 h-3.5" /> Claim
                  </button>
                ) : null}
                <StatusSelector
                  value={selected.status}
                  onChange={handleStatusChange}
                />
                {!isClosed && (
                  <>
                    {selected.ai_enabled ? (
                      <button onClick={handlePause} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
                        <Pause className="w-3.5 h-3.5" /> Take Over
                      </button>
                    ) : (
                      <button onClick={handleResume} className="btn-primary text-xs flex items-center gap-1.5 py-1.5">
                        <Play className="w-3.5 h-3.5" /> Resume AI
                      </button>
                    )}
                    <button onClick={() => handleClose('won')} className="btn-primary text-xs flex items-center gap-1.5 py-1.5 bg-emerald-600 hover:bg-emerald-500">
                      <Trophy className="w-3.5 h-3.5" /> Won
                    </button>
                    <button onClick={() => handleClose('lost')} className="btn-danger text-xs flex items-center gap-1.5 py-1.5">
                      <XCircle className="w-3.5 h-3.5" /> Lost
                    </button>
                  </>
                )}
              </div>
            </div>

            {selected.escalation_reason && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-800 flex items-center gap-2">
                <span className="font-medium">Escalated:</span> {selected.escalation_reason}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-luxury-50/30">
              {selected.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'lead' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                      msg.sender === 'lead'
                        ? 'bg-white border border-luxury-200 rounded-bl-md text-luxury-800'
                        : msg.sender === 'human'
                        ? 'bg-emerald-50 border border-emerald-200 rounded-br-md text-emerald-900'
                        : msg.sender === 'system'
                        ? 'bg-amber-50 border border-amber-200 rounded-br-md text-amber-900'
                        : 'bg-navy-50 border border-navy-100 rounded-br-md text-navy-900'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {msg.sender === 'lead' ? (
                        <User className="w-3 h-3 text-luxury-400" />
                      ) : (
                        <Bot className="w-3 h-3 text-navy-600" />
                      )}
                      <span className="text-xs text-luxury-500 capitalize">
                        {msg.sender === 'ai' ? 'AI Agent' : msg.sender === 'human' ? (selected.assigned_agent || agent?.name || 'Agent') : msg.sender}
                      </span>
                      <span className="text-xs text-luxury-400">
                        {new Date(msg.created_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed">{msg.body}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-luxury-200 bg-white/80">
              {isClosed ? (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-sm text-luxury-500">
                    This conversation is closed as <span className="capitalize font-medium text-luxury-800">{selected.status}</span>.
                    Reopen it to send messages or change status above.
                  </p>
                  <button onClick={handleReopen} className="btn-primary text-sm shrink-0">
                    Reopen Conversation
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      placeholder={selected.ai_enabled ? 'Take over to reply manually...' : 'Type your reply...'}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleReply()}
                      disabled={!!selected.ai_enabled}
                    />
                    <button
                      onClick={handleReply}
                      disabled={!reply.trim() || sending || !!selected.ai_enabled}
                      className="btn-primary flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      Send
                    </button>
                  </div>
                  {selected.ai_enabled ? (
                    <p className="text-xs text-luxury-400 mt-2">Click &quot;Take Over&quot; to pause AI and reply manually</p>
                  ) : (
                    <p className="text-xs text-luxury-400 mt-2">Chat is active — type a message and press Send</p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
