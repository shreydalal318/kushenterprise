# Kush Enterprise mobile app (Android + iOS)

One Expo (React Native) app with two modes, chosen by who signs in:

| Customer mode (doctors, hospitals, clinics) | Staff mode (tabs follow the owner's permission ticks) |
|---|---|
| Home: outstanding, recent orders, order again | **Scan**: camera or Bluetooth scanner → product, power, batch, expiry, stock by batch, FEFO pick |
| Catalogue at **their own price**, search by name or **power** | **Orders**: pending first, status steps, **pack & verify by scanning**, dispatch details |
| Power grid with + / − per power, cart, checkout (address, for doctor, patient, surgery date) | **Bill**: scan-to-invoice at the customer's price, live CGST/SGST or IGST, share the PDF |
| Order tracking (timeline, dispatch, back-orders), invoice PDFs to share | **Receive**: scan GS1 boxes (batch, expiry, serial), optionally against an open PO |
| Account balance, ageing, statement PDF, profile change requests | **More**: stock check, offline queue, notifications |

**Weak signal:** the catalogue, orders and account are kept on the phone for a week. Orders (customer) and invoices (staff) placed with no signal are saved and sent automatically when the connection returns; each carries a request id, so a resend never makes a duplicate.

**Camera scanning** reads Code 128, QR, EAN-13/8, UPC and GS1 DataMatrix. A Bluetooth scanner works in the same field.

## Run it on your phone (development)

1. Start the server on your computer: `pnpm dev` (from the repository root).
2. Put your computer's network address in `app.json` → `extra.apiUrl` (for example `http://192.168.1.10:3000`), or run with `EXPO_PUBLIC_API_URL=http://192.168.1.10:3000`.
3. Install **Expo Go** on the phone, then:

```bash
pnpm --filter @kush/mobile start
```

4. Scan the QR code shown in the terminal with the phone (same Wi-Fi). Sign in with a customer mobile (OTP) or a staff email + password.

## Build the store apps

Builds use EAS (Expo Application Services). Set the real server address in `eas.json` first.

```bash
npx eas-cli build --platform android --profile preview
```

```bash
npx eas-cli build --platform all --profile production
```

**Push notifications** need the EAS project id: after `npx eas-cli init`, it is written to `app.json` (`extra.eas.projectId`). Then set `PUSH_PROVIDER=expo` on the server. Until then, notifications still appear in the app's inbox.

## Checks

```bash
pnpm --filter @kush/mobile typecheck
```

```bash
pnpm --filter @kush/mobile export:web   # bundles every screen (also used by CI)
```
