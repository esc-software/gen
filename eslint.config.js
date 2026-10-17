import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-ssr/**', '**/out/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Os contratos atuais ainda usam any; a Fase 2 os substitui por tipos derivados de Zod.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
)
