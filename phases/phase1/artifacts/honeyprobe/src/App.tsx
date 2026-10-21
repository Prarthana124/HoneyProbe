import { useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Activity, ArrowRight, ShieldCheck } from 'lucide-react';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { setBaseUrl } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  OverviewPage, TelemetryPage, DecoysPage, SessionsPage, SessionDetailPage,
  AnalyticsPage, SelfTestPage, ReportsPage, SettingsPage, DecoySite,
} from '@/pages/honeyprobe';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
});
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY for HoneyProbe authentication.');
}

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
    colorPrimary: '#f5b544',
    colorForeground: '#f1f5fa',
    colorMutedForeground: '#94a3b8',
    colorDanger: '#ff7185',
    colorBackground: '#101722',
    colorInput: '#0b1119',
    colorInputForeground: '#e2e8f0',
    colorNeutral: '#273447',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#101722] border border-[#273447] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#f1f5fa] text-xl font-semibold',
    headerSubtitle: 'text-[#94a3b8]',
    socialButtonsBlockButtonText: 'text-[#e2e8f0] font-medium',
    formFieldLabel: 'text-[#cbd5e1]',
    footerActionLink: 'text-[#ffd780] hover:text-[#f5b544]',
    footerActionText: 'text-[#94a3b8]',
    dividerText: 'text-[#718096]',
    identityPreviewEditButton: 'text-[#ffd780]',
    formFieldSuccessText: 'text-[#4ddba1]',
    alertText: 'text-[#ff8b99]',
    logoBox: 'rounded-lg',
    logoImage: 'object-contain',
    socialButtonsBlockButton: 'bg-[#151f2c] border border-[#273447] text-[#e2e8f0]',
    formButtonPrimary: 'bg-[#f5b544] text-[#10131a] hover:bg-[#ffd780]',
    formFieldInput: 'bg-[#0b1119] border-[#273447] text-[#e2e8f0]',
    footerAction: 'border-t border-[#273447]',
    dividerLine: 'bg-[#273447]',
    alert: 'border-[#ff5c70]/30 bg-[#ff5c70]/10',
    otpCodeFieldInput: 'bg-[#0b1119] border-[#273447] text-[#f1f5fa]',
    formFieldRow: 'text-[#cbd5e1]',
    main: 'text-[#e2e8f0]',
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

function HoneyProbeLanding() {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#080c11] px-5 py-12 text-[#f1f5fa]">
      <div className="honeycomb pointer-events-none absolute inset-0 opacity-60" />
      <section className="relative w-full max-w-2xl rounded-3xl border border-[#273447] bg-[#0c111a]/95 p-7 shadow-2xl shadow-black/30 sm:p-11">
        <div className="flex items-center gap-3">
          <img src={`${basePath}/logo.svg`} alt="" className="h-11 w-11" />
          <div>
            <p className="text-lg font-bold tracking-[-.04em]">honey<span className="text-[#f5b544]">probe</span></p>
            <p className="eyebrow mt-0.5">PRIVATE RESEARCH CONSOLE</p>
          </div>
        </div>
        <div className="mt-12 max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#f5b544]/20 bg-[#f5b544]/10 px-3 py-1.5 text-[10px] text-[#ffd780]">
            <ShieldCheck size={13} /> Verified operator access
          </div>
          <h1 className="text-3xl font-semibold tracking-[-.05em] sm:text-5xl">A controlled view of your security lab.</h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-[#94a3b8]">
            HoneyProbe is restricted to signed-in operators whose verified email is on the workspace allowlist. Sign in to open the telemetry console.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={`${basePath}/sign-in`} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#f5b544] px-5 text-sm font-semibold text-[#10131a] transition-colors hover:bg-[#ffd780]">
              Operator sign in <ArrowRight size={15} />
            </a>
            <a href={`${basePath}/sign-up`} className="inline-flex h-11 items-center rounded-lg border border-[#273447] bg-[#101722] px-5 text-sm font-medium text-[#d4deeb] transition-colors hover:border-[#40526b]">
              Create an account
            </a>
          </div>
          <p className="mt-6 flex items-center gap-2 text-[11px] leading-5 text-[#718096]">
            <Activity size={13} className="shrink-0 text-[#52d8f2]" />
            Dashboard data and non-health API routes are protected by the same server-side access check.
          </p>
        </div>
      </section>
    </main>
  );
}

function AuthPageFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[#080c11] px-4 py-10 text-[#f1f5fa]">
      <div className="honeycomb pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mb-6 flex items-center gap-3">
        <img src={`${basePath}/logo.svg`} alt="" className="h-10 w-10" />
        <div>
          <p className="text-base font-bold tracking-[-.04em]">honey<span className="text-[#f5b544]">probe</span></p>
          <p className="eyebrow mt-0.5">CONTROLLED LAB</p>
        </div>
      </div>
      <p className="relative mb-4 text-center text-[10px] font-medium uppercase tracking-[.15em] text-[#94a3b8]">{label}</p>
      <div className="relative w-full max-w-[440px]">{children}</div>
      <p className="relative mt-5 max-w-md text-center text-[10px] leading-5 text-[#718096]">
        Access is limited to verified accounts on the operator allowlist.
      </p>
    </main>
  );
}

function SignInPage() {
  return (
    <AuthPageFrame label="Private operator access">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthPageFrame>
  );
}

function SignUpPage() {
  return (
    <AuthPageFrame label="Create an operator account">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthPageFrame>
  );
}

function HomeRoute() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/overview" />
      </Show>
      <Show when="signed-out">
        <HoneyProbeLanding />
      </Show>
    </>
  );
}

function AccessDenied() {
  const { signOut } = useClerk();
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#080c11] px-5 text-[#f1f5fa]">
      <section className="w-full max-w-lg rounded-2xl border border-[#273447] bg-[#101722] p-8 text-center">
        <ShieldCheck size={30} className="mx-auto text-[#f5b544]" />
        <h1 className="mt-5 text-xl font-semibold">This account is not authorized</h1>
        <p className="mt-3 text-sm leading-6 text-[#94a3b8]">HoneyProbe data is available only to the verified operator account configured for this workspace.</p>
        <button
          type="button"
          onClick={() => void signOut({ redirectUrl: basePath || '/' })}
          className="mt-6 rounded-lg border border-[#273447] px-4 py-2.5 text-sm font-medium text-[#e2e8f0] hover:bg-[#151f2c]"
        >
          Sign out
        </button>
      </section>
    </main>
  );
}

function AccessCheck() {
  const { userId } = useAuth();
  const [status, setStatus] = useState<'checking' | 'authorized' | 'denied' | 'error'>('checking');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('checking');
    fetch('/api/auth/status')
      .then((response) => {
        if (response.status === 403) return 'denied' as const;
        if (!response.ok) throw new Error('Access verification failed.');
        return 'authorized' as const;
      })
      .then((nextStatus) => {
        if (active) setStatus(nextStatus);
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => { active = false; };
  }, [userId, retry]);

  if (status === 'checking') {
    return <div role="status" className="flex min-h-[100dvh] items-center justify-center bg-[#080c11] text-sm text-[#94a3b8]">Verifying operator access…</div>;
  }
  if (status === 'denied') return <AccessDenied />;
  if (status === 'error') {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#080c11] px-5 text-[#f1f5fa]">
        <section className="w-full max-w-md rounded-2xl border border-[#273447] bg-[#101722] p-8 text-center">
          <h1 className="text-lg font-semibold">Access could not be verified</h1>
          <p className="mt-3 text-sm leading-6 text-[#94a3b8]">The access service is unavailable. No dashboard data has been loaded.</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-5 rounded-lg bg-[#f5b544] px-4 py-2.5 text-sm font-semibold text-[#10131a]">Retry</button>
        </section>
      </main>
    );
  }
  return <DashboardRoutes />;
}

function ProtectedRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) {
    return <div role="status" className="flex min-h-[100dvh] items-center justify-center bg-[#080c11] text-sm text-[#94a3b8]">Loading secure workspace…</div>;
  }
  if (!isSignedIn) return <Redirect to="/" />;
  return <AccessCheck />;
}

function DashboardRoutes() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={() => <Redirect to="/overview" />} />
        <Route path="/overview" component={OverviewPage} />
        <Route path="/telemetry" component={TelemetryPage} />
        <Route path="/decoys" component={DecoysPage} />
        <Route path="/sessions" component={SessionsPage} />
        <Route path="/sessions/:id" component={SessionDetailPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/self-test" component={SelfTestPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/decoy" component={DecoySite} />
        <Route path="/decoy/about" component={DecoySite} />
        <Route path="/decoy/login" component={DecoySite} />
        <Route path="/decoy/admin" component={DecoySite} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: 'HoneyProbe operator sign-in',
            subtitle: 'Sign in with your verified, authorized operator account.',
          },
        },
        signUp: {
          start: {
            title: 'Create an operator account',
            subtitle: 'Only verified accounts on the allowlist can use HoneyProbe.',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          <Switch>
            <Route path="/" component={HomeRoute} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route component={ProtectedRoute} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  setBaseUrl(import.meta.env.VITE_API_BASE_URL?.trim() || null);
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
