'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { safeNext } from '@/lib/safe-next';
import { trpc } from '@/lib/trpc';

type Mode = 'password' | 'otp';

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');
  const done = (u: { role: string; mustChangePassword: boolean }) => {
    const home = u.mustChangePassword ? '/change-password' : u.role === 'CUSTOMER' ? '/portal' : '/app';
    router.replace(u.mustChangePassword ? home : safeNext(next, home));
    router.refresh();
  };

  return (
    <Card className="p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-navy">Sign in</h1>
      <div role="tablist" className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-canvas p-1">
        {([
          ['password', 'Password', KeyRound],
          ['otp', 'Mobile OTP', Smartphone],
        ] as const).map(([m, label, Icon]) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              'flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium',
              mode === m ? 'bg-white text-navy shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>
      <div className="mt-5">{mode === 'password' ? <PasswordForm onDone={done} /> : <OtpForm onDone={done} />}</div>
    </Card>
  );
}

function PasswordForm({ onDone }: { onDone: (u: { role: string; mustChangePassword: boolean }) => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const login = trpc.auth.loginWithPassword.useMutation({ onSuccess: (r) => onDone(r.user) });
  const fe = fieldErrors(login.error);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        login.mutate({ identifier, password, client: 'web' });
      }}
    >
      <TextField label="Email or mobile" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} error={fe.identifier} required autoFocus />
      <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fe.password} required />
      {login.error && !Object.keys(fe).length && <Alert>{errorMessage(login.error)}</Alert>}
      <Button type="submit" size="lg" loading={login.isPending}>Sign in</Button>
    </form>
  );
}

function OtpForm({ onDone }: { onDone: (u: { role: string; mustChangePassword: boolean }) => void }) {
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const request = trpc.auth.requestOtp.useMutation({
    onSuccess: (r) => {
      setSentTo(mobile);
      setCooldown(r.resendInSeconds);
    },
  });
  const verify = trpc.auth.verifyOtp.useMutation({ onSuccess: (r) => onDone(r.user) });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const reqErr = fieldErrors(request.error);
  const verErr = fieldErrors(verify.error);

  if (!sentTo) {
    return (
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); request.mutate({ mobile }); }}>
        <TextField label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={mobile} onChange={(e) => setMobile(e.target.value)} error={reqErr.mobile} required autoFocus />
        {request.error && !reqErr.mobile && <Alert>{errorMessage(request.error)}</Alert>}
        <Button type="submit" size="lg" loading={request.isPending}>Send code</Button>
      </form>
    );
  }
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); verify.mutate({ mobile: sentTo, code, client: 'web' }); }}>
      <p className="text-sm text-muted">If <span className="font-medium text-ink">{sentTo}</span> is registered, a 6-digit code is on its way.</p>
      <TextField label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} error={verErr.code} required autoFocus className="tracking-[0.4em]" />
      {verify.error && !verErr.code && <Alert>{errorMessage(verify.error)}</Alert>}
      <Button type="submit" size="lg" loading={verify.isPending}>Verify &amp; sign in</Button>
      <div className="flex justify-between text-sm">
        <button type="button" className="text-teal-700 hover:underline" onClick={() => { setSentTo(null); setCode(''); verify.reset(); }}>Change number</button>
        <button type="button" disabled={cooldown > 0 || request.isPending} className="text-teal-700 hover:underline disabled:text-muted disabled:no-underline" onClick={() => request.mutate({ mobile: sentTo })}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </form>
  );
}
