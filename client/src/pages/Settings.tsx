import { useEffect, useState } from 'react';
import {
  Save, CheckCircle, XCircle, Key, Bot, HelpCircle, Bell,
} from 'lucide-react';
import { api, Settings } from '../api';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      setForm({
        openai_api_key: '',
        openai_model: s.settings.openai_model || 'gpt-4o-mini',
        iblusend_api_key: '',
        iblusend_webhook_secret: '',
        iblusend_device_id: s.settings.iblusend_device_id || '',
        zoho_client_id: '',
        zoho_client_secret: '',
        zoho_refresh_token: '',
        demo_mode: s.integrations.demoMode ? 'true' : 'false',
        bot_system_prompt: s.settings.bot_system_prompt || '',
        bot_products_catalog: s.settings.bot_products_catalog || '',
        bot_company_name: s.settings.bot_company_name || 'Nationwide Advance',
        bot_outreach_template: s.settings.bot_outreach_template || '',
        bot_upload_link: s.settings.bot_upload_link || '',
        zoho_notify_on_conversation: s.settings.zoho_notify_on_conversation || 'true',
        zoho_notify_on_escalation: s.settings.zoho_notify_on_escalation || 'true',
        escalation_notify_email: s.settings.escalation_notify_email || 'tech@nationwideadvance.com',
      });
    });
  }, []);

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
    { name: 'iBluSend', key: 'iblusend', configured: !!settings.integrations.iblusend },
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
            <p className="text-luxury-500 mt-1">
              Nationwide Tech Admin trains the bot via <strong className="text-luxury-700">Bot Training</strong> below —
              no coding required. Edit the system prompt, opener, upload link, and product notes anytime.
              Changes apply on the next AI reply. This is prompt engineering on the Nationwide Advance account, not model fine-tuning.
            </p>
          </div>
          <div className="py-4">
            <p className="font-medium text-luxury-900">Zoho notifications during conversations?</p>
            <p className="text-luxury-500 mt-1 leading-relaxed">
              When Zoho CRM is connected, the system adds Notes and Tasks to the lead record on conversation start,
              escalation, human takeover, and deal close. Toggle below. In-app alerts also appear in the dashboard bell icon.
            </p>
          </div>
          <div>
            <p className="font-medium text-luxury-900">Can I take over conversations?</p>
            <p className="text-luxury-500 mt-1">
              Yes. This v1 dashboard is single-user (Nationwide Tech Admin). Click <strong className="text-luxury-700">Take Over</strong> to pause AI
              and reply manually. Click <strong className="text-luxury-700">Resume AI</strong> to hand back to the bot.
              Extra team logins can be added later when approved.
            </p>
          </div>
          <div>
            <p className="font-medium text-luxury-900">Multi-user / team agents?</p>
            <p className="text-luxury-500 mt-1">
              Not in this version. One Nationwide Tech Admin login only. Team agent accounts are deferred until approved.
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
        <p className="text-sm text-luxury-500">
          Nationwide sales script lives here. Login anytime, tweak the opener / objections / rules, hit Save —
          the next AI reply uses your updates. Leads are pre-qualified on the form; AI should push app + 4-month bank statements.
        </p>
        <div>
          <label className="block text-sm text-luxury-500 mb-1">Company Name</label>
          <input className="input" value={form.bot_company_name} onChange={(e) => update('bot_company_name', e.target.value)} placeholder="Nationwide Advance" />
        </div>
        <div>
          <label className="block text-sm text-luxury-500 mb-1">Secure Upload Link (application + 4-month bank statements)</label>
          <input
            className="input"
            value={form.bot_upload_link}
            onChange={(e) => update('bot_upload_link', e.target.value)}
            placeholder="https://..."
          />
          <p className="text-xs text-luxury-400 mt-1">AI will text this link when the lead is ready to send docs.</p>
        </div>
        <div>
          <label className="block text-sm text-luxury-500 mb-1">Products / Services Notes (optional)</label>
          <textarea className="input min-h-[80px]" value={form.bot_products_catalog} onChange={(e) => update('bot_products_catalog', e.target.value)} placeholder="Extra product notes the AI can reference..." />
        </div>
        <div>
          <label className="block text-sm text-luxury-500 mb-1">System Prompt (personality, objections, never-say rules)</label>
          <textarea className="input min-h-[160px] font-mono text-xs" value={form.bot_system_prompt} onChange={(e) => update('bot_system_prompt', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm text-luxury-500 mb-1">
            Outreach Opener (use {'{firstName}'}, {'{name}'}, {'{fundingNeed}'})
          </label>
          <textarea
            className="input min-h-[80px]"
            value={form.bot_outreach_template}
            onChange={(e) => update('bot_outreach_template', e.target.value)}
            placeholder="Hey {firstName}, Thank you for applying..."
          />
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

      <div className="card p-5 space-y-4">
        <h3 className="font-semibold text-luxury-900">iBluSend (iMessage / SMS)</h3>
        <p className="text-sm text-luxury-500">
          Primary messaging channel. Create an API key in iBluSend → Developer → API Keys.
          Point Outbound Webhooks to <code className="text-xs">/api/webhooks/iblusend</code>.
        </p>
        <div>
          <label className="block text-sm text-luxury-500 mb-1">API Key</label>
          <input className="input" type="password" placeholder="iblu_... or iblu_test_..." value={form.iblusend_api_key} onChange={(e) => update('iblusend_api_key', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm text-luxury-500 mb-1">Webhook Signing Secret</label>
          <input className="input" type="password" placeholder="Webhook secret" value={form.iblusend_webhook_secret} onChange={(e) => update('iblusend_webhook_secret', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm text-luxury-500 mb-1">Default Device ID (optional)</label>
          <input className="input" placeholder="device UUID" value={form.iblusend_device_id} onChange={(e) => update('iblusend_device_id', e.target.value)} />
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h3 className="font-semibold text-luxury-900">Escalation Alerts</h3>
        <p className="text-sm text-luxury-500">
          When a lead asks for a human, the dashboard bell rings and an email is sent to this address.
        </p>
        <div>
          <label className="block text-sm text-luxury-500 mb-1">Notify email</label>
          <input
            className="input"
            type="email"
            value={form.escalation_notify_email}
            onChange={(e) => update('escalation_notify_email', e.target.value)}
            placeholder="tech@nationwideadvance.com"
          />
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h3 className="font-semibold text-luxury-900">Zoho CRM</h3>

        <div>
          <label className="block text-sm text-luxury-500 mb-1">OAuth Client ID</label>
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

      <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
        <Save className="w-4 h-4" />
        {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}
