import { type ComponentType, useEffect, useRef } from 'react';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Adaptation as DemoAdaptation,
  Dashboard as DemoDashboard,
  Incidents as DemoIncidents,
  Reports as DemoReports,
  Verification as DemoVerification,
} from '@/pages/security-pages';
import {
  LiveAdaptation,
  LiveDashboard,
  LiveIncidents,
  LiveReports,
  LiveVerification,
} from '@/pages/live-security-pages';
import { DemoRulesNotice, LiveRulesPage } from '@/pages/live-rules-page';
import {
  DemoOperationsNotice,
  LiveDecoysPage,
  LiveAuditPage,
  LiveOperationsPage,
  LiveSelfTestsPage,
} from '@/pages/live-operations-pages';
import {
  LiveAdaptationHistoryPage,
  LiveEvidencePage,
  LiveSystemHealthPage,
} from '@/pages/live-additional-pages';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 },
  },
});
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const configuredClerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#54b9ee',
    colorForeground: '#dce8f2',
    colorMutedForeground: '#91a4b8',
    colorDanger: '#ed7782',
    colorBackground: '#101b2a',
    colorInput: '#0a1421',
    colorInputForeground: '#dce8f2',
    colorNeutral: '#27384b',
    fontFamily: 'Space Grotesk, sans-serif',
    borderRadius: '0.65rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#101b2a] border border-[#27384b] rounded-xl w-[440px] max-w-full overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.28)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#dce8f2] text-xl font-semibold tracking-tight',
    headerSubtitle: 'text-[#91a4b8]',
    socialButtonsBlockButtonText: 'text-[#dce8f2] font-medium',
    formFieldLabel: 'text-[#c3d1df]',
    footerActionLink: 'text-[#59cfc1] hover:text-[#8be1d8]',
    footerActionText: 'text-[#91a4b8]',
    dividerText: 'text-[#91a4b8]',
    identityPreviewEditButton: 'text-[#59cfc1]',
    formFieldSuccessText: 'text-[#67d8aa]',
    alertText: 'text-[#f28b94]',
    logoBox: 'rounded-lg',
    logoImage: 'object-contain',
    socialButtonsBlockButton: 'bg-[#142235] border border-[#2a3d53] text-[#dce8f2] hover:bg-[#192b40]',
    formButtonPrimary: 'bg-[#54b9ee] text-[#071522] hover:bg-[#78caf3]',
    formFieldInput: 'bg-[#0a1421] border-[#2a3d53] text-[#dce8f2]',
    footerAction: 'border-t border-[#27384b]',
    dividerLine: 'bg-[#27384b]',
    alert: 'border-[#ed7782]/30 bg-[#ed7782]/10',
    otpCodeFieldInput: 'bg-[#0a1421] border-[#2a3d53] text-[#dce8f2]',
    formFieldRow: 'text-[#c3d1df]',
    main: 'text-[#dce8f2]',
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const currentQueryClient = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const nextUserId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== nextUserId) {
        currentQueryClient.clear();
      }
      previousUserId.current = nextUserId;
    });
    return unsubscribe;
  }, [addListener, currentQueryClient]);

  return null;
}

function AuthLoading() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background p-6">
      <p className="text-sm text-muted-foreground">Checking operator session…</p>
    </main>
  );
}

function AuthSetupRequired() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-5 py-12 text-foreground">
      <section className="w-full max-w-xl rounded-xl border border-card-border bg-card p-6 shadow-[0_24px_70px_hsl(218_40%_3%/.28)] sm:p-8 md:p-10">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
          <ShieldAlert size={22} />
        </div>
        <p className="mono mt-6 text-[10px] uppercase tracking-[.2em] text-primary">HoneyProbe access control</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Authentication setup required</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          The live console is protected by Clerk and the server-side verified-operator allowlist. Clerk is not configured in this workspace, so live API data stays locked.
        </p>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Configure the existing Clerk server keys, frontend publishable key, and approved operator email list through Replit Secrets and environment settings. No authentication bypass is enabled.
        </p>
        <a href={`${basePath || ''}/?mode=demo`} className="mt-7 inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-xs font-medium text-accent hover:bg-accent/15">
          View clearly labeled demo preview <ArrowRight size={14} />
        </a>
      </section>
    </main>
  );
}

function SignedOutLanding() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-5 py-12 text-foreground">
      <section className="w-full max-w-xl rounded-xl border border-card-border bg-card p-6 shadow-[0_24px_70px_hsl(218_40%_3%/.28)] sm:p-8 md:p-10">
        <div className="grid h-12 w-12 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary"><ShieldAlert size={21} /></div>
        <p className="mono mt-6 text-[10px] uppercase tracking-[.2em] text-primary">HoneyProbe security console</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Protected operator access</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Sign in with a verified operator account to view persisted HoneyProbe telemetry. Sample data is available separately and is never substituted into live views.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/sign-in" className="rounded-lg bg-primary px-4 py-3 text-xs font-semibold text-primary-foreground">Sign in</Link>
          <Link href="/sign-up" className="rounded-lg border border-border px-4 py-3 text-xs text-foreground hover:border-primary/50">Create account</Link>
          <a href={`${basePath || ''}/?mode=demo`} className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-xs text-accent">Open demo preview</a>
        </div>
      </section>
    </main>
  );
}

