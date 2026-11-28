import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, Share, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '@kush/core';
import { Alert, Badge, Button, Card, H2, LinkButton, Loading, P, Row, s } from '@/components/ui';
import { openPdf } from '@/lib/documents';
import { errorText, rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';

type Icon = keyof typeof Ionicons.glyphMap;
export type Customer = RouterOutputs['sales']['customers'][number];

/** Secondary text that still reads easily: 15px, grey. */
export const Muted = ({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) => (
  <Text numberOfLines={numberOfLines} style={[{ fontSize: 15, lineHeight: 21, color: C.muted }, style]}>{children}</Text>
);
/** The line above the main button that says what happens next, or what is still missing. */
export const Hint = ({ children, tone = 'navy' }: { children: ReactNode; tone?: 'navy' | 'muted' | 'danger' }) => (
  <Text style={{ fontSize: 15, fontWeight: '600', textAlign: 'center', color: tone === 'danger' ? C.danger : tone === 'muted' ? C.muted : C.navy }}>{children}</Text>
);

/** A real calendar day as YYYY-MM-DD (2026-02-30 is not). */
export const isDay = (v: string) => { const d = new Date(`${v}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v); };
/** Whole number as typed, 0 when it isn't one. */
export const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : 0);
/** Rupees as typed ("1500", "1500.5"): the amount, or NaN when it isn't a plain amount. */
export const amountOf = (v: string) => (/^\d+(\.\d{1,2})?$/.test(v.trim()) ? Number(v.trim()) : NaN);
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** The value, once it has stopped changing for a moment (search boxes ask the server less often). */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** A list page: a fixed top (tabs, search), the list, and one pinned button at the bottom. */
export function ListShell({ top, footer, children }: { top?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: C.canvas }}>
      {!!top && <View style={{ padding: 12, paddingBottom: 4, gap: 8 }}>{top}</View>}
      <View style={{ flex: 1 }}>{children}</View>
      {!!footer && <View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white }}>{footer}</View>}
    </SafeAreaView>
  );
}

/** What went wrong, in plain words, and a Try again button. `padded` on list pages (a Screen already pads). */
export function Failed({ error, onRetry, busy, padded }: { error: unknown; onRetry: () => void; busy?: boolean; padded?: boolean }) {
  return (
    <View style={[{ gap: 12 }, padded && { padding: 16 }]}>
      <Alert>{errorText(error)}</Alert>
      <Button variant="secondary" title="Try again" loading={busy} onPress={onRetry} />
    </View>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View style={{ justifyContent: 'center' }}>
      <TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#9aa5b1" autoCorrect={false} returnKeyType="search"
        style={[s.input, { paddingLeft: 38, paddingRight: value ? 44 : 12 }]} />
      <Ionicons name="search" size={18} color={C.muted} style={{ position: 'absolute', left: 12 }} />
      {!!value && (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChange('')} style={{ position: 'absolute', right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close-circle" size={20} color={C.muted} />
        </Pressable>
      )}
    </View>
  );
}

/** A pill to pick one (or several, `multi`) of a few choices: 44px tall, 15px words. */
export function Pick({ label, selected, onPress, disabled, multi }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean; multi?: boolean }) {
  return (
    <Pressable accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityLabel={label} accessibilityState={multi ? { checked: selected, disabled } : { selected, disabled }} onPress={onPress} disabled={disabled}
      style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: selected ? C.teal700 : C.line, backgroundColor: selected ? C.aqua100 : pressed ? C.aqua50 : C.white, opacity: disabled ? 0.5 : 1 })}>
      <Text style={{ fontSize: 15, fontWeight: selected ? '700' : '500', color: selected ? C.navy : C.ink }}>{label}</Text>
    </Pressable>
  );
}

/** A tick box with its words. */
export function Tick({ label, hint, checked, onPress, disabled }: { label: string; hint?: string; checked: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled }} onPress={onPress} disabled={disabled}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={26} color={C.teal700} />
      <View style={{ flex: 1 }}><P style={{ fontWeight: checked ? '700' : '500' }}>{label}</P>{hint ? <Muted>{hint}</Muted> : null}</View>
    </Pressable>
  );
}

/** One of a list (radio button), e.g. which address or doctor. */
export function Choice({ label, hint, selected, onPress }: { label: string; hint?: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, opacity: pressed ? 0.7 : 1 })}>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={24} color={C.teal700} />
      <View style={{ flex: 1 }}><P style={{ fontWeight: selected ? '700' : '500' }}>{label}</P>{hint ? <Muted>{hint}</Muted> : null}</View>
    </Pressable>
  );
}

const roundBtn = { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.teal700, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: C.white };
/** − 3 + with big buttons; the number can also be typed. `value` stays as typed so backspace doesn't snap it back. */
export function Stepper({ value, onChange, label, min = 0, max = 10000, disabled }: { value: string; onChange: (v: string) => void; label: string; min?: number; max?: number; disabled?: boolean }) {
  const n = int(value);
  const bad = value.trim() !== '' && (n < min || n > max);
  return (
    <Row style={{ gap: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`One less ${label}`} disabled={disabled || n <= min} onPress={() => onChange(String(Math.max(min, n - 1)))} style={[roundBtn, (disabled || n <= min) && { opacity: 0.4 }]}>
        <Ionicons name="remove" size={20} color={C.teal700} />
      </Pressable>
      <TextInput accessibilityLabel={`How many ${label}`} value={value} editable={!disabled} onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" selectTextOnFocus
        style={{ minWidth: 56, height: 44, textAlign: 'center', fontWeight: '700', fontSize: 17, color: C.ink, borderWidth: 1, borderColor: bad ? C.danger : C.line, borderRadius: R.sm, backgroundColor: disabled ? C.canvas : C.white }} />
      <Pressable accessibilityRole="button" accessibilityLabel={`One more ${label}`} disabled={disabled || n >= max} onPress={() => onChange(String(Math.min(max, n + 1)))} style={[roundBtn, (disabled || n >= max) && { opacity: 0.4 }]}>
        <Ionicons name="add" size={20} color={C.teal700} />
      </Pressable>
    </Row>
  );
}

/** Label on the left, amount on the right, both readable. */
export function Amount({ k, v, strong, tone }: { k: string; v: ReactNode; strong?: boolean; tone?: 'ok' | 'danger' | 'warn' }) {
  const color = tone === 'ok' ? C.ok : tone === 'danger' ? C.danger : tone === 'warn' ? C.warn : C.ink;
  return (
    <Row style={{ justifyContent: 'space-between', minHeight: 26 }}>
      <Text style={{ fontSize: 15, color: strong ? C.ink : C.muted, fontWeight: strong ? '700' : '400', flexShrink: 1 }}>{k}</Text>
      <Text style={{ fontSize: strong ? 17 : 15, color, fontWeight: strong ? '700' : '500' }}>{v}</Text>
    </Row>
  );
}

/**
 * Download a PDF (invoice, proforma, credit note) and open the share sheet: WhatsApp, email, print, save.
 * `busy` is the path being fetched, so only that button spins.
 */
export function usePdf() {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = async (path: string, filename: string) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(path); setError(null);
    try { await openPdf(path, filename); }
    catch (e) { const t = errorText(e); setError(/pdf/i.test(t) ? t : `Could not open the PDF. ${t}`); }
    finally { busyRef.current = false; setBusy(null); }
  };
  return { open, busy, error };
}

/** The small "PDF" pill used on cards. */
export function PdfPill({ label, busy, disabled, onPress }: { label: string; busy: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={4} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.teal700, backgroundColor: C.white, opacity: pressed ? 0.6 : 1 })}>
      {busy ? <ActivityIndicator size="small" color={C.teal700} /> : <Ionicons name="document-text-outline" size={18} color={C.teal700} />}
      <Text style={{ color: C.teal700, fontWeight: '700', fontSize: 15 }}>PDF</Text>
    </Pressable>
  );
}

/**
 * A link to one PDF that opens without logging in (valid 15 days), like the website's Share button:
 * send it on WhatsApp, by email, or any other app.
 */
export function ShareLink({ kind, id }: { kind: 'invoice' | 'proforma' | 'credit-note'; id: string }) {
  const m = trpc.integrations.shareLink.useMutation();
  const [openError, setOpenError] = useState<string | null>(null);
  const d = m.data;
  const make = () => { setOpenError(null); m.mutate({ kind, id }); };
  if (m.isIdle) return <LinkButton title="Send a link (WhatsApp, email)" icon={<Ionicons name="link-outline" size={18} color={C.teal700} />} onPress={make} />;
  if (m.isPending) return <Loading />;
  if (m.error || !d) return <View style={{ gap: 8 }}><Alert>{errorText(m.error)}</Alert><Button variant="secondary" title="Try again" onPress={make} /></View>;
  const message = `${d.title} from Kush Enterprise:\n${d.url}\n(Link valid for ${d.expiresInDays} days)`;
  const mobile = (d.contact?.mobile ?? '').replace(/\D/g, '');
  const go = (url: string) => void Linking.openURL(url).catch(() => setOpenError('Could not open that app on this phone. Use “Share another way”.'));
  const mail = `mailto:${d.contact?.email ?? ''}?subject=${encodeURIComponent(d.title)}&body=${encodeURIComponent(`Dear ${d.contact?.name ?? 'Sir/Madam'},\n\nPlease find ${d.title} here:\n${d.url}\n\nThe link is valid for ${d.expiresInDays} days.\n\nRegards,\nKush Enterprise`)}`;
  return (
    <View style={{ gap: 8 }}>
      <Alert tone="ok">{`Link ready ✓ Anyone with it can open this one PDF for ${d.expiresInDays} days.`}</Alert>
      <Text selectable style={{ fontSize: 15, color: C.navy, backgroundColor: C.canvas, borderRadius: R.md, padding: 10 }}>{d.url}</Text>
      <Button variant="secondary" title={`WhatsApp${d.contact?.mobile ? ` ${d.contact.mobile}` : ''}`} icon={<Ionicons name="logo-whatsapp" size={20} color={C.ok} />}
        onPress={() => go(`https://wa.me/${mobile}?text=${encodeURIComponent(message)}`)} />
      <Button variant="secondary" title={`Email${d.contact?.email ? ` ${d.contact.email}` : ''}`} icon={<Ionicons name="mail-outline" size={20} color={C.navy} />} onPress={() => go(mail)} />
      <LinkButton title="Share another way" icon={<Ionicons name="share-outline" size={18} color={C.teal700} />}
        onPress={() => void Share.share({ message, title: d.title }).catch(() => setOpenError('Sharing is not available here. Hold the link above to copy it.'))} />
      {!d.contact?.mobile && <Muted>No mobile number saved for {d.contact?.name ?? 'this customer'}: WhatsApp will ask you to pick a chat.</Muted>}
      {!!openError && <Alert tone="warn">{openError}</Alert>}
    </View>
  );
}

/** A yes / no question before something that can't be undone. */
export function Confirm({ question, detail, yes, no = 'No, go back', busy, onYes, onNo }: { question: string; detail?: string; yes: string; no?: string; busy?: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <>
      <Text style={{ fontSize: 16, fontWeight: '700', color: C.danger, textAlign: 'center' }}>{question}</Text>
      {!!detail && <Muted style={{ textAlign: 'center' }}>{detail}</Muted>}
      <Button variant="danger" title={yes} loading={busy} onPress={onYes} />
      <LinkButton tone="muted" title={no} disabled={busy} onPress={onNo} />
    </>
  );
}

const cityOf = (c: Customer) => (c.addresses.find((a) => a.kind === 'BILLING' && a.isDefault) ?? c.addresses.find((a) => a.kind === 'BILLING') ?? c.addresses[0])?.city;
export const customerLine = (c: Customer) => `${c.code}${cityOf(c) ? ` · ${cityOf(c)}` : ''}`;

/** Find the customer by name or code (the list is long). */
export function CustomerPicker({ customers, onPick }: { customers: Customer[]; onPick: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const matches = customers.filter((c) => !term || `${c.name} ${c.code}`.toLowerCase().includes(term));
  return (
    <Card>
      <H2>Customer</H2>
      <SearchBox value={search} onChange={setSearch} placeholder="Search name or code" />
      {matches.slice(0, 12).map((c) => (
        <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`Choose ${c.name}`} onPress={() => onPick(c.id)}
          style={({ pressed }) => ({ minHeight: 48, paddingVertical: 6, paddingHorizontal: 4, borderRadius: R.sm, backgroundColor: pressed ? C.aqua50 : 'transparent' })}>
          <P>{c.name}</P><Muted>{customerLine(c)}</Muted>
        </Pressable>
      ))}
      {matches.length > 12 && <Muted>{`Showing 12 of ${matches.length}. Type more of the name to find others.`}</Muted>}
      {!matches.length && <Muted>{term ? `No customer matches “${search.trim()}”.` : 'No customers yet.'}</Muted>}
    </Card>
  );
}

/** The chosen customer, with a Change button. */
export function ChosenCustomer({ customer, onChange, children }: { customer: Customer; onChange?: () => void; children?: ReactNode }) {
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}><P style={{ fontWeight: '700' }}>{customer.name}</P><Muted>{customerLine(customer)}</Muted></View>
        {onChange && <LinkButton title="Change" onPress={onChange} />}
      </Row>
      {children}
    </Card>
  );
}

