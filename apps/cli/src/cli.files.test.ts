import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';
import { coerce, run, safeFileName } from './cli.js';

function capture(extra: { stdin?: string; cwd?: string } = {}) {
  const buf = { out: '', err: '', bytes: [] as Uint8Array[] };
  return {
    buf,
    io: {
      out: (t: string) => void (buf.out += t),
      err: (t: string) => void (buf.err += t),
      outBytes: (b: Uint8Array) => void buf.bytes.push(b),
      readStdin: async () => extra.stdin ?? '',
      ...(extra.cwd ? { cwd: extra.cwd } : {}),
    },
  };
}

const tmp = () => mkdtemp(join(tmpdir(), 'gen-cli-'));

async function writePdf(dir: string, name: string, pages: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([100, 100]);
  await writeFile(join(dir, name), await doc.save());
}

describe('gen cli: listagem e informações', () => {
  it('list filtra por busca e categoria e omite ferramentas só de navegador', async () => {
    const a = capture();
    await run(['list', '--json', '-c', 'pdf'], a.io);
    const pdf = JSON.parse(a.buf.out) as { id: string; category: string }[];
    expect(pdf.length).toBeGreaterThan(5);
    expect(pdf.every((t) => t.category === 'pdf')).toBe(true);
    expect(pdf.map((t) => t.id)).not.toContain('pdf-para-jpg');
    const b = capture();
    await run(['list', '-q', 'SÊNHA'], b.io);
    expect(b.buf.out).toContain('senha');
    const c = capture();
    expect(await run(['run', 'cronometro'], c.io)).toBe(1);
    expect(c.buf.err).toContain('navegador');
  });

  it('info mostra campos, tipos e padrões', async () => {
    const a = capture();
    expect(await run(['info', 'uuid'], a.io)).toBe(0);
    expect(a.buf.out).toContain('count');
    expect(a.buf.out).toContain('padrão: 1');
    const b = capture();
    await run(['info', 'pdf-unir', '--json'], b.io);
    expect((JSON.parse(b.buf.out) as { fields: { name: string; type: string }[] }).fields[0]).toMatchObject({ name: 'files', type: 'files' });
    expect(await run(['info', 'nada'], capture().io)).toBe(1);
  });
});

describe('gen cli: entrada', () => {
  it('--set converte pelo tipo do campo e sobrepõe o JSON', async () => {
    const a = capture();
    expect(await run(['run', 'uuid', '-i', '{"count":9}', '-s', 'count=2'], a.io)).toBe(0);
    expect((JSON.parse(a.buf.out) as { uuids: string[] }).uuids).toHaveLength(2);
    const b = capture();
    expect(await run(['run', 'uuid', '-s', 'count=abc'], b.io)).toBe(1);
    expect(b.buf.err).toContain('não é um número');
    expect(await run(['run', 'uuid', '-s', 'semigual'], capture().io)).toBe(1);
    expect(await run(['run', 'uuid', '-s', '__proto__=1'], capture().io)).toBe(1);
    expect(coerce(undefined, 'x', '{"a":1}')).toEqual({ a: 1 });
    expect(coerce(undefined, 'x', 'texto')).toBe('texto');
  });

  it('lê da entrada padrão e de arquivo, e recusa combinações ambíguas', async () => {
    const a = capture({ stdin: '{"text":"abc"}' });
    expect(await run(['run', 'base64', '-i', '-'], a.io)).toBe(0);
    expect(JSON.parse(a.buf.out)).toEqual({ result: 'YWJj' });
    const dir = await tmp();
    await writeFile(join(dir, 'in.json'), '{"text":"abc"}');
    const b = capture({ cwd: dir });
    expect(await run(['run', 'base64', '-F', 'in.json'], b.io)).toBe(0);
    expect(JSON.parse(b.buf.out)).toEqual({ result: 'YWJj' });
    expect(await run(['run', 'base64', '-F', 'in.json', '-i', '{}'], capture({ cwd: dir }).io)).toBe(1);
    expect(await run(['run', 'base64', '-F', 'nao-existe.json'], capture({ cwd: dir }).io)).toBe(1);
    expect(await run(['run', 'base64', '-i', '[1]'], capture().io)).toBe(1);
  });
});

