import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  // Load .env from project root (one level up from ui/)
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const uiPort = parseInt(env.UI_PORT) || 5173
  const apiPort = parseInt(env.API_PORT) || 8000
  const expressBase = `http://127.0.0.1:${uiPort + 1}`

  return {
    plugins: [tailwindcss(), vue()],
    define: {
      // Injected into the browser bundle — used for direct Python API calls
      __API_BASE__: JSON.stringify(`http://127.0.0.1:${apiPort}`),
    },
    server: {
      port: uiPort,
      strictPort: true,
      proxy: {
        // /config and /db/** go through Express; Python API called directly (CORS enabled)
        '/config': { target: expressBase, changeOrigin: true },
        '/db': { target: expressBase, changeOrigin: true },
        '/scan': { target: expressBase, changeOrigin: true },
      },
    },
  }
})
