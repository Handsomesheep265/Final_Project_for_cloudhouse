/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端接口地址，默认 http://127.0.0.1:3000，可在 .env 里覆盖 */
  readonly VITE_API_BASE?: string
}
