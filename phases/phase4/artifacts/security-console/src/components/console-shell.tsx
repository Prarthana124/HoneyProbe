import { type ReactNode, useEffect, useState } from 'react';
import { Activity, BadgeCheck, Boxes, ChevronRight, CircleDot, FileCheck2, FileText, FlaskConical, LayoutDashboard, ListChecks, Menu, ScrollText, Settings2, ShieldAlert, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { initialSystemStatus, type SystemStatus } from '@/data/demo-data';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/incidents', label: 'Incidents & Attacks', icon: ShieldAlert },
  { href: '/decoys', label: 'Decoy Services', icon: Boxes },
  { href: '/rules', label: 'Attack Rules', icon: ListChecks },
  { href: '/self-tests', label: 'Self-Testing', icon: FlaskConical },
  { href: '/adaptation', label: 'Adaptive Deception', icon: Activity },
  { href: '/adaptation-history', label: 'Adaptation History', icon: Activity },
  { href: '/evidence', label: 'Evidence Ledger', icon: FileCheck2 },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/verification', label: 'SHA-256 Verification', icon: FileCheck2 },
  { href: '/audit', label: 'Audit Logs', icon: ScrollText },
  { href: '/settings', label: 'Settings & Health', icon: Settings2 },
];

export function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus>(initialSystemStatus);
  useEffect(() => {
    let active = true;
    fetch('/api/healthz', { cache: 'no-store' })
      .then((response) => {
        if (!active) return;
        setStatus((current) => ({ ...current, api: response.ok ? 'reachable' : 'unreachable', lastUpdated: new Date().toISOString() }));
      })
      .catch(() => {
        if (active) setStatus((current) => ({ ...current, api: 'unreachable', lastUpdated: new Date().toISOString() }));
      });
    return () => { active = false; };
  }, []);
  return status;
}

