process.env.EXPO_PUBLIC_STELLAR_NETWORK = 'testnet';
process.env.EXPO_PUBLIC_HORIZON_URL = 'https://horizon-testnet.stellar.org';
process.env.EXPO_PUBLIC_RPC_URL = 'https://soroban-testnet.stellar.org';
process.env.EXPO_PUBLIC_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

// Expo's native fetch loader cannot run in Jest or during environment teardown.
// Unit tests mock provider services; fail explicitly if one attempts a real request.
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  writable: true,
  value: jest.fn(() => Promise.reject(new Error('Unexpected network request in unit test'))),
});
