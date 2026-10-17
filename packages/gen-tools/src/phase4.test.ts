import { describe, expect, it } from 'vitest';
import {
  buildGradient,
  calculateCNPJCheckDigits,
  convertBase,
  convertFileSize,
  convertTemperature,
  countCharacters,
  countLines,
  countSyllablesPt,
  countWords,
  describeJsonError,
  differenceBetween,
  generateCNH,
  generateCNPJ,
  generatePIS,
  hashText,
  parseColorStops,
  parseIsoDate,
  passwordTool,
  processJson,
  removeDiacritics,
  slugify,
  validateCNH,
  validateCNPJ,
  validatePIS,
  generatePassword,
  cnpjTool,
  cnhTool,
  pisTool,
  jsonTool,
  hashTool,
  gradientTool,
  temperatureTool,
  numberBaseTool,
  urlEncodeTool,
  daysBetweenTool,
} from './index.js';
import { positionToLineColumn } from './json.js';

const run = async (tool: { run: (i: unknown) => Promise<unknown> }, input: unknown) =>
  (await tool.run(input)) as { ok: true; data: Record<string, unknown> } | { ok: false; error: { code: string; message: string; issues?: { path: string }[] } };

describe('senha', () => {
  const base = { length: 16, lowercase: true, uppercase: true, digits: true, symbols: true, excludeAmbiguous: false };

  it('tem o tamanho pedido e ao menos um caractere de cada classe', () => {
    for (let i = 0; i < 200; i++) {
      const { password } = generatePassword({ ...base, length: 4 });
      expect(password).toHaveLength(4);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/\d/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it('respeita as classes desligadas e exclui caracteres ambíguos', () => {
    for (let i = 0; i < 100; i++) {
      const { password } = generatePassword({ ...base, length: 64, symbols: false, digits: false, excludeAmbiguous: true });
      expect(password).toMatch(/^[A-Za-z]+$/);
      expect(password).not.toMatch(/[IlOo]/);
    }
  });

  it('estima a entropia pelo tamanho do alfabeto', () => {
    const { entropyBits } = generatePassword({ ...base, length: 10, lowercase: false, uppercase: false, symbols: false });
    expect(entropyBits).toBeCloseTo(10 * Math.log2(10), 1);
  });

  it('gera senhas diferentes', () => {
    expect(generatePassword(base).password).not.toBe(generatePassword(base).password);
  });

  it('rejeita configuração sem nenhuma classe e tamanhos fora do limite', async () => {
    const none = await run(passwordTool, { lowercase: false, uppercase: false, digits: false, symbols: false });
    expect(none.ok).toBe(false);
    expect((await run(passwordTool, { length: 3 })).ok).toBe(false);
    expect((await run(passwordTool, { length: 129 })).ok).toBe(false);
  });
});

describe('cnpj', () => {
  it('calcula os dígitos de exemplos conhecidos (numérico e alfanumérico)', () => {
    expect(calculateCNPJCheckDigits('112223330001')).toEqual({ first: 8, second: 1 });
    expect(calculateCNPJCheckDigits('114447770001')).toEqual({ first: 6, second: 1 });
    expect(calculateCNPJCheckDigits('12ABC34501DE')).toEqual({ first: 3, second: 5 });
    expect(() => calculateCNPJCheckDigits('123')).toThrow(RangeError);
  });

  it('valida CNPJs com e sem máscara, inclusive em minúsculas', () => {
    for (const v of ['11.222.333/0001-81', '11222333000181', '11.444.777/0001-61', '12.ABC.345/01DE-35', '12.abc.345/01de-35']) {
      expect(validateCNPJ(v).valid).toBe(true);
    }
  });

  it('rejeita CNPJs inválidos com o motivo', () => {
    expect(validateCNPJ('00.000.000/0000-00').message).toContain('iguais');
    expect(validateCNPJ('11.222.333/0001-82').message).toContain('segundo');
    expect(validateCNPJ('11.222.333/0001-91').message).toContain('primeiro');
    expect(validateCNPJ('11.222.333/0001-00').message).toContain('incorretos');
    expect(validateCNPJ('1122233300018').message).toContain('14');
    expect(validateCNPJ('11.222.333/0001-A1').message).toContain('números');
    expect(validateCNPJ('11$222').valid).toBe(false);
  });

  it('todo CNPJ gerado é válido; no modo alfanumérico contém letra', () => {
    for (let i = 0; i < 300; i++) {
      const numeric = generateCNPJ();
      expect(numeric).toMatch(/^\d{14}$/);
      expect(validateCNPJ(numeric).valid).toBe(true);
      const alnum = generateCNPJ(true);
      expect(alnum).toMatch(/^[0-9A-Z]{12}\d{2}$/);
      expect(alnum.slice(0, 8)).toMatch(/[A-Z]/);
      expect(validateCNPJ(alnum).valid).toBe(true);
    }
  });

  it('ferramenta: formata, valida e exige o CNPJ', async () => {
    const formatted = await run(cnpjTool, { action: 'format', cnpj: '11222333000181' });
    expect(formatted.ok && formatted.data.cnpj).toBe('11.222.333/0001-81');
    const gen = await run(cnpjTool, { alphanumeric: true });
    expect(gen.ok && String(gen.data.cnpj)).toMatch(/^[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/0001-\d{2}$/);
    const missing = await run(cnpjTool, { action: 'validate' });
    expect(missing.ok).toBe(false);
  });
});

describe('cnh', () => {
  it('valida um número conhecido e rejeita variações', () => {
    expect(validateCNH('02650306461').valid).toBe(true);
    expect(validateCNH('026.503.064-61').valid).toBe(true);
    expect(validateCNH('02650306462').valid).toBe(false);
    expect(validateCNH('02650306471').valid).toBe(false);
    expect(validateCNH('11111111111').message).toContain('iguais');
    expect(validateCNH('123').message).toContain('11');
    expect(validateCNH('abc').valid).toBe(false);
  });

  it('todo número gerado é válido', () => {
    for (let i = 0; i < 500; i++) expect(validateCNH(generateCNH()).valid).toBe(true);
  });

  it('ferramenta valida via run', async () => {
    const res = await run(cnhTool, { action: 'validate', cnh: '02650306461' });
    expect(res.ok && res.data.valid).toBe(true);
  });
});

describe('pis/pasep', () => {
  it('valida um número conhecido, com e sem máscara', () => {
    expect(validatePIS('12345678919').valid).toBe(true);
    expect(validatePIS('123.45678.91-9').valid).toBe(true);
    expect(validatePIS('12345678910').valid).toBe(false);
    expect(validatePIS('00000000000').message).toContain('iguais');
    expect(validatePIS('1234').message).toContain('11');
  });

  it('todo número gerado é válido e a ferramenta formata a saída', async () => {
    for (let i = 0; i < 500; i++) expect(validatePIS(generatePIS()).valid).toBe(true);
    const res = await run(pisTool, { action: 'validate', pis: '12345678919' });
    expect(res.ok && res.data.pis).toBe('123.45678.91-9');
  });
});

describe('json', () => {
  const base = { mode: 'format', indent: '2', sortKeys: false } as const;

  it('formata com 2 espaços, 4 espaços e tabulação', () => {
    expect(processJson('{"a":[1,2]}', base).result).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
    expect(processJson('{"a":1}', { ...base, indent: '4' }).result).toBe('{\n    "a": 1\n}');
    expect(processJson('{"a":1}', { ...base, indent: 'tab' }).result).toBe('{\n\t"a": 1\n}');
  });

  it('minifica e ordena chaves recursivamente sem mexer nos arrays', () => {
    const res = processJson('{ "b": {"z":1,"y":[{"d":1,"c":2}]}, "a": 0 }', { ...base, mode: 'minify', sortKeys: true });
    expect(res.result).toBe('{"a":0,"b":{"y":[{"c":2,"d":1}],"z":1}}');
  });

  it('valida sem lançar erro e devolve a mensagem', () => {
    expect(processJson('{"a":1}', { ...base, mode: 'validate' })).toMatchObject({ valid: true });
    const bad = processJson('{"a":}', { ...base, mode: 'validate' });
    expect(bad.valid).toBe(false);
    expect(bad.message).toMatch(/^JSON inválido/);
    expect(processJson('  ', { ...base, mode: 'validate' })).toMatchObject({ valid: false, message: 'Entrada vazia' });
  });

  it('formatar JSON inválido vira erro de execução com mensagem', async () => {
    const res = await run(jsonTool, { text: '{"a": 1,}' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('execution_failed');
      expect(res.error.message).toMatch(/^JSON inválido/);
    }
  });

  it('converte posição em linha e coluna', () => {
    expect(positionToLineColumn('ab\ncd', 0)).toEqual({ line: 1, column: 1 });
    expect(positionToLineColumn('ab\ncd', 4)).toEqual({ line: 2, column: 2 });
    expect(positionToLineColumn('a\r\nb', 3)).toEqual({ line: 2, column: 1 });
  });

  it('entende as mensagens de erro de diferentes motores', () => {
    expect(describeJsonError('{\n"a"', new Error('Unexpected end of JSON input at position 5'))).toMatchObject({ line: 2, column: 4 });
    expect(describeJsonError('x', new Error('JSON.parse: unexpected character at line 3 column 7'))).toMatchObject({ line: 3, column: 7 });
    expect(describeJsonError('x', new Error('algo sem posição'))).toEqual({ message: 'algo sem posição' });
  });
});

describe('hash', () => {
  it('confere com vetores de teste publicados ("abc" e vazio)', async () => {
    expect(await hashText('abc', 'md5')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(await hashText('abc', 'sha1')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(await hashText('abc', 'sha256')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await hashText('abc', 'sha384')).toBe(
      'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7'
    );
    expect(await hashText('abc', 'sha512')).toBe(
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f'
    );
    expect(await hashText('', 'sha256')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await hashText('', 'md5')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('codifica em UTF-8 e suporta saída Base64', async () => {
    expect(await hashText('ação', 'sha256')).toBe(await hashText('ação', 'sha256', 'hex'));
    expect(await hashText('abc', 'md5', 'base64')).toBe('kAFQmDzST7DWlj99KOF/cg==');
  });

  it('avisa que MD5 e SHA-1 não são seguros', async () => {
    const md5 = await run(hashTool, { text: 'x', algorithm: 'md5' });
    expect(md5.ok && md5.data.note).toBeTruthy();
    const sha = await run(hashTool, { text: 'x' });
    expect(sha.ok && 'note' in sha.data).toBe(false);
  });
});

describe('slug', () => {
  const opts = { separator: '-', lowercase: true } as const;

  it('remove acentos e símbolos', () => {
    expect(slugify('Coração, Ação & Emoção!', opts)).toBe('coracao-acao-emocao');
    expect(slugify('  --Olá   Mundo--  ', opts)).toBe('ola-mundo');
    expect(slugify('Straße Øl Łódź', opts)).toBe('strasse-ol-lodz');
  });

  it('suporta sublinhado, caixa original e tamanho máximo sem terminar em separador', () => {
    expect(slugify('Olá Mundo', { separator: '_', lowercase: false })).toBe('Ola_Mundo');
    expect(slugify('um dois tres quatro', { ...opts, maxLength: 8 })).toBe('um-dois');
    expect(slugify('abcdefghij', { ...opts, maxLength: 4 })).toBe('abcd');
  });

  it('devolve vazio quando não sobra nada', () => {
    expect(slugify('!!! ???', opts)).toBe('');
    expect(slugify('日本語', opts)).toBe('');
  });

  it('removeDiacritics mantém a caixa', () => {
    expect(removeDiacritics('ÁÉÍÓÚ àèìòù çñ')).toBe('AEIOU aeiou cn');
  });
});

describe('contadores', () => {
  it('palavras: hífen e apóstrofo unem, pontuação e linhas vazias não contam', () => {
    expect(countWords('')).toMatchObject({ words: 0, uniqueWords: 0 });
    expect(countWords('   \n\n  ')).toMatchObject({ words: 0 });
    expect(countWords('guarda-chuva, d’água... "ok"!')).toMatchObject({ words: 3 });
    expect(countWords('Casa casa CASA outra')).toMatchObject({ words: 4, uniqueWords: 2 });
    expect(countWords('日本語 text 123').words).toBe(3);
    expect(countWords(Array(400).fill('a').join(' ')).readingSeconds).toBe(120);
  });

  it('caracteres: diferencia grafemas, pontos de código, UTF-16 e bytes', () => {
    expect(countCharacters('')).toEqual({ graphemes: 0, graphemesWithoutSpaces: 0, codePoints: 0, utf16Units: 0, utf8Bytes: 0 });
    expect(countCharacters('abc')).toMatchObject({ graphemes: 3, utf8Bytes: 3 });
    // "é" decomposto: e + acento combinante = 2 pontos de código, 1 grafema.
    expect(countCharacters('é')).toMatchObject({ graphemes: 1, codePoints: 2, utf16Units: 2, utf8Bytes: 3 });
    expect(countCharacters('😀')).toMatchObject({ graphemes: 1, codePoints: 1, utf16Units: 2, utf8Bytes: 4 });
    expect(countCharacters('a b\tc\n')).toMatchObject({ graphemes: 6, graphemesWithoutSpaces: 3 });
  });

  it('linhas: três estilos de quebra, quebra final e linhas só com espaços', () => {
    expect(countLines('')).toEqual({ lines: 0, nonEmptyLines: 0, emptyLines: 0 });
    expect(countLines('a')).toEqual({ lines: 1, nonEmptyLines: 1, emptyLines: 0 });
    expect(countLines('a\nb\n')).toEqual({ lines: 2, nonEmptyLines: 2, emptyLines: 0 });
    expect(countLines('a\r\n\r\nb\rc')).toEqual({ lines: 4, nonEmptyLines: 3, emptyLines: 1 });
    expect(countLines('a\n   \nb')).toMatchObject({ lines: 3, emptyLines: 1 });
    expect(countLines('\n')).toEqual({ lines: 1, nonEmptyLines: 0, emptyLines: 1 });
  });
});

describe('sílabas (português, estimativa)', () => {
  const cases: [string, number][] = [
    ['casa', 2], ['mãe', 1], ['saída', 3], ['coração', 3], ['queijo', 2], ['guerra', 2], ['pai', 1],
    ['país', 2], ['aula', 2], ['poeta', 3], ['leão', 2], ['computador', 4], ['programação', 4],
    ['universidade', 6], ['pneu', 1], ['advogado', 4], ['tv', 1], ['ciúme', 3], ['Ação', 2], ['é', 1],
  ];
  it.each(cases)('%s tem %i sílaba(s)', (word, expected) => {
    expect(countSyllablesPt(word)).toBe(expected);
  });

  it('ignora símbolos e devolve 0 sem letras', () => {
    expect(countSyllablesPt('123 !?')).toBe(0);
    expect(countSyllablesPt('')).toBe(0);
  });
});

describe('dias entre datas', () => {
  const d = (s: string) => parseIsoDate(s)!;

  it('valida datas reais', () => {
    expect(parseIsoDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseIsoDate('2023-02-29')).toBeNull();
    expect(parseIsoDate('2023-13-01')).toBeNull();
    expect(parseIsoDate('2023-02-30')).toBeNull();
    expect(parseIsoDate('01/02/2023')).toBeNull();
    expect(parseIsoDate('')).toBeNull();
  });

  it('conta dias, inclusive em anos bissextos', () => {
    expect(differenceBetween(d('2024-02-28'), d('2024-03-01'), false).days).toBe(2);
    expect(differenceBetween(d('2023-02-28'), d('2023-03-01'), false).days).toBe(1);
    expect(differenceBetween(d('2000-01-01'), d('2001-01-01'), false).days).toBe(366);
    expect(differenceBetween(d('2024-05-05'), d('2024-05-05'), false).days).toBe(0);
    expect(differenceBetween(d('2024-05-05'), d('2024-05-05'), true).days).toBe(1);
  });

  it('não sofre com horário de verão (diferença sempre em dias inteiros)', () => {
    expect(differenceBetween(d('2024-03-09'), d('2024-03-11'), false).days).toBe(2);
    expect(differenceBetween(d('2024-10-26'), d('2024-10-28'), false).days).toBe(2);
  });

  it('é simétrico e sinaliza data final anterior', () => {
    const a = differenceBetween(d('2024-03-01'), d('2024-01-31'), false);
    const b = differenceBetween(d('2024-01-31'), d('2024-03-01'), false);
    expect(a.days).toBe(b.days);
    expect(a.endBeforeStart).toBe(true);
    expect(b.endBeforeStart).toBe(false);
  });

  it('decompõe em semanas, meses e anos', () => {
    expect(differenceBetween(d('2024-01-31'), d('2024-03-01'), false)).toMatchObject({
      days: 30, weeks: 4, daysAfterWeeks: 2, years: 0, months: 1, daysAfterMonths: 1,
    });
    expect(differenceBetween(d('2020-02-29'), d('2024-02-29'), false)).toMatchObject({ years: 4, months: 0, daysAfterMonths: 0 });
    expect(differenceBetween(d('2000-01-15'), d('2024-03-20'), false)).toMatchObject({ years: 24, months: 2, daysAfterMonths: 5 });
  });

  it('ferramenta rejeita data inexistente com mensagem no campo', async () => {
    const res = await run(daysBetweenTool, { start: '2023-02-30', end: '2023-03-01' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.issues?.[0]?.path).toBe('start');
  });
});

describe('conversores', () => {
  it('temperatura: pontos de referência', () => {
    expect(convertTemperature(100, 'celsius')).toEqual({ celsius: 100, fahrenheit: 212, kelvin: 373.15 });
    expect(convertTemperature(32, 'fahrenheit')).toEqual({ celsius: 0, fahrenheit: 32, kelvin: 273.15 });
    expect(convertTemperature(-40, 'celsius').fahrenheit).toBe(-40);
    expect(convertTemperature(0, 'kelvin')).toEqual({ celsius: -273.15, fahrenheit: -459.67, kelvin: 0 });
    expect(convertTemperature(36.6, 'celsius').fahrenheit).toBe(97.88);
  });

  it('temperatura: rejeita abaixo do zero absoluto e não-finitos', async () => {
    const below = await run(temperatureTool, { value: -300, from: 'celsius' });
    expect(below.ok).toBe(false);
    if (!below.ok) expect(below.error.message).toContain('zero absoluto');
    expect((await run(temperatureTool, { value: -1, from: 'kelvin' })).ok).toBe(false);
    expect((await run(temperatureTool, { value: NaN })).ok).toBe(false);
    expect((await run(temperatureTool, { value: 'x' })).ok).toBe(false);
  });

  it('tamanho de arquivo: decimal e binário', () => {
    expect(convertFileSize(1, 'GB', 'decimal').bytes).toBe(1_000_000_000);
    expect(convertFileSize(1, 'GB', 'binary').bytes).toBe(1_073_741_824);
    expect(convertFileSize(1536, 'B', 'binary').conversions[1]).toBe('1.5 KiB');
    expect(convertFileSize(500, 'GB', 'decimal').conversions[3]).toBe('500 GB');
    expect(convertFileSize(0, 'MB', 'decimal').bytes).toBe(0);
  });

  it('bases numéricas: valores conhecidos, prefixos, negativos e números grandes', () => {
    expect(convertBase('255', '10')).toEqual({ binary: '11111111', octal: '377', decimal: '255', hexadecimal: 'FF' });
    expect(convertBase('0xff', '16').decimal).toBe('255');
    expect(convertBase('1111_1111', '2').decimal).toBe('255');
    expect(convertBase('-10', '10')).toEqual({ binary: '-1010', octal: '-12', decimal: '-10', hexadecimal: '-A' });
    expect(convertBase('0', '10').hexadecimal).toBe('0');
    expect(convertBase('18446744073709551616', '10').hexadecimal).toBe('10000000000000000');
  });

  it('bases numéricas: erros claros', async () => {
    expect((await run(numberBaseTool, { value: '12', from: '2' })).ok).toBe(false);
    expect((await run(numberBaseTool, { value: 'xyz', from: '16' })).ok).toBe(false);
    expect((await run(numberBaseTool, { value: '', from: '10' })).ok).toBe(false);
    expect((await run(numberBaseTool, { value: '1.5', from: '10' })).ok).toBe(false);
  });

  it('url: codifica, decodifica e rejeita escapes inválidos', async () => {
    const enc = await run(urlEncodeTool, { text: 'a b&c=ç', mode: 'encode' });
    expect(enc.ok && enc.data.result).toBe('a%20b%26c%3D%C3%A7');
    const full = await run(urlEncodeTool, { text: 'https://x.com/a b?q=ç', mode: 'encode', scope: 'full' });
    expect(full.ok && full.data.result).toBe('https://x.com/a%20b?q=%C3%A7');
    const dec = await run(urlEncodeTool, { text: 'a%20b%C3%A7', mode: 'decode' });
    expect(dec.ok && dec.data.result).toBe('a bç');
    const bad = await run(urlEncodeTool, { text: '100%', mode: 'decode' });
    expect(bad.ok).toBe(false);
  });
});

describe('gradiente css', () => {
  it('gera linear, radial e cônico', () => {
    expect(buildGradient({ type: 'linear', angle: 45, colors: '#FF0000, #0000FF' })).toBe('linear-gradient(45deg, #ff0000, #0000ff)');
    expect(buildGradient({ type: 'radial', angle: 0, colors: '#fff, #000 80%' })).toBe('radial-gradient(circle, #fff, #000 80%)');
    expect(buildGradient({ type: 'conic', angle: 90, colors: '#f00, #0f0, #00f' })).toBe('conic-gradient(from 90deg, #f00, #0f0, #00f)');
  });

  it('aceita hexadecimais com transparência', () => {
    expect(parseColorStops('#ff000080, #0f08')).toEqual([{ color: '#ff000080' }, { color: '#0f08' }]);
  });

  it('rejeita valores que não são cores hexadecimais (incluindo injeção de CSS)', () => {
    for (const bad of ['red, blue', '#12, #fff', '#gggggg, #fff', 'url(http://x), #fff', '#fff; color: red, #000', '#fff 150%, #000', '#fff']) {
      expect(() => parseColorStops(bad), bad).toThrow();
    }
    expect(() => parseColorStops(Array(9).fill('#fff').join(','))).toThrow(/8/);
  });

  it('ferramenta devolve a declaração pronta e erro legível', async () => {
    const ok = await run(gradientTool, {});
    expect(ok.ok && ok.data.declaration).toBe('background: linear-gradient(90deg, #6366f1, #ec4899);');
    const bad = await run(gradientTool, { colors: 'verde, azul' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.message).toContain('Cor inválida');
    expect((await run(gradientTool, { angle: 361 })).ok).toBe(false);
  });
});
