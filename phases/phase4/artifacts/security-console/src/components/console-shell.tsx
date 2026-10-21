import { type ReactNode, useEffect, useState } from 'react';
import { Activity, BadgeCheck, ChevronRight, CircleDot, FileCheck2, FileText, LayoutDashboard, Menu, ShieldAlert, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { initialSystemStatus, type SystemStatus } from '@/data/demo-data';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/incidents', label: 'Incidents/Attacks', icon: ShieldAlert },
  { href: '/adaptation', label: 'Adaptation History', icon: Activity },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/verification', label: 'SHA-256 Verification', icon: FileCheck2 },
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

export function ConsoleShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const system = useSystemStatus();
  const activeLabel = navItems.find((item) => item.href === location)?.label ?? 'Dashboard';

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 w-[254px] border-r border-sidebar-border bg-sidebar transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-full flex-col px-4 py-5">
          <div className="flex items-center justify-between px-2">
            <Link href="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-3" data-testid="link-brand">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/.18)]"><ShieldAlert size={19} /></div>
              <div><div className="text-sm font-semibold tracking-wide text-foreground">Aegis<span className="text-primary">/</span>Ops</div><div className="mono mt-0.5 text-[9px] uppercase tracking-[.18em] text-muted-foreground">security console</div></div>
            </Link>
            <button onClick={() => setMobileOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent md:hidden" data-testid="button-close-navigation"><X size={17} /></button>
          </div>
          <div className="mt-8 px-2"><div className="mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Command center</div></div>
          <nav className="mt-3 space-y-1">
            {navItems.map((item) => {
              const active = location === item.href;
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className={`group flex items-center gap-3 rounded-lg px-3 py-3 text-[13px] transition-colors ${active ? 'bg-sidebar-accent text-foreground shadow-[inset_3px_0_0_hsl(var(--primary))]' : 'text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground'}`}><Icon size={17} className={active ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'} /><span>{item.label}</span>{active && <ChevronRight size={14} className="ml-auto text-primary" />}</Link>;
            })}
          </nav>
          <div className="mt-auto space-y-3">
            <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-3">
              <div className="flex items-center gap-2"><span className={`status-pulse h-2 w-2 rounded-full ${system.api === 'reachable' ? 'bg-primary' : system.api === 'checking' ? 'bg-accent' : 'bg-destructive'}`} /><span className="text-xs font-medium">System status</span></div>
              <div className="mono mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">{system.api === 'reachable' ? 'api reachable' : system.api === 'checking' ? 'checking api' : 'api unavailable'}</div>
            </div>
            <div className="flex items-center gap-2 px-2 text-[10px] uppercase tracking-[.16em] text-muted-foreground"><CircleDot size={11} className="text-accent" /> Demo environment</div>
          </div>
        </div>
      </aside>
      {mobileOpen && <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-background/75 md:hidden" data-testid="button-dismiss-navigation" />}
      <div className="md:pl-[254px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="rounded-md p-2 text-muted-foreground hover:bg-muted md:hidden" data-testid="button-open-navigation"><Menu size={20} /></button><div className="text-sm text-muted-foreground">{activeLabel}</div><ChevronRight size={14} className="text-muted-foreground/60" /><div className="text-sm font-medium text-foreground">Operations view</div></div>
          <div className="flex items-center gap-3"><div className="hidden items-center gap-2 text-[10px] uppercase tracking-[.16em] text-muted-foreground sm:flex"><BadgeCheck size={14} className="text-primary" /> DEMO DATA</div><div className="h-5 w-px bg-border" /><div className="grid h-8 w-8 place-items-center rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary">AR</div></div>
        </header>
        <main className="grid-hairline min-h-[calc(100dvh-68px)] px-5 py-7 md:px-8 md:py-9"><div className="mx-auto max-w-[1480px]">{children}</div></main>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div className="console-enter"><div className="mono mb-2 text-[10px] uppercase tracking-[.22em] text-primary">{eyebrow}</div><h1 className="text-3xl font-semibold tracking-[-.03em] text-foreground md:text-[38px]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>{action && <div className="console-enter delay-1">{action}</div>}</div>;
}

export function Panel({ children, className = '', testId }: { children: ReactNode; className?: string; testId?: string }) {
  return <section data-testid={testId} className={`rounded-xl border border-card-border bg-card/90 shadow-[0_12px_30px_hsl(210_40%_3%/.12)] ${className}`}>{children}</section>;
}

export function StatusPill({ value, tone }: { value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const resolved = tone ?? (value === 'Critical' || value === 'High' ? 'bad' : value === 'Medium' || value === 'Investigating' ? 'warn' : value === 'Contained' || value === 'Resolved' ? 'good' : 'neutral');
  return <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-wider ${resolved === 'good' ? 'border-primary/25 bg-primary/10 text-primary' : resolved === 'warn' ? 'border-accent/30 bg-accent/10 text-accent' : resolved === 'bad' ? 'border-destructive/25 bg-destructive/10 text-destructive' : 'border-border bg-muted text-muted-foreground'}`}>{value}</span>;
}

export function ScoreBar({ score, label }: { score: number; label: string }) {
  return <div><div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground"><span>{label}</span><span className="mono text-foreground">{score}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${score >= 90 ? 'bg-destructive' : score >= 75 ? 'bg-accent' : 'bg-primary'}`} style={{ width: `${score}%` }} /></div></div>;
}