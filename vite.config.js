import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // เปลี่ยน 'daily-news' เป็นชื่อ Repository ของคุณบน GitHub
  base: './', 
})