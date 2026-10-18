/**
 * Parte do núcleo sem dependências de execução (sem zod): categorias, descrição de campos de formulário e bytes.
 * O site importa daqui para não carregar o validador no JavaScript inicial.
 */
export * from './category-data.js';
export * from './input-field.js';
export * from './bytes.js';
export { normalizeText } from './text.js';
