import {
  Radio, AlertTriangle, Pause, Trophy, XCircle, Sparkles, CheckCircle2, type LucideIcon,
} from 'lucide-react';

export type ConversationStatus = 'active' | 'escalated' | 'paused' | 'won' | 'lost' | 'closed';
export type LeadStatus = ConversationStatus | 'new';

export const STATUS_OPTIONS: ConversationStatus[] = ['active', 'escalated', 'paused', 'won', 'lost', 'closed'];

export const STATUS_CONFIG: Record<LeadStatus, {
  label: string;
  description: string;
  icon: LucideIcon;
  badge: string;
  dot: string;
  ring: string;
  hover: string;
  glow: string;
}> = {
  new: {
    label: 'New',
    description: 'Lead created — outreach not started',
    icon: Sparkles,
    badge: 'bg-navy-50 text-navy-700 border-navy-200',
    dot: 'bg-navy-500',
    ring: 'ring-navy-400/40',
    hover: 'hover:bg-navy-50',
    glow: 'shadow-[0_0_16px_rgba(30,58,138,0.15)]',
  },
  active: {
    label: 'Active',
    description: 'AI is handling the conversation',
    icon: Radio,
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-400/40',
    hover: 'hover:bg-emerald-50',
    glow: 'shadow-[0_0_16px_rgba(16,185,129,0.2)]',
  },
  escalated: {
    label: 'Escalated',
    description: 'Requires human attention',
    icon: AlertTriangle,
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    ring: 'ring-amber-400/40',
    hover: 'hover:bg-amber-50',
    glow: 'shadow-[0_0_16px_rgba(245,158,11,0.2)]',
  },
  paused: {
    label: 'Paused',
    description: 'Agent took over — AI paused',
    icon: Pause,
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    dot: 'bg-sky-500',
    ring: 'ring-sky-400/40',
    hover: 'hover:bg-sky-50',
    glow: 'shadow-[0_0_16px_rgba(14,165,233,0.2)]',
  },
  won: {
    label: 'Won',
    description: 'Deal closed successfully',
    icon: Trophy,
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dot: 'bg-emerald-600',
    ring: 'ring-emerald-400/40',
    hover: 'hover:bg-emerald-50',
    glow: 'shadow-gold',
  },
  lost: {
    label: 'Lost',
    description: 'Deal closed — no sale',
    icon: XCircle,
    badge: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500',
    ring: 'ring-red-400/40',
    hover: 'hover:bg-red-50',
    glow: 'shadow-[0_0_16px_rgba(239,68,68,0.15)]',
  },
  closed: {
    label: 'Closed',
    description: 'Conversation closed — no won/lost outcome recorded',
    icon: CheckCircle2,
    badge: 'bg-luxury-100 text-luxury-600 border-luxury-200',
    dot: 'bg-luxury-400',
    ring: 'ring-luxury-400/40',
    hover: 'hover:bg-luxury-100',
    glow: 'shadow-[0_0_16px_rgba(168,154,114,0.15)]',
  },
};

export function getStatusConfig(status: string) {
  return STATUS_CONFIG[status as ConversationStatus] ?? STATUS_CONFIG.active;
}
