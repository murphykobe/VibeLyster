# Maestro iOS eBay OAuth

## One-time setup

1. Install Java (Maestro requires a local JRE/JDK)
2. Install Maestro:
   `curl -Ls "https://get.maestro.mobile.dev" | bash`
3. Build the iOS dev client once:
   `cd apps/mobile && npx expo run:ios`

## Deterministic smoke

Uses mock backend + deterministic deep-link callback — no real eBay credentials needed.

Terminal 1 — server (mock mode):

```bash
cd apps/server && MOCK_MODE=1 npm run dev
```

Terminal 2 — Metro (mock mode, port 8083):

```bash
cd apps/mobile
# set mock env in .env.local:
#   EXPO_PUBLIC_API_URL=http://127.0.0.1:3001
#   EXPO_PUBLIC_MOCK_MODE=1
#   EXPO_PUBLIC_MOCK_USER_ID=maestro-user
#   EXPO_PUBLIC_EBAY_E2E_MODE=1
#   EXPO_PUBLIC_EBAY_TEST_STATE=maestro-ebay-state
npx expo start --dev-client --port 8083
```

Terminal 3 — run:

```bash
cd apps/mobile && npm run maestro:ebay:deterministic
```

The deterministic script auto-resets mock backend state before each run.

## Live sandbox OAuth

Uses real Clerk sign-in + eBay sandbox consent flow.

Terminal 1 — server (sandbox mode):

```bash
cd apps/server && EBAY_SANDBOX=true npm run dev
```

Terminal 2 — Metro (live mode, port 8084):

```bash
cd apps/mobile
# set live env in .env.local (EXPO_PUBLIC_MOCK_MODE=0 or unset)
npx expo start --dev-client --port 8084
```

Terminal 3 — run:

```bash
cd apps/mobile && \
MAESTRO_CLERK_TEST_EMAIL=your-clerk-test-email \
MAESTRO_CLERK_TEST_PASSWORD='your-clerk-test-password' \
MAESTRO_EBAY_SANDBOX_USERNAME=your-ebay-sandbox-username \
MAESTRO_EBAY_SANDBOX_PASSWORD='your-ebay-sandbox-password' \
npm run maestro:ebay:live
```

## Notes

- **Expo dev-client prompts**: Both flows handle `Continue`, `Close`, `Open` prompts from the Expo dev-client shell automatically.
- **iOS deep-link confirmation**: iOS shows an `Open in "VibeLyster"?` sheet for deep links — flows handle this via conditional `tapOn: "Open"`.
- **Sign-in via `pressKey: Enter`**: Maestro `tapOn` can fail to trigger `onPress` on React Native buttons when a text input has focus. The live flow uses `pressKey: Enter` with `onSubmitEditing` on the password field instead.
- **eBay sandbox session caching**: If the sandbox session is still active from a prior run, eBay auto-consents without showing login fields. The flow handles both cases conditionally.
- **Disconnect before connect**: The live flow disconnects any existing eBay connection before reconnecting, so it's idempotent.
