import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // 允许 .js 扩展名导入（TypeScript ESM 要求）
      '@typescript-eslint/no-require-imports': 'off',
      // 允许 any（逐步迁移中）
      '@typescript-eslint/no-explicit-any': 'warn',
      // 未使用变量警告（非错误，便于开发）
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // 优先使用 const
      'prefer-const': 'warn',
      // 禁止 var
      'no-var': 'error',
    },
  },
  {
    // 忽略文件
    ignores: ['dist/', 'node_modules/', 'data/', '*.config.js'],
  }
)
