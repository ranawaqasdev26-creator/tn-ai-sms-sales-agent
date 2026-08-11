import { useEffect, useState } from 'react';
import {
  Save, CheckCircle, XCircle, Key, Bot, HelpCircle, Users, Bell, Plus, Pencil, Trash2, X,
} from 'lucide-react';
import { api, Settings, Agent } from '../api';
import { useAuth } from '../context/AuthContext';

const AVATAR_COLORS = ['bg-gold-shine', 'bg-navy-shine'];

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

export default function SettingsPage() {
  const { agent } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({ email: '', name: '', password: '', role: 'agent' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'agent', password: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [agentError, setAgentError] = useState('');

  const adminCount = agents.filter((a) => a.role === 'admin').length;

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      setForm({
        openai_api_key: '',
        openai_model: s.settings.openai_model || 'gpt-4o-mini',
        twilio_account_sid: '',
        twilio_auth_token: '',
        twilio_phone_number: s.settings.twilio_phone_number || '',
        zoho_client_id: '',
        zoho_client_secret: '',
        zoho_refresh_token: '',
        demo_mode: s.integrations.demoMode ? 'true' : 'false',
        bot_system_prompt: s.settings.bot_system_prompt || '',
        bot_products_catalog: s.settings.bot_products_catalog || '',
        bot_company_name: s.settings.bot_company_name || '',
        bot_outreach_template: s.settings.bot_outreach_template || '',
        zoho_notify_on_conversation: s.settings.zoho_notify_on_conversation || 'true',
        zoho_notify_on_escalation: s.settings.zoho_notify_on_escalation || 'true',
      });
    });
    if (agent?.role === 'admin') {
      api.getAgents().then(setAgents).catch(() => {});
    }
  }, [agent?.role]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const toSave: Record<string, string> = {};
      for (const [key, value] of Object.entries(form)) {
        if (value && !value.startsWith('••••')) toSave[key] = value;
      }
      await api.updateSettings(toSave);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      const updated = await api.getSettings();
      setSettings(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAgent = async () => {
    if (!newAgent.email || !newAgent.name || !newAgent.password) return;
    setAgentError('');
    try {
      await api.createAgent(newAgent);
      setNewAgent({ email: '', name: '', password: '', role: 'agent' });
      setShowAddAgent(false);
      const list = await api.getAgents();
      setAgents(list);
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : 'Failed to create agent');
    }
  };

  const startEdit = (a: Agent) => {
    setEditingId(a.id);
    setEditForm({ name: a.name, email: a.email, role: a.role, password: '' });
    setAgentError('');
  };

  const handleUpdateAgent = async (id: string) => {
    setAgentError('');
    try {
      const payload: Record<string, string> = { name: editForm.name, email: editForm.email, role: editForm.role };
      if (editForm.password) payload.password = editForm.password;
      await api.updateAgent(id, payload);
      setEditingId(null);
      const list = await api.getAgents();
      setAgents(list);
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : 'Failed to update agent');
    }
  };

  const handleDeleteAgent = async (id: string) => {
    setAgentError('');
    try {
      await api.deleteAgent(id);
      setConfirmDeleteId(null);
      const list = await api.getAgents();
      setAgents(list);
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : 'Failed to delete agent');
      setConfirmDeleteId(null);
    }
  };

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const integrations = [
    { name: 'OpenAI', key: 'openai', configured: settings.integrations.openai },
    { name: 'iBluSend (texting)', key: 'ibluesend', configured: settings.integrations.ibluesend },
    { name: 'Zoho CRM', key: 'zoho', configured: settings.integrations.zoho },
    { name: 'Escalation Email Alerts', key: 'email', configured: settings.integrations.email },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      {/* Product FAQ */}
      <div className="card card-lift p-5">
        <h3 className="font-semibold text-luxury-900 mb-4 flex items-center gap-3">
          <span className="icon-chip"><HelpCircle /></span>
          Product FAQ
        </h3>
        <div className="text-sm divide-y divide-luxury-150">
          <div className="pb-4">
            <p className="font-medium text-luxury-900">Which AI platform is used?</p>
            <p className="text-luxury-500 mt-1 leading-relaxed">
              The platform uses <strong className="text-luxury-700">OpenAI</strong> ({settings.integrations.aiModel || 'gpt-4o-mini'}).
              In demo mode, smart fallback responses are used when no API key is configured.
            </p>
          </div>
          <div className="py-4">
            <p className="font-medium text-luxury-900">Who trains the bot?</p>
            <p className="text-luxury-500 mt-1 leading-relaxed">
              Administrators train the bot via the <strong className="text-luxury-700">Bot Training</strong> section below —
              no coding required. Edit the system prompt, product catalog, company info, and outreach templates.
              This is prompt engineering, not model fine-tuning.
            </p>
          </div>
          <div className="py-4">
            <p className="font-medium text-luxury-900">Zoho notifications during conversations?</p>
            <p className="text-luxury-500 mt-1 leading-relaxed">
              When Zoho CRM is connected, the system adds Notes and Tasks to the lead record on conversation start,
              escalation, human takeover, and deal close. Toggle below. In-app alerts also appear in the dashboard bell icon.
            </p>
          </div>
          <div className="py-4">
            <p className="font-medium text-luxury-900">Can agents take over conversations?</p>
            <p className="text-luxury-500 mt-1 leading-relaxed">
              Yes. Each agent logs into this dashboard. Click <strong className="text-luxury-700">Take Over</strong> to pause AI
              and reply manually. Click <strong className="text-luxury-700">Resume AI</strong> to hand back to the bot.
            </p>
          </div>
          <div className="pt-4">
            <p className="font-medium text-luxury-900">Multi-organization support?</p>
            <p className="text-luxury-500 mt-1 leading-relaxed">
              This deployment supports a single organization with multiple agent logins.
              Separate organization isolation is not included in the current version.
            </p>
          </div>
        </div>
      </div>

      <div className="card card-lift p-5">
        <h3 className="font-semibold text-luxury-900 mb-4 flex items-center gap-3">
          <span className="icon-chip"><Key /></span>
          Integration Status
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          {integrations.map((int) => (
            <div
              key={int.key}
              className={`relative overflow-hidden flex items-center gap-3 p-3.5 rounded-xl border transition-colors ${
                int.configured ? 'bg-emerald-50/50 border-emerald-200' : 'bg-luxury-50 border-luxury-200'
              }`}
            >
              <span className={`absolute left-0 top-0 bottom-0 w-1 ${int.configured ? 'bg-emerald-400' : 'bg-luxury-300'}`} />
              {int.configured ? (
                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-luxury-400 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-medium text-sm text-luxury-900">{int.name}</p>
                <p className="text-xs text-luxury-500 flex items-center gap-1.5 mt-0.5">
                  {int.configured && <span className="status-dot-live" />}
                  {int.configured ? 'Connected' : 'Not configured (demo mode)'}
                </p>
              </div>
            </div>
          ))}
        </div>
        {settings.integrations.demoMode && (
          <p className="text-sm text-amber-800 mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
            Demo mode is active. The app works fully without API keys — AI uses smart fallback responses.
            Add your keys below when ready.
          </p>
        )}
      </div>

      {/* Bot Training */}
      <div className="card card-lift p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-3">
          <span className="icon-chip"><Bot /></span>
          Bot Training
        </h3>
        <p className="text-sm text-luxury-500 -mt-2">
          Configure how the AI agent talks to leads. Changes apply to new AI responses immediately.
        </p>
        <div>
          <label className="section-label">Company Name</label>
          <input className="input" value={form.bot_company_name} onChange={(e) => update('bot_company_name', e.target.value)} placeholder="Your Company" />
        </div>
        <div>
          <label className="section-label">Products / Services Catalog</label>
          <textarea className="input min-h-[80px]" value={form.bot_products_catalog} onChange={(e) => update('bot_products_catalog', e.target.value)} placeholder="List your products, pricing, features..." />
        </div>
        <div>
          <label className="section-label">System Prompt (Bot Personality & Rules)</label>
          <textarea className="input min-h-[120px] font-mono text-xs" value={form.bot_system_prompt} onChange={(e) => update('bot_system_prompt', e.target.value)} />
        </div>
        <div>
          <label className="section-label">Outreach Template (use {'{name}'} for lead name)</label>
          <textarea className="input min-h-[60px]" value={form.bot_outreach_template} onChange={(e) => update('bot_outreach_template', e.target.value)} placeholder="Hi {name}! I'm reaching out from..." />
        </div>
      </div>

      <div className="card card-lift p-5 space-y-4">
        <h3 className="font-semibold text-luxury-900 flex items-center gap-3">
          <span className="icon-chip"><Key /></span>
          OpenAI
        </h3>
        <div>
          <label className="section-label">API Key</label>
          <input
            className="input"
            type="password"
            placeholder={settings.settings.openai_api_key || 'sk-...'}
            value={form.openai_api_key}
            onChange={(e) => update('openai_api_key', e.target.value)}
          />
        </div>
        <div>
          <label className="section-label">Model</label>
          <select className="input" value={form.openai_model} onChange={(e) => update('openai_model', e.target.value)}>
            <option value="gpt-4o-mini">gpt-4o-mini</option>
            <option value="gpt-4o">gpt-4o</option>
            <option value="gpt-4-turbo">gpt-4-turbo</option>
          </select>
        </div>
      </div>

      <div className="card card-lift p-5 space-y-4">
        <h3 className="font-semibold text-luxury-900 flex items-center gap-3">
          <span className="icon-chip"><Key /></span>
          Zoho CRM
        </h3>
        <div>
          <label className="section-label">OAuth Client ID</label>
          <input className="input" value={form.zoho_client_id} onChange={(e) => update('zoho_client_id', e.target.value)} />
        </div>
        <div>
          <label className="section-label">OAuth Client Secret</label>
          <input className="input" type="password" value={form.zoho_client_secret} onChange={(e) => update('zoho_client_secret', e.target.value)} />
        </div>
        <div>
          <label className="section-label">Refresh Token</label>
          <input className="input" type="password" value={form.zoho_refresh_token} onChange={(e) => update('zoho_refresh_token', e.target.value)} />
        </div>
        <div className="pt-3 border-t border-luxury-200 space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2 text-luxury-800">
            <Bell className="w-4 h-4 text-gold-600" />
            Zoho Notifications
          </h4>
          <label className="flex items-center gap-2.5 text-sm text-luxury-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.zoho_notify_on_conversation === 'true'}
              onChange={(e) => update('zoho_notify_on_conversation', e.target.checked ? 'true' : 'false')}
              className="rounded accent-gold-500 w-4 h-4"
            />
            Notify on new conversation (add Note to lead)
          </label>
          <label className="flex items-center gap-2.5 text-sm text-luxury-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.zoho_notify_on_escalation === 'true'}
              onChange={(e) => update('zoho_notify_on_escalation', e.target.checked ? 'true' : 'false')}
              className="rounded accent-gold-500 w-4 h-4"
            />
            Notify on escalation / takeover (add Task to lead)
          </label>
        </div>
      </div>

      {agent?.role === 'admin' && (
        <div className="card card-lift p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold flex items-center gap-3">
                <span className="icon-chip"><Users /></span>
                Team Agents
              </h3>
              <p className="text-sm text-luxury-500 mt-1 ml-[3.05rem]">Manage who can log in and take over conversations.</p>
            </div>
            <button
              onClick={() => { setShowAddAgent((s) => !s); setAgentError(''); }}
              className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"
            >
              {showAddAgent ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {showAddAgent ? 'Cancel' : 'Add Agent'}
            </button>
          </div>

          {agentError && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{agentError}</p>
          )}

          {showAddAgent && (
            <div className="p-4 rounded-xl bg-luxury-50/50 border border-luxury-200 grid sm:grid-cols-2 gap-3">
              <input className="input" placeholder="Name" value={newAgent.name} onChange={(e) => setNewAgent((a) => ({ ...a, name: e.target.value }))} />
              <input className="input" placeholder="Email" value={newAgent.email} onChange={(e) => setNewAgent((a) => ({ ...a, email: e.target.value }))} />
              <input className="input" type="password" placeholder="Password" value={newAgent.password} onChange={(e) => setNewAgent((a) => ({ ...a, password: e.target.value }))} />
              <select className="input" value={newAgent.role} onChange={(e) => setNewAgent((a) => ({ ...a, role: e.target.value }))}>
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </select>
              <button onClick={handleCreateAgent} className="btn-primary text-sm sm:col-span-2">Create Agent</button>
            </div>
          )}

          <div className="divide-y divide-luxury-150">
            {agents.map((a, i) => (
              <div key={a.id} className="py-3">
                {editingId === a.id ? (
                  <div className="grid sm:grid-cols-2 gap-3 p-3 rounded-xl bg-luxury-50/50 border border-luxury-200">
                    <input className="input" placeholder="Name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                    <input className="input" placeholder="Email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
                    <input className="input" type="password" placeholder="New password (optional)" value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} />
                    <select className="input" value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}>
                      <option value="agent">Agent</option>
                      <option value="admin">Admin</option>
                    </select>
                    <div className="flex gap-2 sm:col-span-2">
                      <button onClick={() => handleUpdateAgent(a.id)} className="btn-primary text-sm">Save</button>
                      <button onClick={() => setEditingId(null)} className="btn-secondary text-sm">Cancel</button>
                    </div>
                  </div>
                ) : confirmDeleteId === a.id ? (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-red-50 border border-red-200">
                    <p className="text-sm text-red-800">Delete <strong>{a.name}</strong>? Their claimed leads will become unassigned.</p>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => handleDeleteAgent(a.id)} className="btn-danger text-xs py-1.5">Delete</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="btn-secondary text-xs py-1.5">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full ${AVATAR_COLORS[i % 2]} flex items-center justify-center text-white text-xs font-semibold shrink-0`}>
                      {initials(a.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-luxury-800 truncate">{a.name}</p>
                      <p className="text-xs text-luxury-500 truncate">{a.email}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full border capitalize shrink-0 ${
                      a.role === 'admin' ? 'bg-gold-50 text-gold-700 border-gold-200' : 'bg-luxury-100 text-luxury-600 border-luxury-200'
                    }`}>
                      {a.role}
                    </span>
                    <button onClick={() => startEdit(a)} className="p-1.5 text-luxury-400 hover:text-luxury-800 transition-colors" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(a.id)}
                      disabled={a.id === agent?.id || (a.role === 'admin' && adminCount <= 1)}
                      title={a.id === agent?.id ? "Can't delete your own account" : a.role === 'admin' && adminCount <= 1 ? 'Cannot delete the last admin' : 'Delete'}
                      className="p-1.5 text-luxury-400 hover:text-red-600 transition-colors disabled:opacity-30 disabled:hover:text-luxury-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
        <Save className="w-4 h-4" />
        {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}
