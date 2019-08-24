module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    "project": "./tsconfig.json"
  },
  plugins: [
    '@typescript-eslint',
    'prettier',
  ],
  extends: [
    'plugin:@typescript-eslint/recommended',
    "prettier",
    'prettier/@typescript-eslint',
  ],
}
