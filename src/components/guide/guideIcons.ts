import {
  BookOpen,
  Coins,
  Compass,
  Download,
  HelpCircle,
  LifeBuoy,
  Lock,
  MessageCircle,
  PlayCircle,
  Scale,
  Search,
  ShieldCheck,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/** String → lucide-react icon lookup, keeps icon names data-serializable in src/lib/guide.ts. */
export const GUIDE_ICONS: Record<string, LucideIcon> = {
  BookOpen,
  Coins,
  Compass,
  Download,
  HelpCircle,
  LifeBuoy,
  Lock,
  MessageCircle,
  PlayCircle,
  Scale,
  Search,
  ShieldCheck,
  Workflow,
  Zap,
};

export function guideIcon(name: string): LucideIcon {
  return GUIDE_ICONS[name] || BookOpen;
}