/** Less common actions, folded away under "More actions" (same as the order screen). */
export function MoreActions({ actions }: { actions: { icon: Icon; title: string; onPress: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  if (!actions.length) return null;
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 }}>
        <Text style={{ color: C.teal700, fontWeight: '700', fontSize: 15 }}>More actions</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.teal700} />
      </Pressable>
      {open && (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {actions.map((a) => (
            <Pressable key={a.title} accessibilityRole="button" accessibilityLabel={a.title} onPress={() => { setOpen(false); a.onPress(); }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}>
              <Ionicons name={a.icon} size={20} color={a.danger ? C.danger : C.teal700} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: a.danger ? C.danger : C.ink }}>{a.title}</Text>
            </Pressable>
          ))}
        </Card>
      )}
    </View>
  );
}

/** The empty-list card: an icon, what it means, and what to do. */
export function EmptyCard({ icon, title, hint }: { icon: Icon; title: string; hint?: string }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
      <Ionicons name={icon} size={36} color={C.teal700} />
      <P style={{ fontWeight: '700', textAlign: 'center' }}>{title}</P>
      {!!hint && <Muted style={{ textAlign: 'center' }}>{hint}</Muted>}
    </Card>
  );
}

/** Proforma state in plain words. */
const PROFORMA_WORD: Record<string, [string, 'ok' | 'warn' | 'danger' | 'teal' | 'neutral']> = {
  DRAFT: ['Not sent yet', 'neutral'], SENT: ['Sent', 'teal'], CONVERTED: ['Invoiced', 'ok'], EXPIRED: ['Expired', 'warn'], CANCELLED: ['Cancelled', 'danger'],
};
export const proformaWord = (s: string) => (PROFORMA_WORD[s] ?? [s, 'neutral'])[0];
export const ProformaBadge = ({ status }: { status: string }) => <Badge label={proformaWord(status)} tone={(PROFORMA_WORD[status] ?? [status, 'neutral'])[1]} />;

/** "₹1,200 to receive by 05-12-2026". */
export const dueText = (due: number, dueDate: string | null | undefined) => `${rupees(due)} to receive${dueDate ? ` by ${formatDate(dueDate)}` : ''}`;
