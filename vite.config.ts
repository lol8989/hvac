import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ngrok 터널로 사내 공유할 때 Vite의 호스트 검사에 걸리지 않도록 허용한다.
// Vite는 DNS 리바인딩 공격을 막으려고 알 수 없는 Host 헤더를 거부한다("Blocked request").
// 선행 점은 서브도메인 전체를 뜻한다: abc-123.ngrok-free.app
const TUNNEL_HOSTS = ['.ngrok-free.app', '.ngrok.app', '.ngrok.io']

export default defineConfig({
  plugins: [react()],
  server: { allowedHosts: TUNNEL_HOSTS },
  preview: { allowedHosts: TUNNEL_HOSTS },
})
