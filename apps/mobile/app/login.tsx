import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { normalizeIndianMobile } from '@kush/core';
import { DevQuickLogin } from '@/components/dev-quick-login';
import { Alert, Button, Field, P, Small, Tabs } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

export default function Login() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<'otp' | 'password'>('otp');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const done = async (r: { token: string | null }) => { if (r.token) { await signIn(r.token); router.replace('/'); } };
  const request = trpc.auth.requestOtp.useMutation({ onSuccess: (r) => { setSent(true); setCooldown(r.resendInSeconds); } });
  const verify = trpc.auth.verifyOtp.useMutation({ onSuccess: done });
  const pw = trpc.auth.loginWithPassword.useMutation({ onSuccess: done });
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(t); }, [cooldown]);
  const err = request.error ?? verify.error ?? pw.error;
  const changeNumber = () => { setSent(false); setCode(''); setCooldown(0); request.reset(); verify.reset(); };
  const mobileOk = !!normalizeIndianMobile(mobile);
  const codeOk = /^\d{6}$/.test(code.trim());
  const pwOk = identifier.trim().length >= 3 && password.length > 0;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <Image source={require('../assets/splash.png')} style={{ width: 160, height: 120, alignSelf: 'center' }} resizeMode="contain" accessibilityLabel="Kush Enterprise" />
          <P muted style={{ textAlign: 'center' }}>Sign in to order, track deliveries and download invoices. Staff: scanning, billing and stock.</P>
          <DevQuickLogin onDone={done} />
          <Tabs value={mode} onChange={setMode} options={[['otp', 'Mobile OTP'], ['password', 'Password']]} />
          {mode === 'otp' ? (
            <View style={{ gap: 12 }}>
              <Field label="Mobile number" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" placeholder="98765 43210" editable={!sent} autoComplete="tel" />
              {sent && <Pressable accessibilityRole="button" onPress={changeNumber} style={{ alignSelf: 'flex-end', paddingVertical: 2 }}><Text style={{ color: C.teal700, fontWeight: '700' }}>Change number</Text></Pressable>}
              {sent && <Field label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" />}
              {!sent ? <Button title="Send code" loading={request.isPending} disabled={!mobileOk} onPress={() => request.mutate({ mobile })} />
                : <Button title="Sign in" loading={verify.isPending} disabled={!codeOk} onPress={() => verify.mutate({ mobile, code: code.trim(), client: 'mobile' })} />}
              {sent && <Button variant="secondary" title={cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'} disabled={cooldown > 0} onPress={() => request.mutate({ mobile })} />}
              {sent && <Small style={{ textAlign: 'center' }}>If this number is registered with us, a code is on its way.</Small>}
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <Field label="Email or mobile" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoComplete="username" />
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
              <Button title="Sign in" loading={pw.isPending} disabled={!pwOk} onPress={() => pw.mutate({ identifier, password, client: 'mobile' })} />
            </View>
          )}
          {err && <Alert>{errorText(err)}</Alert>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
