import type { CategoryId } from './categories.js';
import type { Tool, ToolResult } from './tool.js';

export interface ToolRegistry {
  /** Registra uma ferramenta. Lança se o id já existir (a menos que `replace` seja true). */
  register(tool: Tool, options?: { replace?: boolean }): void;
  registerAll(tools: readonly Tool[]): void;
  get(id: string): Tool | undefined;
  has(id: string): boolean;
  list(): Tool[];
  byCategory(category: CategoryId): Tool[];
  /** Todos os termos precisam aparecer em id, nome, descrição ou palavras-chave (sem acento, sem caixa). */
  search(query: string): Tool[];
  /** Executa pelo id; devolve `not_found` em vez de lançar. */
  run(id: string, rawInput: unknown): Promise<ToolResult>;
  readonly size: number;
}

/** Minúsculas e sem acentos, para busca tolerante. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function createRegistry(): ToolRegistry {
  const tools = new Map<string, Tool>();

  const registry: ToolRegistry = {
    register(tool, options) {
      if (tools.has(tool.id) && !options?.replace) {
        throw new Error(`Ferramenta "${tool.id}" já está registrada`);
      }
      tools.set(tool.id, tool);
    },

    registerAll(list) {
      for (const tool of list) registry.register(tool);
    },

    get: (id) => tools.get(id),
    has: (id) => tools.has(id),
    list: () => [...tools.values()],
    byCategory: (category) => [...tools.values()].filter((t) => t.category === category),

    search(query) {
      const terms = normalizeText(query).split(/\s+/).filter(Boolean);
      if (terms.length === 0) return registry.list();

      const scored: { tool: Tool; score: number }[] = [];
      for (const tool of tools.values()) {
        const name = normalizeText(tool.name);
        const haystack = [tool.id, tool.name, tool.description, ...tool.keywords]
          .map(normalizeText)
          .join(' ');
        if (!terms.every((t) => haystack.includes(t))) continue;
        // Nome e id pesam mais que descrição.
        const score = terms.reduce(
          (sum, t) => sum + (name.includes(t) || tool.id.includes(t) ? 2 : 1),
          0
        );
        scored.push({ tool, score });
      }
      return scored.sort((a, b) => b.score - a.score).map((s) => s.tool);
    },

    async run(id, rawInput) {
      const tool = tools.get(id);
      if (!tool) {
        return { ok: false, error: { code: 'not_found', message: `Ferramenta "${id}" não encontrada` } };
      }
      return tool.run(rawInput);
    },

    get size() {
      return tools.size;
    },
  };

  return registry;
}
