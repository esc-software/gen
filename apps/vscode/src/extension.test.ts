import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

type Handler = (...args: unknown[]) => unknown;
const registered = new Map<string, Handler>();
const messages: { kind: string; text: string }[] = [];
const picks: unknown[] = [];
const inputs: (string | undefined)[] = [];
let document = '';
let selections: { start: number; end: number }[] = [];
const clipboard: string[] = [];

vi.mock('vscode', () => ({
  commands: { registerCommand: (id: string, fn: Handler) => (registered.set(id, fn), { dispose() {} }) },
  window: {
    get activeTextEditor() {
      return {
        document: { getText: (r: { start: number; end: number }) => document.slice(r.start, r.end) },
        selections,
        selection: selections[0],
        edit: async (cb: (e: { replace: (r: { start: number; end: number }, t: string) => void }) => void) => {
          const edits: { r: { start: number; end: number }; t: string }[] = [];
          cb({ replace: (r, t) => edits.push({ r, t }) });
          // Aplica de trás para frente para não deslocar os intervalos.
          for (const { r, t } of edits.sort((a, b) => b.r.start - a.r.start)) document = document.slice(0, r.start) + t + document.slice(r.end);
          return true;
        },
      };
    },
    showWarningMessage: async (text: string) => void messages.push({ kind: 'warn', text }),
    showErrorMessage: async (text: string) => void messages.push({ kind: 'error', text }),
    showInformationMessage: async (text: string) => void messages.push({ kind: 'info', text }),
    showQuickPick: async () => picks.shift(),
    showInputBox: async () => inputs.shift(),
    showOpenDialog: async () => undefined,
    showSaveDialog: async () => undefined,
    showTextDocument: async () => undefined,
    withProgress: async (_o: unknown, task: () => unknown) => task(),
  },
  workspace: { openTextDocument: async (o: unknown) => o, fs: {} },
  env: { clipboard: { writeText: async (t: string) => void clipboard.push(t) } },
  ProgressLocation: { Notification: 15 },
  Uri: { file: (p: string) => ({ fsPath: p }) },
}));

const { activate } = await import('./extension');

describe('extensão (com a API do VS Code simulada)', () => {
  beforeEach(() => {
    registered.clear();
    messages.length = 0;
    picks.length = 0;
    inputs.length = 0;
    clipboard.length = 0;
    document = '';
    selections = [{ start: 0, end: 0 }];
    activate({ subscriptions: [] } as never);
  });

  it('registra exatamente os comandos declarados no package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { contributes: { commands: { command: string }[]; menus: { 'editor/context': { command: string }[] } } };
    const declared = pkg.contributes.commands.map((c) => c.command).sort();
    expect([...registered.keys()].sort()).toEqual(declared);
    for (const item of pkg.contributes.menus['editor/context']) expect(declared).toContain(item.command);
  });

  it('transforma a seleção no lugar e atua em várias seleções', async () => {
    document = 'abc def';
    selections = [{ start: 0, end: 3 }, { start: 4, end: 7 }];
    await registered.get('gen.base64Encode')!();
    expect(document).toBe('YWJj ZGVm');
    selections = [{ start: 0, end: 4 }];
    await registered.get('gen.base64Decode')!();
    expect(document).toBe('abc ZGVm');
  });

  it('gera valores no cursor sem apagar o texto existente', async () => {
    document = 'id: ';
    selections = [{ start: 4, end: 4 }];
    await registered.get('gen.generateUuid')!();
    expect(document).toMatch(/^id: [0-9a-f-]{36}$/);
  });

  it('mostra erro em vez de alterar o documento quando a ferramenta recusa', async () => {
    document = '{quebrado';
    selections = [{ start: 0, end: 9 }];
    await registered.get('gen.formatJson')!();
    expect(document).toBe('{quebrado');
    expect(messages.some((m) => m.kind === 'error' && m.text.startsWith('Gen:'))).toBe(true);
    messages.length = 0;
    selections = [{ start: 0, end: 0 }];
    await registered.get('gen.slugify')!();
    expect(messages[0]?.text).toContain('Selecione');
  });

  it('"Executar ferramenta" coleta os campos, executa e copia o resultado', async () => {
    document = 'Olá';
    selections = [{ start: 0, end: 3 }];
    const tool = (await import('@esc/gen-tools')).registry.get('base64')!;
    picks.push({ tool }, { label: 'Codificar', value: 'encode' }, { value: 'copy' });
    inputs.push('Olá');
    await registered.get('gen.runTool')!();
    expect(clipboard).toEqual(['T2zDoQ==']);
  });

  it('cancelar em qualquer etapa não executa nada', async () => {
    await registered.get('gen.runTool')!(); // nenhuma ferramenta escolhida
    expect(clipboard).toEqual([]);
    const tool = (await import('@esc/gen-tools')).registry.get('base64')!;
    picks.push({ tool });
    await registered.get('gen.runTool')!(); // cancelou a ação
    expect(clipboard).toEqual([]);
    expect(messages).toEqual([]);
  });
});