export function ConsoleShell({
  children,
  authControls,
}: {
  children: ReactNode;
  authControls?: ReactNode;
}) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const system = useSystemStatus();
  const demoMode = new URLSearchParams(window.location.search).get('mode') === 'demo';
  const routePath = location.split('?')[0] || '/';
  const activeLabel = navItems.find((item) => item.href === routePath)?.label ?? 'Dashboard';

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <a href="#console-main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to console content
      </a>
      <aside
        id="console-navigation"
        aria-label="Primary navigation"
        className={`fixed inset-y-0 left-0 z-40 w-[226px] border-r border-sidebar-border bg-sidebar transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
          <div className="flex h-full flex-col px-2.5 py-3">
          <div className="flex items-center justify-between px-1.5 py-1">
            <Link href="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-3" data-testid="link-brand">
              <div className="grid h-8 w-8 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary"><ShieldAlert size={16} /></div>
              <div><div className="text-[13px] font-semibold tracking-wide text-foreground">Honey<span className="text-primary">Probe</span></div><div className="mono mt-0.5 text-[8px] uppercase tracking-[.15em] text-muted-foreground">security operations</div></div>
            </Link>
            <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent md:hidden" data-testid="button-close-navigation"><X size={17} /></button>
          </div>
          <div className="mt-5 border-t border-sidebar-border px-2.5 pt-4"><div className="mono text-[8px] uppercase tracking-[.2em] text-muted-foreground">Command center</div></div>
          <nav className="mt-2 max-h-[calc(100dvh-206px)] space-y-0.5 overflow-y-auto px-0.5" aria-label="Console sections">
            {navItems.map((item) => {
              const active = routePath === item.href;
              const Icon = item.icon;
              const href = demoMode ? `${item.href}?mode=demo` : item.href;
              return <Link key={item.href} href={href} onClick={() => setMobileOpen(false)} aria-current={active ? 'page' : undefined} data-testid={`link-nav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className={`group flex min-h-8 items-center gap-2.5 rounded px-2.5 py-1.5 text-[11px] transition-colors ${active ? 'bg-sidebar-accent text-foreground shadow-[inset_2px_0_0_hsl(var(--primary))]' : 'text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground'}`}><Icon size={14} strokeWidth={1.8} className={active ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'} /><span>{item.label}</span>{active && <ChevronRight size={12} className="ml-auto text-primary" />}</Link>;
            })}
          </nav>
          <div className="mt-auto space-y-3">
            <div className="rounded border border-sidebar-border bg-sidebar-accent/35 p-2.5">
              <div className="flex items-center gap-2"><span className={`status-pulse h-1.5 w-1.5 rounded-full ${system.api === 'reachable' ? 'bg-primary' : system.api === 'checking' ? 'bg-accent' : 'bg-destructive'}`} /><span className="text-[11px] font-medium">System status</span></div>
              <div className="mono mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">{demoMode ? 'static sample data' : system.api === 'reachable' ? 'api reachable' : system.api === 'checking' ? 'checking api' : 'api unavailable'}</div>
            </div>
            <div className="flex items-center gap-2 px-2 text-[9px] uppercase tracking-[.12em] text-muted-foreground"><CircleDot size={11} className={demoMode ? 'text-accent' : 'text-primary'} /> {demoMode ? 'Demo preview · static data' : 'Live API · test data excluded'}</div>
          </div>
        </div>
      </aside>
      {mobileOpen && <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-background/75 md:hidden" data-testid="button-dismiss-navigation" />}
      <div className="md:pl-[226px]">
        <header className="sticky top-0 z-20 flex min-h-[54px] items-center justify-between gap-3 border-b border-border bg-background/95 px-3 backdrop-blur-md sm:px-5 md:px-7">
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" aria-label="Open navigation" aria-controls="console-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden" data-testid="button-open-navigation"><Menu size={19} /></button>
            <div className="truncate text-xs text-muted-foreground sm:text-sm">{activeLabel}</div><ChevronRight size={13} className="shrink-0 text-muted-foreground/60" /><div className="hidden text-sm font-medium text-foreground sm:block">Operations view</div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`hidden items-center gap-1.5 text-[9px] font-medium uppercase tracking-[.14em] sm:flex ${demoMode ? 'text-accent' : 'text-primary'}`}><BadgeCheck size={13} />{demoMode ? 'DEMO PREVIEW' : 'LIVE API'}</div>
            <a href={demoMode ? routePath : `${routePath}?mode=demo`} className="whitespace-nowrap rounded-md border border-border px-2.5 py-2 text-[9px] font-medium uppercase tracking-[.08em] text-muted-foreground hover:border-primary/50 hover:text-primary sm:text-[10px]" data-testid="link-toggle-data-mode">{demoMode ? 'Return to live' : 'View demo preview'}</a>
            {authControls && <div className="ml-1">{authControls}</div>}
          </div>
        </header>
          <main id="console-main" tabIndex={-1} className="grid-hairline min-h-[calc(100dvh-54px)] px-3.5 py-5 outline-none sm:px-5 sm:py-6 md:px-7 md:py-7"><div className="mx-auto max-w-[1480px]">{children}</div></main>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-5 flex flex-col justify-between gap-3 border-b border-border/70 pb-4 md:mb-6 md:flex-row md:items-end md:gap-5"><div className="console-enter min-w-0"><div className="mono mb-1.5 text-[8px] uppercase tracking-[.2em] text-primary">{eyebrow}</div><h1 className="text-[24px] font-semibold tracking-[-.035em] text-foreground sm:text-[26px] md:text-[29px]">{title}</h1><p className="mt-1.5 max-w-3xl text-[12px] leading-5 text-muted-foreground">{description}</p></div>{action && <div className="console-enter delay-1 shrink-0">{action}</div>}</div>;
}

export function Panel({ children, className = '', testId, role }: { children: ReactNode; className?: string; testId?: string; role?: 'alert' | 'status' | 'region' }) {
  return <section role={role} data-testid={testId} className={`rounded-md border border-card-border bg-card shadow-[0_5px_18px_hsl(218_40%_3%/.14)] ${className}`}>{children}</section>;
}

export function StatusPill({ value, tone }: { value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const resolved = tone ?? (value === 'Critical' || value === 'High' ? 'bad' : value === 'Medium' || value === 'Investigating' ? 'warn' : value === 'Contained' || value === 'Resolved' ? 'good' : 'neutral');
  return <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-wider ${resolved === 'good' ? 'border-primary/25 bg-primary/10 text-primary' : resolved === 'warn' ? 'border-accent/30 bg-accent/10 text-accent' : resolved === 'bad' ? 'border-destructive/25 bg-destructive/10 text-destructive' : 'border-border bg-muted text-muted-foreground'}`}>{value}</span>;
}

export function ScoreBar({ score, label }: { score: number; label: string }) {
  return <div><div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground"><span>{label}</span><span className="mono text-foreground">{score}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${score >= 90 ? 'bg-destructive' : score >= 75 ? 'bg-accent' : 'bg-primary'}`} style={{ width: `${score}%` }} /></div></div>;
}