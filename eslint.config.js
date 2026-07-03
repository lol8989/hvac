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

  // Clean Architecture 의존성 게이트: domain은 상위 레이어(application/infrastructure/presentation)를
  // import 할 수 없다(§5.1 규칙1). 재위반을 CI에서 자동 차단한다.
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/application/**', '**/infrastructure/**', '**/presentation/**'], message: 'domain은 상위 레이어를 import할 수 없습니다(Clean Architecture 규칙1).' },
          ],
        },
      ],
    },
  },

  // application은 infrastructure/presentation을 import 할 수 없다(구현은 주입받는다).
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/infrastructure/**', '**/presentation/**'], message: 'application은 구현(infra/presentation)을 import할 수 없습니다.' }] },
      ],
    },
  },

  // 테스트: 어설션 편의를 위해 non-null(!) 및 unbound-method 허용. 테스트는 레이어 게이트 제외.
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'no-restricted-imports': 'off',
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
