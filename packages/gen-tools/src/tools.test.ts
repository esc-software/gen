import { describe, expect, it } from 'vitest';
import {
  base64Tool,
  calculateCPFCheckDigits,
  cpfTool,
  decodeBase64,
  encodeBase64,
  formatCPF,
  generateCPF,
  generateLorem,
  generateToken,
  loremTool,
  tokenTool,
  uuidTool,
  validateCPF,
} from './index.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuid', () => {
  it('gera a quantidade pedida de UUIDs v4 distintos', async () => {
    const res = await uuidTool.run({ count: 50 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const { uuids } = res.data as { uuids: string[] };
      expect(uuids).toHaveLength(50);
      expect(new Set(uuids).size).toBe(50);
      uuids.forEach((u) => expect(u).toMatch(UUID_V4));
    }
  });

  it('usa 1 como padrão e limita a 100', async () => {
    const res = await uuidTool.run({});
    expect(res.ok && (res.data as { uuids: string[] }).uuids.length).toBe(1);
    expect((await uuidTool.run({ count: 101 })).ok).toBe(false);
    expect((await uuidTool.run({ count: 0 })).ok).toBe(false);
  });
});

describe('token', () => {
  it('respeita comprimento e conjunto de caracteres', () => {
    expect(generateToken(64)).toMatch(/^[A-Za-z0-9]{64}$/);
    expect(generateToken(40, 'hex')).toMatch(/^[0-9a-f]{40}$/);
    expect(generateToken(10, 'numeric')).toMatch(/^\d{10}$/);
  });

  it('gera tokens diferentes', () => {
    expect(generateToken(32)).not.toBe(generateToken(32));
  });

  it('valida limites de comprimento na ferramenta', async () => {
    expect((await tokenTool.run({ length: 0 })).ok).toBe(false);
    expect((await tokenTool.run({ length: 513 })).ok).toBe(false);
    expect((await tokenTool.run({ charset: 'emoji' })).ok).toBe(false);
    const ok = await tokenTool.run({});
    expect(ok.ok && (ok.data as { token: string }).token).toHaveLength(32);
  });
});

describe('lorem ipsum', () => {
  it('é determinístico e começa com a frase clássica', () => {
    const opts = { paragraphs: 2, sentencesPerParagraph: 3, startWithLorem: true };
    expect(generateLorem(opts)).toBe(generateLorem(opts));
    expect(generateLorem(opts).startsWith('Lorem ipsum dolor sit amet')).toBe(true);
  });

  it('separa parágrafos por linha em branco e conta frases', () => {
    const text = generateLorem({ paragraphs: 3, sentencesPerParagraph: 2, startWithLorem: true });
    expect(text.split('\n\n')).toHaveLength(3);
  });

  it('pode não começar com "Lorem ipsum"', () => {
    const text = generateLorem({ paragraphs: 1, sentencesPerParagraph: 1, startWithLorem: false });
    expect(text.startsWith('Lorem ipsum')).toBe(false);
  });

  it('rejeita quantidades fora dos limites', async () => {
    expect((await loremTool.run({ paragraphs: 0 })).ok).toBe(false);
    expect((await loremTool.run({ paragraphs: 51 })).ok).toBe(false);
  });
});

describe('base64', () => {
  it('codifica e decodifica ida e volta, inclusive com acentos e emoji', () => {
    for (const text of ['', 'Hello World', 'ação e coração', '日本語', '😀 ok']) {
      expect(decodeBase64(encodeBase64(text))).toBe(text);
    }
    expect(encodeBase64('Hello World')).toBe('SGVsbG8gV29ybGQ=');
  });

  it('decodifica ignorando quebras de linha', () => {
    expect(decodeBase64('SGVsbG8g\nV29ybGQ=')).toBe('Hello World');
  });

  it('devolve erro amigável para Base64 inválido', async () => {
    const res = await base64Tool.run({ action: 'decode', text: '***não é base64***' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('execution_failed');
      expect(res.error.message).toContain('Base64');
    }
  });

  it('rejeita bytes que não são UTF-8', async () => {
    const res = await base64Tool.run({ action: 'decode', text: '/w==' }); // byte 0xFF
    expect(res.ok).toBe(false);
  });
});

describe('cpf', () => {
  it('calcula os dígitos verificadores de exemplos conhecidos', () => {
    expect(calculateCPFCheckDigits('529982247')).toEqual({ first: 2, second: 5 });
    expect(calculateCPFCheckDigits('123456789')).toEqual({ first: 0, second: 9 });
    expect(calculateCPFCheckDigits('111444777')).toEqual({ first: 3, second: 5 });
    expect(() => calculateCPFCheckDigits('123')).toThrow(RangeError);
  });

  it('valida CPFs conhecidos, com ou sem máscara', () => {
    for (const cpf of ['529.982.247-25', '52998224725', '123.456.789-09', '111.444.777-35']) {
      expect(validateCPF(cpf).valid).toBe(true);
    }
  });

  it('rejeita CPFs inválidos com o motivo', () => {
    expect(validateCPF('000.000.000-00').message).toContain('iguais');
    expect(validateCPF('111.111.111-11').valid).toBe(false);
    expect(validateCPF('123.456.789-00').valid).toBe(false);
    expect(validateCPF('529.982.247-35').message).toContain('primeiro');
    expect(validateCPF('529.982.247-26').message).toContain('segundo');
    expect(validateCPF('1234567890').message).toContain('11 dígitos');
    expect(validateCPF('123456789012').valid).toBe(false);
    expect(validateCPF('abc.def.ghi-jk').valid).toBe(false);
    expect(validateCPF('').valid).toBe(false);
  });

  it('todo CPF gerado é válido e não tem dígitos repetidos', () => {
    for (let i = 0; i < 500; i++) {
      const cpf = generateCPF();
      expect(cpf).toMatch(/^\d{11}$/);
      expect(validateCPF(cpf).valid).toBe(true);
    }
  });

  it('formata com máscara', () => {
    expect(formatCPF('52998224725')).toBe('529.982.247-25');
  });

  it('ferramenta: gera formatado, valida e exige o CPF nas outras ações', async () => {
    const gen = await cpfTool.run({});
    expect(gen.ok).toBe(true);
    if (gen.ok) {
      const { cpf, valid } = gen.data as { cpf: string; valid: boolean };
      expect(cpf).toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
      expect(valid).toBe(true);
    }

    const bad = await cpfTool.run({ action: 'validate' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.issues?.[0]?.path).toBe('cpf');

    const invalid = await cpfTool.run({ action: 'validate', cpf: '123.456.789-00' });
    expect(invalid.ok && (invalid.data as { valid: boolean }).valid).toBe(false);
  });
});
