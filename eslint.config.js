// ESLint v9 flat config — TypeScript + React(Vite).
// 타입 인지(type-aware) 린팅을 src에 적용하고, 테스트 파일은 일부 규칙을 완화한다.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  // 린트 대상에서 제외
  { ignores: ['dist', 'coverage', 'node_modules'] },

  // 소스(.ts/.tsx): 타입 인지 린팅
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // 도메인 코드에서 의도적으로 unknown을 받는 경우가 있어 완화(필요 시 개별 처리)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // 테스트: 어설션 편의를 위해 non-null(!) 및 unbound-method 허용
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  // 설정 파일(node 환경)
  {
    files: ['*.{ts,js}'],
    languageOptions: {
      globals: globals.node,
    },
  },
)
