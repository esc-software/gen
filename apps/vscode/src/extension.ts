import * as vscode from 'vscode';
import { bytesToBase64, type Tool } from '@esc/gen-core';
import { registry } from '@esc/gen-tools';
import { QUICK_COMMANDS, displayResult, outputFiles, parseFieldValue, planFields, runQuick, runnableTools, type QuickCommand } from './commands';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MIME: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', csv: 'text/csv', txt: 'text/plain', json: 'application/json' };

async function applyQuick(quick: QuickCommand): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage('Gen: abra um arquivo no editor primeiro.');
    return;
  }
  // Cada seleção é processada separadamente; os resultados são aplicados juntos (uma única ação de desfazer).
  const replacements: { range: vscode.Range; text: string }[] = [];
  for (const selection of editor.selections) {
    const outcome = await runQuick(registry, quick, quick.mode === 'replace' ? editor.document.getText(selection) : '');
    if (!outcome.ok) {
      void vscode.window.showErrorMessage(`Gen: ${outcome.message}`);
      return;
    }
    replacements.push({ range: selection, text: outcome.text });
  }
  await editor.edit((edit) => {
    for (const r of replacements) edit.replace(r.range, r.text);
  });
}

async function pickFiles(field: { name: string; type: string; label: string; accept?: string; maxSizeMB?: number }): Promise<unknown | undefined> {
  const uris = await vscode.window.showOpenDialog({ canSelectMany: field.type === 'files', openLabel: 'Selecionar', title: field.label });
  if (!uris || uris.length === 0) return undefined;
  const limit = Math.min((field.maxSizeMB ?? 50) * 1024 * 1024, MAX_FILE_BYTES);
  const payloads = [];
  for (const uri of uris) {
    const bytes = await vscode.workspace.fs.readFile(uri);
    if (bytes.length > limit) throw new Error(`"${uri.path.split('/').pop()}" é grande demais (limite de ${Math.round(limit / 1024 / 1024)} MB)`);
    const name = uri.path.split('/').pop() ?? 'arquivo';
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    payloads.push({ name, type: MIME[ext] ?? 'application/octet-stream', data: bytesToBase64(bytes) });
  }
  return field.type === 'files' ? payloads : payloads[0];
}

async function collectInput(tool: Tool, selection: string): Promise<Record<string, unknown> | undefined> {
  const input: Record<string, unknown> = {};
  for (const { field, initial } of planFields(tool, selection)) {
    if (field.type === 'file' || field.type === 'files') {
      const files = await pickFiles(field);
      if (files === undefined) {
        if (field.required) return undefined;
        continue;
      }
      input[field.name] = files;
      continue;
    }
    if (field.options) {
      const choice = await vscode.window.showQuickPick(
        field.options.map((o) => ({ label: field.optionLabels?.[o] ?? o, description: o === String(field.default) ? 'padrão' : undefined, value: o })),
        { title: field.label, placeHolder: field.help }
      );
      if (!choice) return undefined;
      input[field.name] = field.type === 'number' || field.type === 'integer' ? Number(choice.value) : choice.value;
      continue;
    }
    if (field.type === 'boolean') {
      const choice = await vscode.window.showQuickPick([{ label: 'Sim', value: true }, { label: 'Não', value: false }], { title: field.label, placeHolder: field.help });
      if (!choice) return undefined;
      input[field.name] = choice.value;
      continue;
    }
    const raw = await vscode.window.showInputBox({
      title: `${tool.name}: ${field.label}${field.required ? ' *' : ''}`,
      prompt: field.help,
      placeHolder: field.placeholder,
      value: initial ?? '',
      validateInput: (text) => {
        const parsed = parseFieldValue(field, text);
        return parsed.ok ? undefined : parsed.message;
      },
    });
    if (raw === undefined) return undefined;
    const parsed = parseFieldValue(field, raw);
    if (parsed.ok && !parsed.skip) input[field.name] = parsed.value;
  }
  return input;
}

async function runTool(): Promise<void> {
  const items = runnableTools(registry).map((t) => ({ label: t.name, description: t.id, detail: t.description, tool: t }));
  const picked = await vscode.window.showQuickPick(items, { title: 'Gen: escolha uma ferramenta', matchOnDescription: true, matchOnDetail: true });
  if (!picked) return;
  const editor = vscode.window.activeTextEditor;
  const selection = editor ? editor.document.getText(editor.selection) : '';
  let input: Record<string, unknown> | undefined;
  try {
    input = await collectInput(picked.tool, selection);
  } catch (e) {
    void vscode.window.showErrorMessage(`Gen: ${e instanceof Error ? e.message : 'não foi possível ler o arquivo'}`);
    return;
  }
  if (!input) return;

  const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Gen: ${picked.tool.name}` }, () => picked.tool.run(input));
  if (!result.ok) {
    const details = (result.error.issues ?? []).map((i) => `${i.path}: ${i.message}`).join('; ');
    void vscode.window.showErrorMessage(`Gen: ${result.error.message}${details ? ` (${details})` : ''}`);
    return;
  }

  for (const file of outputFiles(picked.tool, result.data)) {
    const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(file.fileName), title: `Salvar ${file.fileName}` });
    if (target) {
      await vscode.workspace.fs.writeFile(target, file.bytes);
      void vscode.window.showInformationMessage(`Gen: arquivo salvo em ${target.fsPath}`);
    }
  }
  const text = displayResult(picked.tool, result.data);
  const action = await vscode.window.showQuickPick(
    [
      { label: 'Abrir em um novo documento', value: 'open' },
      { label: 'Copiar para a área de transferência', value: 'copy' },
      ...(editor ? [{ label: 'Inserir no editor', value: 'insert' }] : []),
    ],
    { title: 'O que fazer com o resultado?' }
  );
  if (action?.value === 'open') {
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ content: text, language: 'plaintext' }));
  } else if (action?.value === 'copy') {
    await vscode.env.clipboard.writeText(text);
    void vscode.window.showInformationMessage('Gen: resultado copiado.');
  } else if (action?.value === 'insert' && editor) {
    await editor.edit((edit) => edit.replace(editor.selection, text));
  }
}

export function activate(context: vscode.ExtensionContext): void {
  for (const quick of QUICK_COMMANDS) {
    context.subscriptions.push(vscode.commands.registerCommand(quick.command, () => applyQuick(quick)));
  }
  context.subscriptions.push(vscode.commands.registerCommand('gen.runTool', runTool));
}

export function deactivate(): void {}
