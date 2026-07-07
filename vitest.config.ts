import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // 도메인/애플리케이션 단위 테스트는 node 환경. 컴포넌트 테스트는 파일 상단에
    // /** @vitest-environment jsdom */ 독블록으로 개별 지정한다.
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.{js,ts,jsx,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
