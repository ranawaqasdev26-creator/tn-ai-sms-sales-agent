import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, UserPlus, MessageSquare, Play, Radio } from 'lucide-react';
import { api } from '../api';

interface Props {
  onAction: () => void;
}

function nextDemoPhone() {
  return `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
}

export default function DemoPanel({ onAction }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState('');
  const [leadName, setLeadName] = useState('Demo Lead');
  const [leadPhone, setLeadPhone] = useState('+15559999002');
  const [smsBody, setSmsBody] = useState('Hi, I am interested in your services. What are the prices?');
  const [lastError, setLastError] = useState('');

  const run = async (action: string, fn: () => Promise<unknown>) => {
    setLoading(action);
    setLastError('');
    try {
      await fn();
      onAction();
    } catch (e) {
      console.error(e);
      setLastError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setLoading('');
    }
  };

  const runLiveDemo = async () => {
    setLoading('live');
    setLastError('');
    try {
      const uniquePhone = `+1555${Date.now().toString().slice(-7)}`;
      setLeadPhone(uniquePhone);
      const result = await api.demoLiveConversation(leadName || 'Demo Lead', uniquePhone, 'Demo Company');
      onAction();
      navigate(`/conversations?id=${result.conversation.id}`);
    } catch (e) {
      console.error(e);
      setLastError(e instanceof Error ? e.message : 'Live demo failed');
    } finally {
      setLoading('');
    }
  };

  const runSimulate = async () => {
    const name = leadName.trim() || 'Demo Lead';
    const phone = nextDemoPhone();
    setLeadName(name);
    setLeadPhone(phone);
    await run('simulate', () => api.demoSimulate({ name, phone, company: 'Demo Corp' }));
  };

  return (
    <div className="card">
      <div className="p-4 border-b border-luxury-200 bg-gold-50/40">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-gold-600" />
          <h3 className="font-semibold text-luxury-900">Demo Simulator</h3>
        </div>
        <p className="text-xs text-luxury-500 mt-1">Test the system without real SMS</p>
      </div>

      <div className="p-4 space-y-4">
        <div className="p-3.5 rounded-xl bg-gradient-to-br from-navy-800 to-navy-900 space-y-2.5">
          <label className="text-xs text-white/70 font-medium flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5" /> Live Demo — watch it happen in real time
          </label>
          <input
            className="input text-sm"
            placeholder="Lead name"
            value={leadName}
            onChange={(e) => setLeadName(e.target.value)}
          />
          <button
            onClick={runLiveDemo}
            disabled={!!loading}
            className="w-full btn-primary text-sm flex items-center justify-center gap-2 bg-gold-shine shadow-gold"
            style={{ background: 'linear-gradient(135deg, #C9A962 0%, #B8956A 50%, #9A7B4F 100%)' }}
          >
            <Play className="w-4 h-4" />
            {loading === 'live' ? 'Lead is texting in…' : 'Watch Live Demo'}
          </button>
          <p className="text-[11px] text-white/50 leading-relaxed">
            A new lead pops in, the AI replies for real, then it plays out live — back and forth — right in Conversations.
          </p>
        </div>

        <button
          onClick={() => void runSimulate()}
          disabled={!!loading}
          className="w-full btn-secondary text-sm flex items-center justify-center gap-2"
        >
          <Play className="w-4 h-4" />
          {loading === 'simulate' ? 'Creating...' : 'Simulate Full Conversation (instant)'}
        </button>

        <div className="space-y-2">
          <label className="text-xs text-luxury-500 font-medium flex items-center gap-1">
            <UserPlus className="w-3.5 h-3.5" /> New Lead Outreach
          </label>
          <input
            className="input text-sm"
            placeholder="Name"
            value={leadName}
            onChange={(e) => setLeadName(e.target.value)}
          />
          <input
            className="input text-sm"
            placeholder="Phone"
            value={leadPhone}
            onChange={(e) => setLeadPhone(e.target.value)}
          />
          <button
            onClick={() => run('lead', () => api.demoNewLead(leadName, leadPhone, undefined, 'Demo Company'))}
            disabled={!!loading}
            className="w-full btn-primary text-sm"
          >
            {loading === 'lead' ? 'Sending...' : 'Trigger Outreach SMS'}
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-luxury-500 font-medium flex items-center gap-1">
            <MessageSquare className="w-3.5 h-3.5" /> Simulate Inbound SMS
          </label>
          <input className="input text-sm" placeholder="Name" value={leadName} readOnly />
          <input className="input text-sm" placeholder="Phone" value={leadPhone} readOnly />
          <p className="text-[11px] text-luxury-400">
            Uses the same name &amp; phone as outreach above
          </p>
          <textarea
            className="input text-sm resize-none"
            rows={2}
            value={smsBody}
            onChange={(e) => setSmsBody(e.target.value)}
          />
          <button
            onClick={() => run('sms', () => api.demoInboundSMS(leadPhone, smsBody, leadName))}
            disabled={!!loading}
            className="w-full btn-primary text-sm"
          >
            {loading === 'sms' ? 'Processing...' : 'Send Inbound SMS'}
          </button>
        </div>

        {lastError ? (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {lastError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
