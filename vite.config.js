import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: [
      'rmpprojectsystem.serveousercontent.com',
      '.serveousercontent.com', // allows any serveo subdomain, in case it changes on reconnect
      '.ngrok-free.dev',        // allows any ngrok free-tier subdomain
      '.ngrok-free.app',        // ngrok's other free-tier domain suffix
      '.ngrok.io'                // older ngrok domain suffix, just in case
    ]
  }
})
