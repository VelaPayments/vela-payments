import { Networks } from '@stellar/stellar-sdk';

export interface AppEnv {
  apiBaseUrl: string;
  webauthnRpId: string;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  stellarNetwork: 'testnet' | 'mainnet';
  horizonUrl: string;
  rpcUrl: string;
  usdcIssuer: string;
  networkPassphrase: string;
}

const getEnvVar = (
  key: string,
  configuredValue: string | undefined,
  defaultValue?: string
): string => {
  const value = configuredValue || defaultValue;
  if (!value) {
    throw new Error(`Configuration Error: Missing environment variable [${key}]`);
  }
  return value;
};

// Expo only embeds public environment values accessed with literal dot notation.
const network = getEnvVar(
  'EXPO_PUBLIC_STELLAR_NETWORK',
  process.env.EXPO_PUBLIC_STELLAR_NETWORK,
  'testnet'
) as 'testnet' | 'mainnet';
if (network !== 'testnet' && network !== 'mainnet') {
  throw new Error(
    `Configuration Error: Invalid network profile "${network}". Must be testnet or mainnet.`
  );
}

const apiBaseUrl = getEnvVar(
  'EXPO_PUBLIC_API_URL',
  process.env.EXPO_PUBLIC_API_URL,
  'http://localhost:3000/v1'
);
const webauthnRpId = getEnvVar(
  'EXPO_PUBLIC_WEBAUTHN_RP_ID',
  process.env.EXPO_PUBLIC_WEBAUTHN_RP_ID,
  'dingpayments.app'
);

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || null;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || null;

// Public testnet defaults let the preview build without Vercel environment setup.
// Mainnet must supply every value explicitly and never inherits testnet defaults.
const horizonUrl = getEnvVar(
  'EXPO_PUBLIC_HORIZON_URL',
  process.env.EXPO_PUBLIC_HORIZON_URL,
  network === 'testnet' ? 'https://horizon-testnet.stellar.org' : undefined
);
const rpcUrl = getEnvVar(
  'EXPO_PUBLIC_RPC_URL',
  process.env.EXPO_PUBLIC_RPC_URL,
  network === 'testnet' ? 'https://soroban-testnet.stellar.org' : undefined
);
const usdcIssuer = getEnvVar(
  'EXPO_PUBLIC_USDC_ISSUER',
  process.env.EXPO_PUBLIC_USDC_ISSUER,
  network === 'testnet' ? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' : undefined
);

// Security Guardrail: Mainnet shouldn't accidentally leak defaults
if (network === 'mainnet') {
  if (horizonUrl.includes('testnet') || rpcUrl.includes('testnet')) {
    throw new Error(
      'Security Guardrail: Mainnet network configuration cannot utilize Testnet node endpoints.'
    );
  }
}

export const env: AppEnv = {
  apiBaseUrl,
  webauthnRpId,
  supabaseUrl,
  supabaseAnonKey,
  stellarNetwork: network,
  horizonUrl,
  rpcUrl,
  usdcIssuer,
  networkPassphrase: network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET,
};
