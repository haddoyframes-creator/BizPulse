/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PAYSTACK_PUBLIC_KEY: string;
  readonly VITE_MONNIFY_API_KEY: string;
  readonly VITE_MONNIFY_CONTRACT_CODE: string;
  readonly VITE_MONNIFY_TEST_MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