function GuardedPage({
  live: Live,
  demo: Demo,
}: {
  live: ComponentType;
  demo: ComponentType;
}) {
  const isDemo = new URLSearchParams(window.location.search).get('mode') === 'demo';
  const { isLoaded, isSignedIn } = useAuth();
  if (isDemo) return <Demo />;
  if (!isLoaded) return <AuthLoading />;
  if (!isSignedIn) return <SignedOutLanding />;
  return <Live />;
}

function DashboardRoute() {
  return <GuardedPage live={LiveDashboard} demo={DemoDashboard} />;
}
function IncidentsRoute() {
  return <GuardedPage live={LiveIncidents} demo={DemoIncidents} />;
}
function AdaptationRoute() {
  return <GuardedPage live={LiveAdaptation} demo={DemoAdaptation} />;
}
function ReportsRoute() {
  return <GuardedPage live={LiveReports} demo={DemoReports} />;
}
function VerificationRoute() {
  return <GuardedPage live={LiveVerification} demo={DemoVerification} />;
}
function RulesRoute() {
  return <GuardedPage live={LiveRulesPage} demo={DemoRulesNotice} />;
}
function OperationsRoute() {
  return <GuardedPage live={LiveOperationsPage} demo={DemoOperationsNotice} />;
}
function DecoysRoute() {
  return <GuardedPage live={LiveDecoysPage} demo={DemoOperationsNotice} />;
}
function SelfTestsRoute() {
  return <GuardedPage live={LiveSelfTestsPage} demo={DemoOperationsNotice} />;
}
function AdaptationHistoryRoute() {
  return <GuardedPage live={LiveAdaptationHistoryPage} demo={DemoOperationsNotice} />;
}
function EvidenceRoute() {
  return <GuardedPage live={LiveEvidencePage} demo={DemoOperationsNotice} />;
}
function SystemHealthRoute() {
  return <GuardedPage live={LiveSystemHealthPage} demo={DemoOperationsNotice} />;
}
function AuditRoute() {
  return <GuardedPage live={LiveAuditPage} demo={DemoOperationsNotice} />;
}

function DemoOnlyRouter() {
  return (
    <WouterRouter base={basePath}>
      <Switch>
        <Route path="/" component={DemoDashboard} />
        <Route path="/incidents" component={DemoIncidents} />
        <Route path="/adaptation" component={DemoAdaptation} />
        <Route path="/reports" component={DemoReports} />
        <Route path="/verification" component={DemoVerification} />
        <Route path="/rules" component={DemoRulesNotice} />
        <Route path="/operations" component={DemoOperationsNotice} />
        <Route path="/decoys" component={DemoOperationsNotice} />
        <Route path="/self-tests" component={DemoOperationsNotice} />
        <Route path="/adaptation-history" component={DemoOperationsNotice} />
        <Route path="/evidence" component={DemoOperationsNotice} />
        <Route path="/settings" component={DemoOperationsNotice} />
        <Route path="/audit" component={DemoOperationsNotice} />
        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}

function SignInPage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-4 py-10">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </main>
  );
}

function SignUpPage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-4 py-10">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </main>
  );
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  const clerkPubKey = publishableKeyFromHost(
    window.location.hostname,
    configuredClerkPublishableKey!,
  );

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Operator sign in', subtitle: 'Access the protected HoneyProbe console' } },
        signUp: { start: { title: 'Request operator access', subtitle: 'Access requires a verified allowlisted email' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkQueryClientCacheInvalidator />
      <ErrorBoundary>
        <Switch>
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/" component={DashboardRoute} />
          <Route path="/incidents" component={IncidentsRoute} />
          <Route path="/adaptation" component={AdaptationRoute} />
          <Route path="/reports" component={ReportsRoute} />
          <Route path="/verification" component={VerificationRoute} />
          <Route path="/rules" component={RulesRoute} />
          <Route path="/operations" component={OperationsRoute} />
          <Route path="/decoys" component={DecoysRoute} />
          <Route path="/self-tests" component={SelfTestsRoute} />
          <Route path="/adaptation-history" component={AdaptationHistoryRoute} />
          <Route path="/evidence" component={EvidenceRoute} />
          <Route path="/settings" component={SystemHealthRoute} />
          <Route path="/audit" component={AuditRoute} />
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
    </ClerkProvider>
  );
}

function App() {
  const requestedMode = new URLSearchParams(window.location.search).get('mode');

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {!configuredClerkPublishableKey ? (
          requestedMode === 'live'
            ? <AuthSetupRequired />
            : <DemoOnlyRouter />
        ) : (
          <WouterRouter base={basePath}>
            <ClerkRoutes />
          </WouterRouter>
        )}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
