import { z } from 'zod';

export interface Category {
  id: string;
  label: string;
  description: string;
}

/** Categorias do catálogo, na ordem em que aparecem na navegação. */
export const CATEGORIES = [
  { id: 'geradores', label: 'Geradores', description: 'Dados de teste, identificadores, tokens e textos' },
  { id: 'validadores', label: 'Validadores', description: 'Documentos, formatos e estruturas' },
  { id: 'contadores', label: 'Contadores', description: 'Palavras, caracteres, linhas e datas' },
  { id: 'conversores', label: 'Conversores', description: 'Codificações, unidades, datas e formatos' },
  { id: 'calculadoras', label: 'Calculadoras', description: 'Finanças, saúde, trabalho e dia a dia' },
  { id: 'formatadores', label: 'Formatadores', description: 'JSON, SQL, HTML, CSS e Markdown' },
  { id: 'pdf', label: 'Ferramentas PDF', description: 'Unir, dividir, converter e proteger PDFs' },
  { id: 'utilidades', label: 'Utilidades', description: 'Imagens, cronômetros, sorteios e mais' },
  { id: 'planilhas', label: 'Planilhas', description: 'Modelos prontos em XLSX e CSV' },
] as const satisfies readonly Category[];

export type CategoryId = (typeof CATEGORIES)[number]['id'];

const ids = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];
export const categoryIdSchema = z.enum(ids);

export function getCategory(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}
