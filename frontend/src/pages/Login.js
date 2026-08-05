import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Lock, Mail, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { PARTY_HERO, LOCAL_FALLBACK } from '../config/partyMedia';

/* ──────────────────────────────────────────────────────────────────────────
   Indian tricolour ribbon — saffron / white / green with a navy Ashoka
   Chakra dot in the centre stripe.
   ────────────────────────────────────────────────────────────────────────── */
const TriColourRibbon = () => (
  <div className="tdp-flag-wave inline-flex h-1.5 w-44 overflow-hidden rounded-full shadow-md">
    <div className="flex-1 bg-[#FF9933]" />
    <div className="flex-1 bg-white flex items-center justify-center">
      <div className="h-1 w-1 rounded-full bg-[#000080]" />
    </div>
    <div className="flex-1 bg-[#138808]" />
  </div>
);

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userData = await login(email, password);
      if (userData?.role === 'dial100') {
        navigate('/dial-100-incident-reporting');
      } else {
        navigate('/andhra-pradesh-map'); // Telangana map landing
      }
    } catch (err) {
      // toast handled inside AuthContext
    } finally {
      setLoading(false);
    }
  };

  /* Pre-computed particle layout so SSR & rerenders stay stable */
  const particles = useMemo(
    () =>
      Array.from({ length: 28 }).map((_, i) => ({
        id: i,
        left: `${(i * 7 + 2) % 100}%`,
        size: 3 + ((i * 5) % 6),
        delay: `${(i * 0.6) % 10}s`,
        duration: `${7 + ((i * 2) % 8)}s`,
        drift: `${((i % 2 === 0 ? 1 : -1) * (10 + (i * 5) % 40))}px`,
        colour: i % 3 === 0 ? '#FF9933' : i % 3 === 1 ? '#138808' : '#FFFFFF',
      })),
    []
  );

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden flex items-center justify-center p-4 sm:p-6"
      style={{
        background:
          'radial-gradient(circle at 15% 20%, #FF9933 0%, transparent 35%),' +
          'radial-gradient(circle at 85% 80%, #138808 0%, transparent 40%),' +
          'linear-gradient(135deg, #2b1204 0%, #42200a 35%, #1f2e14 65%, #0f2a1a 100%)',
      }}
    >
      {/* ─── rising particles ─────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {particles.map((p) => (
          <span
            key={p.id}
            className="tdp-particle absolute rounded-full"
            style={{
              left: p.left,
              bottom: '-10px',
              width: p.size,
              height: p.size,
              background: p.colour,
              boxShadow: `0 0 ${p.size * 2}px ${p.colour}`,
              '--particle-duration': p.duration,
              '--particle-delay': p.delay,
              '--particle-drift': p.drift,
              opacity: 0.55,
            }}
          />
        ))}
      </div>

      {/* ─── diagonal pinstripe overlay for depth ────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, transparent 0, transparent 30px, rgba(255,255,255,0.5) 30px, rgba(255,255,255,0.5) 31px)',
        }}
      />

      {/* ─── two-column split: left portrait, right login ─────────────── */}
      <div className="relative z-10 w-full max-w-6xl">
        <div className="relative">
          {/* outer accent glow — saffron to green */}
          <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-br from-orange-400 via-white to-green-600 opacity-80 blur-[2px]" aria-hidden="true" />

          <div className="relative grid grid-cols-1 lg:grid-cols-2 rounded-3xl overflow-hidden bg-white/95 backdrop-blur-xl border border-white/40 shadow-[0_25px_60px_-15px_rgba(124,45,18,0.55)]">

            {/* ───────── LEFT: leader portrait panel ───────── */}
            <div
              className="relative hidden lg:flex flex-col justify-between p-10 text-white overflow-hidden min-h-[640px]"
              style={{
                background:
                  'radial-gradient(circle at 20% 20%, rgba(255,153,51,0.55) 0%, transparent 45%),' +
                  'radial-gradient(circle at 80% 80%, rgba(19,136,8,0.55) 0%, transparent 50%),' +
                  'linear-gradient(135deg, #2b1204 0%, #3a1c07 45%, #14210f 100%)',
              }}
            >
              {/* top: ribbon + party mark */}
              <div className="relative z-10 flex items-center gap-3">
                <TriColourRibbon />
                <span className="text-[10px] font-bold tracking-[0.32em] uppercase text-orange-100/90">
                  INC · Telangana
                </span>
              </div>

              {/* centre: large leader portrait */}
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="relative w-56 h-56 xl:w-64 xl:h-64 mb-6">
                  <div className="absolute inset-0 rounded-full overflow-hidden tdp-glow border-[4px] border-white/95 shadow-2xl">
                    <img
                      src={PARTY_HERO.src}
                      alt={PARTY_HERO.alt}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        if (e.currentTarget.dataset.fallbackUsed) {
                          e.currentTarget.style.display = 'none';
                          return;
                        }
                        e.currentTarget.dataset.fallbackUsed = '1';
                        e.currentTarget.src = LOCAL_FALLBACK;
                      }}
                    />
                  </div>
                </div>

                <h1
                  className="text-4xl xl:text-5xl font-heading font-extrabold tracking-wider uppercase bg-clip-text text-transparent tdp-gradient-shimmer"
                  style={{
                    backgroundImage:
                      'linear-gradient(90deg, #FFB366 0%, #FFFFFF 30%, #FFFFFF 70%, #8FDB8F 100%)',
                  }}
                >
                  Blura Saga
                </h1>
                <p className="mt-2 text-base text-white/95 font-semibold tracking-[0.18em] uppercase">
                  A. Revanth Reddy
                </p>
                <p className="mt-1 text-[11px] text-orange-100/90 font-medium tracking-[0.32em] uppercase">
                  Chief Minister · Telangana
                </p>
                <div className="mx-auto mt-4 h-[2px] w-32 origin-center bg-gradient-to-r from-orange-300 via-white to-green-400 tdp-underline-pulse" />
                <p className="mt-4 text-sm text-white/85 max-w-sm leading-relaxed">
                  Real-time social media intelligence for the INC-led government in Telangana — mentions, sentiment, alerts &amp; grievances of the people of Telangana.
                </p>
              </div>

              {/* bottom: footer tagline */}
              <div className="relative z-10 flex items-center justify-center gap-2 text-[10px] font-semibold tracking-wider uppercase">
                <span className="text-orange-200/90">Indian National Congress</span>
                <span className="h-1 w-1 rounded-full bg-white/80" />
                <span className="text-green-200/90">Telangana</span>
              </div>
            </div>

            {/* ───────── RIGHT: login form panel ───────── */}
            <div className="relative p-6 sm:p-10 lg:p-12 flex flex-col justify-center">
              {/* compact mobile-only hero (left panel is hidden on mobile) */}
              <div className="lg:hidden text-center mb-6">
                <div className="relative mx-auto mb-4 w-24 h-24">
                  <div className="absolute inset-0 rounded-full overflow-hidden tdp-glow border-[3px] border-white/95">
                    <img
                      src={PARTY_HERO.src}
                      alt={PARTY_HERO.alt}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        if (e.currentTarget.dataset.fallbackUsed) {
                          e.currentTarget.style.display = 'none';
                          return;
                        }
                        e.currentTarget.dataset.fallbackUsed = '1';
                        e.currentTarget.src = LOCAL_FALLBACK;
                      }}
                    />
                  </div>
                </div>
                <h1 className="text-2xl font-heading font-extrabold tracking-wider uppercase text-orange-900">
                  Blura Saga
                </h1>
                <p className="text-[11px] text-orange-700/80 font-medium tracking-[0.32em] uppercase mt-0.5">
                  A. Revanth Reddy
                </p>
              </div>

              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-orange-100">
                <div className="relative">
                  <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-amber-300 to-orange-500 blur-sm opacity-70" />
                  <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 shadow-lg">
                    <Shield className="h-5 w-5 text-white" />
                  </div>
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-heading font-bold text-orange-900">
                    Secure Command Access
                  </h2>
                  <p className="text-[11px] text-orange-700/80 font-medium tracking-wide">
                    INC Telangana · Authorised personnel only
                  </p>
                </div>
                <Sparkles className="ml-auto h-4 w-4 text-amber-500 animate-pulse" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-5" data-testid="login-form">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-orange-900">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-500/70 pointer-events-none" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@blurasaga.local"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      data-testid="email-input"
                      className="h-12 pl-10 border-2 border-orange-200 bg-orange-50/30 focus:border-orange-500 focus:ring-orange-500/20 text-base rounded-lg"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-orange-900">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-500/70 pointer-events-none" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      data-testid="password-input"
                      className="h-12 pl-10 border-2 border-orange-200 bg-orange-50/30 focus:border-orange-500 focus:ring-orange-500/20 text-base rounded-lg"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  data-testid="login-submit-btn"
                  className="group relative w-full h-12 overflow-hidden text-base font-extrabold uppercase tracking-wider text-white border-0 rounded-lg shadow-lg shadow-orange-600/40 transition-all duration-200 hover:shadow-xl hover:shadow-orange-600/50 active:scale-[0.985] disabled:opacity-75"
                  style={{
                    background:
                      'linear-gradient(90deg, #CC5500 0%, #FF9933 35%, #52A044 65%, #0F6B2C 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'tdpGradientShimmer 4s linear infinite',
                  }}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Authenticating…
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4" />
                        Enter Command Centre
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </span>
                </Button>
              </form>

              {/* Three quick reassurance pills */}
              <div className="mt-5 grid grid-cols-3 gap-2 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide">
                <div className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-orange-50 text-orange-700 border border-orange-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Encrypted
                </div>
                <div className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-amber-50 text-amber-800 border border-amber-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  24×7 Watch
                </div>
                <div className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-rose-50 text-rose-700 border border-rose-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                  Audit-Logged
                </div>
              </div>

              <p className="mt-6 text-center text-[10px] text-orange-700/60">
                © {new Date().getFullYear()} Blura Saga · Secure intelligence platform
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