describe('gen cli: arquivos', () => {
  it('envia arquivos com --file e grava o resultado com --output, sem sobrescrever sem --force', async () => {
    const dir = await tmp();
    await writePdf(dir, 'a.pdf', 1);
    await writePdf(dir, 'b.pdf', 2);
    const args = ['run', 'pdf-unir', '-f', 'files=a.pdf', '-f', 'files=b.pdf', '-o', 'saida'];
    const a = capture({ cwd: dir });
    expect(await run(args, a.io)).toBe(0);
    const shown = JSON.parse(a.buf.out) as { pages: number; pdf: string };
    expect(shown.pages).toBe(3);
    expect(shown.pdf).toContain('gravado em');
    expect(await readdir(join(dir, 'saida'))).toEqual(['unido.pdf']);
    expect((await PDFDocument.load(await readFile(join(dir, 'saida', 'unido.pdf')))).getPageCount()).toBe(3);
    const b = capture({ cwd: dir });
    expect(await run(args, b.io)).toBe(1);
    expect(b.buf.err).toContain('--force');
    expect(await run([...args, '--force'], capture({ cwd: dir }).io)).toBe(0);
  });

  it('sem --output o binário é omitido; --raw entrega os bytes crus', async () => {
    const dir = await tmp();
    await writePdf(dir, 'a.pdf', 1);
    const a = capture({ cwd: dir });
    expect(await run(['run', 'pdf-numerar-paginas', '-f', 'file=a.pdf'], a.io)).toBe(0);
    expect((JSON.parse(a.buf.out) as { pdf: string }).pdf).toContain('omitidos');
    const b = capture({ cwd: dir });
    expect(await run(['run', 'pdf-numerar-paginas', '-f', 'file=a.pdf', '--raw', 'pdf'], b.io)).toBe(0);
    expect(new TextDecoder().decode(b.buf.bytes[0]!.slice(0, 5))).toBe('%PDF-');
    expect(await run(['run', 'uuid', '--raw', 'uuids'], capture().io)).toBe(1);
    const d = capture();
    expect(await run(['run', 'base64', '-s', 'text=oi', '--raw', 'result'], d.io)).toBe(0);
    expect(d.buf.out).toBe('b2k=\n');
  });

  it('valida arquivos: campo errado, inexistente, vários em campo único, conteúdo falso', async () => {
    const dir = await tmp();
    await writeFile(join(dir, 'x.pdf'), '%PDF-1.4 falso');
    const e1 = capture({ cwd: dir });
    expect(await run(['run', 'uuid', '-f', 'count=x.pdf'], e1.io)).toBe(1);
    expect(e1.buf.err).toContain('não é um campo de arquivo');
    const e2 = capture({ cwd: dir });
    expect(await run(['run', 'pdf-numerar-paginas', '-f', 'file=nao.pdf'], e2.io)).toBe(1);
    expect(e2.buf.err).toContain('não encontrado');
    expect(await run(['run', 'pdf-numerar-paginas', '-f', 'file=x.pdf', '-f', 'file=x.pdf'], capture({ cwd: dir }).io)).toBe(1);
    const e4 = capture({ cwd: dir });
    expect(await run(['run', 'pdf-numerar-paginas', '-f', 'file=x.pdf'], e4.io)).toBe(1);
    expect(e4.buf.err).toContain('corrompido');
  });

  it('nomes de arquivo de saída são sanitizados', () => {
    expect(safeFileName('../../etc/passwd', 'x.bin')).toBe('passwd');
    expect(safeFileName('..\\..\\win.ini', 'x.bin')).toBe('win.ini');
    expect(safeFileName('..', 'x.bin')).toBe('x.bin');
    expect(safeFileName('a:b*c.pdf', 'x.bin')).toBe('a_b_c.pdf');
    expect(safeFileName('', 'x.bin')).toBe('x.bin');
  });
});
