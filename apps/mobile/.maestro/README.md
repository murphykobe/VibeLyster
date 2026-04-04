# Maestro iOS eBay OAuth

## One-time setup

1. Install Java (Maestro requires a local JRE/JDK)
2. Install Maestro:
   `curl -Ls "https://get.maestro.mobile.dev" | bash`
3. Build the iOS dev client once:
   `cd apps/mobile && npx expo run:ios`

## Deterministic smoke

Terminal 1:

```bash
cd apps/server && MOCK_MODE=1 npm run dev
```

Terminal 2:

```bash
cd apps/mobile && \
EXPO_PUBLIC_API_URL=http://127.0.0.1:3001 \
EXPO_PUBLIC_MOCK_MODE=1 \
EXPO_PUBLIC_MOCK_USER_ID=maestro-user \
EXPO_PUBLIC_EBAY_CLIENT_ID=mock-ebay-client-id \
EXPO_PUBLIC_EBAY_RU_NAME=mock-ebay-ru-name \
EXPO_PUBLIC_EBAY_E2E_MODE=1 \
EXPO_PUBLIC_EBAY_TEST_STATE=maestro-ebay-state \
npx expo start --dev-client
```

Terminal 3:

```bash
cd apps/mobile && npm run maestro:ebay:deterministic
```

## Live sandbox OAuth

Terminal 1 (server must use sandbox):

```bash
cd apps/server && EBAY_SANDBOX=true npm run dev
```

Terminal 2:

```bash
cd apps/mobile && \
EXPO_PUBLIC_API_URL=http://127.0.0.1:3001 \
EXPO_PUBLIC_EBAY_CLIENT_ID=your-ebay-client-id \
EXPO_PUBLIC_EBAY_RU_NAME=your-ebay-ru-name \
EXPO_PUBLIC_EBAY_SANDBOX=true \
npx expo start --dev-client
```

Terminal 3:

```bash
cd apps/mobile && \
MAESTRO_CLERK_TEST_EMAIL=your-clerk-test-email \
MAESTRO_CLERK_TEST_PASSWORD='your-clerk-test-password' \
MAESTRO_EBAY_SANDBOX_USERNAME=your-ebay-sandbox-username \
MAESTRO_EBAY_SANDBOX_PASSWORD='your-ebay-sandbox-password' \
npm run maestro:ebay:live
```
