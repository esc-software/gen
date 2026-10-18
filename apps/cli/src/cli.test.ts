import { describe, expect, it } from 'vitest';
import { run } from './cli.js';

function capture() {
  const buf = { out: '', err: '' };
  return {
    buf,
    io: {
      out: (t: string) => void (buf.out += t),
      err: (t: string) => void (buf.err += t),
    },
  };
}

describe('gen cli', () => {
  it('list --json lista as ferramentas registradas', async () => {
    const { buf, io } = capture();
    expect(await run(['list', '--json'], io)).toBe(0);
    const ids = (JSON.parse(buf.out) as { id: string }[]).map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['uuid', 'token', 'cpf', 'base64', 'lorem-ipsum']));
  });

  it('--version imprime a versão e sai com 0', async () => {
    const { buf, io } = capture();
    expect(await run(['--version'], io)).toBe(0);
    expect(buf.out.trim()).toBe('0.4.0');
  });

  it('comando desconhecido sai com código diferente de zero e escreve em stderr', async () => {
    const { buf, io } = capture();
    expect(await run(['nada'], io)).not.toBe(0);
    expect(buf.err).toContain('nada');
  });

  it('run executa uma ferramenta e imprime o resultado em stdout', async () => {
    const { buf, io } = capture();
    const code = await run(['run', 'base64', '--input', '{"text":"Hello World"}'], io);
    expect(code).toBe(0);
    expect(JSON.parse(buf.out)).toEqual({ result: 'SGVsbG8gV29ybGQ=' });
    expect(buf.err).toBe('');
  });

  it('run com entrada inválida escreve os problemas em stderr e sai com 1', async () => {
    const { buf, io } = capture();
    const code = await run(['run', 'cpf', '--input', '{"action":"validate"}'], io);
    expect(code).toBe(1);
    expect(buf.out).toBe('');
    expect(buf.err).toContain('cpf: Informe o CPF');
  });

  it('run com ferramenta inexistente ou JSON quebrado sai com 1', async () => {
    const a = capture();
    expect(await run(['run', 'nada'], a.io)).toBe(1);
    expect(a.buf.err).toContain('não encontrada');
    const b = capture();
    expect(await run(['run', 'uuid', '--input', '{'], b.io)).toBe(1);
    expect(b.buf.err).toContain('JSON');
  });
  it('campo desconhecido em --set é erro de uso (não vira resultado do valor padrão)', async () => {
    const { buf, io } = capture();
    expect(await run(['run', 'salario-liquido', '-s', 'grossSalary=5000'], io)).toBe(1);
    expect(buf.err).toContain('Campo desconhecido "grossSalary"');
    expect(buf.err).toContain('gross');
    expect(buf.out).toBe('');
  });

  it('o campo certo funciona e muda o resultado', async () => {
    const a = capture();
    const b = capture();
    expect(await run(['run', 'salario-liquido', '-s', 'gross=3000'], a.io)).toBe(0);
    expect(await run(['run', 'salario-liquido', '-s', 'gross=8000'], b.io)).toBe(0);
    expect((JSON.parse(b.buf.out) as { net: number }).net).toBeGreaterThan((JSON.parse(a.buf.out) as { net: number }).net);
  });
});
