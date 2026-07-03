import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 도메인/애플리케이션 단위 테스트는 node 환경. 컴포넌트 테스트는 파일 상단에
    // // @vitest-environment jsdom 주석으로 개별 지정하거나 별도 설정을 추가한다.
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.{js,ts,jsx,tsx}'],
  },
})
