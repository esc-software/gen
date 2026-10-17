import { describe, expect, it } from 'vitest';
import {
  colorTool,
  contrastRatio,
  convertColor,
  convertText,
  convertUnit,
  csvToJson,
  csvToJsonTool,
  formatOffset,
  isValidTimeZone,
  jsonToYaml,
  jsonToYamlTool,
  moneyToWords,
  moneyWordsTool,
  numberToWords,
  numberWordsTool,
  offsetMinutes,
  parseColor,
  parseLocalDateTime,
  removeAccentsTool,
  speedTool,
  splitWords,
  timeZoneTool,
  timestampTool,
  unitsTool,
  wallClock,
  zonedTimeToUtc,
} from './index.js';

type Run = { ok: true; data: Record<string, unknown> } | { ok: false; error: { message: string; code: string; issues?: { path: string }[] } };
const run = async (tool: { run: (i: unknown) => Promise<unknown> }, input: unknown) => (await tool.run(input)) as Run;

describe('fusos horários e horário de verão', () => {
  it('valida nomes IANA', () => {
    expect(isValidTimeZone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Marte/Olympus')).toBe(false);
  });

  it('calcula o deslocamento em diferentes datas', () => {
    expect(offsetMinutes(Date.UTC(2024, 0, 1), 'America/Sao_Paulo')).toBe(-180);
    expect(offsetMinutes(Date.UTC(2024, 6, 1), 'America/New_York')).toBe(-240); // verão (EDT)
    expect(offsetMinutes(Date.UTC(2024, 0, 1), 'America/New_York')).toBe(-300); // inverno (EST)
    expect(offsetMinutes(Date.UTC(2024, 5, 1), 'Asia/Kolkata')).toBe(330);
    // O Brasil teve horário de verão até 2019: em janeiro de 2018, UTC-2.
    expect(offsetMinutes(Date.UTC(2018, 0, 15, 12), 'America/Sao_Paulo')).toBe(-120);
    expect(formatOffset(-180)).toBe('UTC-03:00');
    expect(formatOffset(330)).toBe('UTC+05:30');
  });

  it('relógio de parede de um instante conhecido', () => {
    expect(wallClock(Date.UTC(2024, 0, 1, 3, 0, 0), 'America/Sao_Paulo')).toEqual({ year: 2024, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
    // Meia-noite UTC em fuso que usa "24" em alguns motores não pode virar hora 24.
    expect(wallClock(Date.UTC(2024, 0, 1, 0, 0, 0), 'UTC').hour).toBe(0);
  });

  it('horário comum resolve sem ambiguidade', () => {
    const r = zonedTimeToUtc({ year: 2024, month: 6, day: 15, hour: 12, minute: 0, second: 0 }, 'America/Sao_Paulo');
    expect(r.status).toBe('ok');
    expect(new Date(r.ms).toISOString()).toBe('2024-06-15T15:00:00.000Z');
  });

  it('detecta horário inexistente (adiantamento do relógio)', () => {
    // Nova York, 10/03/2024: 02:00 vira 03:00; 02:30 não existe.
    const gap = zonedTimeToUtc({ year: 2024, month: 3, day: 10, hour: 2, minute: 30, second: 0 }, 'America/New_York');
    expect(gap.status).toBe('gap');
    expect(gap.candidates).toEqual([]);
  });

  it('detecta horário repetido (atraso do relógio) e escolhe a primeira ocorrência', () => {
    // Nova York, 03/11/2024: 02:00 volta para 01:00; 01:30 ocorre duas vezes.
    const amb = zonedTimeToUtc({ year: 2024, month: 11, day: 3, hour: 1, minute: 30, second: 0 }, 'America/New_York');
    expect(amb.status).toBe('ambiguous');
    expect(amb.candidates.map((ms) => new Date(ms).toISOString())).toEqual(['2024-11-03T05:30:00.000Z', '2024-11-03T06:30:00.000Z']);
    expect(new Date(amb.ms).toISOString()).toBe('2024-11-03T05:30:00.000Z');
  });

  it('São Paulo no último horário de verão (2018-11-04 começou à meia-noite)', () => {
    const gap = zonedTimeToUtc({ year: 2018, month: 11, day: 4, hour: 0, minute: 30, second: 0 }, 'America/Sao_Paulo');
    expect(gap.status).toBe('gap');
  });

  it('lê datas locais e rejeita as impossíveis', () => {
    expect(parseLocalDateTime('2024-02-29 13:45:10')).toEqual({ year: 2024, month: 2, day: 29, hour: 13, minute: 45, second: 10 });
    expect(parseLocalDateTime('2024-02-29')).toMatchObject({ hour: 0 });
    expect(parseLocalDateTime('2024-02-29T08:00')).toMatchObject({ hour: 8 });
    for (const bad of ['2023-02-29', '2024-13-01', '2024-01-01 24:00', '2024-01-01 12:60', 'ontem', '']) {
      expect(parseLocalDateTime(bad), bad).toBeNull();
    }
  });

  it('ferramenta timestamp: ida e volta e avisos', async () => {
    const toDate = await run(timestampTool, { direction: 'toDate', value: '1700000000', unit: 'seconds', timeZone: 'UTC' });
    expect(toDate.ok && toDate.data.utc).toBe('2023-11-14T22:13:20.000Z');
    const ms = await run(timestampTool, { direction: 'toDate', value: '1700000000123', unit: 'milliseconds', timeZone: 'UTC' });
    expect(ms.ok && ms.data.timestampSeconds).toBe(1700000000);
    const back = await run(timestampTool, { direction: 'toTimestamp', value: '2023-11-14 22:13:20', timeZone: 'UTC' });
    expect(back.ok && back.data.timestampSeconds).toBe(1700000000);
    const sp = await run(timestampTool, { direction: 'toTimestamp', value: '2024-01-01 00:00:00', timeZone: 'America/Sao_Paulo' });
    expect(sp.ok && sp.data.timestampSeconds).toBe(1704078000);
    const amb = await run(timestampTool, { direction: 'toTimestamp', value: '2024-11-03 01:30', timeZone: 'America/New_York' });
    expect(amb.ok && String(amb.data.note)).toContain('duas vezes');
    const gap = await run(timestampTool, { direction: 'toTimestamp', value: '2024-03-10 02:30', timeZone: 'America/New_York' });
    expect(gap.ok && String(gap.data.note)).toContain('não existe');
  });

  it('ferramenta timestamp: entradas inválidas', async () => {
    expect((await run(timestampTool, { direction: 'toDate', value: 'abc' })).ok).toBe(false);
    expect((await run(timestampTool, { direction: 'toDate', value: '' })).ok).toBe(false);
    expect((await run(timestampTool, { direction: 'toDate', value: '9'.repeat(20) })).ok).toBe(false);
    expect((await run(timestampTool, { direction: 'toTimestamp', value: '31/12/2024' })).ok).toBe(false);
    const badZone = await run(timestampTool, { direction: 'toDate', value: '1', timeZone: 'Marte/Olympus' });
    expect(badZone.ok).toBe(false);
    if (!badZone.ok) expect(badZone.error.issues?.[0]?.path).toBe('timeZone');
  });

  it('ferramenta fuso-horario: conversões e diferença', async () => {
    const r = await run(timeZoneTool, { dateTime: '2024-07-01 12:00', fromZone: 'America/Sao_Paulo', toZone: 'America/New_York' });
    expect(r.ok && r.data).toMatchObject({ utc: '2024-07-01T15:00:00.000Z', differenceHours: -1 });
    const winter = await run(timeZoneTool, { dateTime: '2024-01-15 12:00', fromZone: 'America/Sao_Paulo', toZone: 'America/New_York' });
    expect(winter.ok && winter.data.differenceHours).toBe(-2);
    const india = await run(timeZoneTool, { dateTime: '2024-06-01 09:00', fromZone: 'UTC', toZone: 'Asia/Kolkata' });
    expect(india.ok && india.data.differenceHours).toBe(5.5);
    expect((await run(timeZoneTool, { dateTime: 'x' })).ok).toBe(false);
  });
});

describe('cores', () => {
  it('lê hex curto, longo, com alfa, rgb e hsl', () => {
    expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('#FF8000')).toEqual({ r: 255, g: 128, b: 0, a: 1 });
    expect(parseColor('#ff000080')).toEqual({ r: 255, g: 0, b: 0, a: 0.502 });
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor('rgba(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor('hsl(120, 100%, 25%)')).toEqual({ r: 0, g: 128, b: 0, a: 1 });
    expect(parseColor('rgb(300, -5, 20)')).toEqual({ r: 255, g: 0, b: 20, a: 1 });
    for (const bad of ['', '#ggg', '#12345', 'vermelho', 'rgb(1,2)', 'hsl(a,b,c)', 'rgb(1,2,3,4,5)']) {
      expect(parseColor(bad), bad).toBeNull();
    }
  });

  it('converte entre modelos (vetores conhecidos)', () => {
    expect(convertColor('#ff0000')).toMatchObject({ rgb: 'rgb(255, 0, 0)', hsl: 'hsl(0, 100%, 50%)', cmyk: 'cmyk(0%, 100%, 100%, 0%)' });
    expect(convertColor('#00ff80').hsl).toBe('hsl(150, 100%, 50%)');
    expect(convertColor('#808080')).toMatchObject({ hsl: 'hsl(0, 0%, 50%)', cmyk: 'cmyk(0%, 0%, 0%, 50%)' });
    expect(convertColor('#000000').cmyk).toBe('cmyk(0%, 0%, 0%, 100%)');
    expect(convertColor('#ffffff').hsl).toBe('hsl(0, 0%, 100%)');
    expect(convertColor('rgba(255, 0, 0, 0.5)')).toMatchObject({ hex: '#ff000080', rgb: 'rgba(255, 0, 0, 0.5)' });
  });

  it('ida e volta HSL <-> RGB mantém a cor', () => {
    for (const hex of ['#123456', '#abcdef', '#fedcba', '#0a0b0c', '#ff00aa']) {
      const back = convertColor(convertColor(hex).hsl).hex;
      const a = parseColor(hex)!;
      const b = parseColor(back)!;
      expect(Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)).toBeLessThanOrEqual(3);
    }
  });

  it('contraste WCAG: preto sobre branco é 21 e a melhor cor de texto', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, { r: 255, g: 255, b: 255, a: 1 })).toBeCloseTo(21, 5);
    expect(convertColor('#ffffff')).toMatchObject({ contrastWithWhite: 1, contrastWithBlack: 21, bestTextColor: 'preto' });
    expect(convertColor('#003366').bestTextColor).toBe('branco');
  });

  it('ferramenta rejeita cor inválida com mensagem', async () => {
    const r = await run(colorTool, { color: 'azulzinho' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('não reconhecida');
  });
});

describe('unidades', () => {
  it('conversões com fatores exatos', () => {
    expect(convertUnit(1, 'in', 'cm').result).toBe(2.54);
    expect(convertUnit(1, 'mi', 'km').result).toBe(1.609344);
    expect(convertUnit(1, 'lb', 'g').result).toBe(453.59237);
    expect(convertUnit(1, 'gal', 'L').result).toBe(3.785411784);
    expect(convertUnit(1, 'ha', 'm2').result).toBe(10000);
    expect(convertUnit(1, 'ac', 'm2').result).toBe(4046.8564224);
    expect(convertUnit(1, 'atm', 'Pa').result).toBe(101325);
    expect(convertUnit(1, 'kWh', 'J').result).toBe(3600000);
    expect(convertUnit(1, 'kcal', 'cal').result).toBe(1000);
    expect(convertUnit(1, 'hp', 'W').result).toBeCloseTo(745.69987158227, 8);
    expect(convertUnit(1, 'd', 'h').result).toBe(24);
    expect(convertUnit(90, 'min', 'h').result).toBe(1.5);
  });

  it('é reversível sem ruído de ponto flutuante', () => {
    for (const [a, b] of [['km', 'mi'], ['kg', 'lb'], ['L', 'gal'], ['psi', 'bar'], ['ft', 'm']] as const) {
      const there = convertUnit(123.456, a, b).result;
      expect(convertUnit(there, b, a).result).toBeCloseTo(123.456, 8);
    }
    expect(convertUnit(0.1, 'm', 'cm').result).toBe(10);
    expect(convertUnit(0, 'km', 'mi').result).toBe(0);
    expect(convertUnit(-5, 'km', 'm').result).toBe(-5000);
  });

  it('recusa grandezas diferentes e unidades desconhecidas', async () => {
    const r = await run(unitsTool, { value: 1, from: 'm', to: 'kg' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('comprimento');
    expect((await run(unitsTool, { value: 1, from: 'parsec', to: 'm' })).ok).toBe(false);
  });

  it('velocidade', async () => {
    const r = await run(speedTool, { value: 100, from: 'km/h', to: 'mph' });
    expect(r.ok && r.data.result).toBeCloseTo(62.1371192237, 8);
    const kn = await run(speedTool, { value: 1, from: 'kn', to: 'km/h' });
    expect(kn.ok && kn.data.result).toBe(1.852);
    const ms = await run(speedTool, { value: 36, from: 'km/h', to: 'm/s' });
    expect(ms.ok && ms.data.result).toBe(10);
    expect((await run(speedTool, { value: 1, from: 'km', to: 'mph' })).ok).toBe(false);
  });
});

describe('conversor de texto', () => {
  it('maiúsculas, minúsculas, título e frase', () => {
    expect(convertText('olá Mundo', 'upper')).toBe('OLÁ MUNDO');
    expect(convertText('OLÁ MUNDO', 'lower')).toBe('olá mundo');
    expect(convertText("maria d'água da silva", 'title')).toBe("Maria D'água Da Silva");
    expect(convertText('primeira frase. segunda! terceira? quarta', 'sentence')).toBe('Primeira frase. Segunda! Terceira? Quarta');
    expect(convertText('ça va', 'upper')).toBe('ÇA VA');
  });

  it('convenções de código', () => {
    expect(splitWords('meuNomeCompleto')).toEqual(['meu', 'Nome', 'Completo']);
    expect(splitWords('HTTPServer_error-code')).toEqual(['HTTP', 'Server', 'error', 'code']);
    expect(convertText('Olá Mundo Bonito', 'snake')).toBe('olá_mundo_bonito');
    expect(convertText('meu nome', 'camel')).toBe('meuNome');
    expect(convertText('meu-nome-completo', 'pascal')).toBe('MeuNomeCompleto');
    expect(convertText('meuNomeCompleto', 'kebab')).toBe('meu-nome-completo');
    expect(convertText('meu nome', 'constant')).toBe('MEU_NOME');
  });

  it('limpeza e ordenação de linhas', () => {
    expect(convertText('  a   b \t c  ', 'collapse')).toBe('a b c');
    expect(convertText('a\n\n \nb', 'remove-blank')).toBe('a\nb');
    expect(convertText('  a \n b  ', 'trim-lines')).toBe('a\nb');
    expect(convertText('banana\nÁgua\nabacate', 'sort')).toBe('abacate\nÁgua\nbanana');
    expect(convertText('a\nb\na\nc\nb', 'unique')).toBe('a\nb\nc');
    expect(convertText('aBc', 'invert')).toBe('AbC');
    expect(convertText('abc', 'reverse')).toBe('cba');
    expect(convertText('', 'upper')).toBe('');
  });

  it('inverter respeita emojis e acentos combinados', () => {
    expect(convertText('a😀b', 'reverse')).toBe('b😀a');
    expect(convertText('e\u0301x', 'reverse')).toBe('xe\u0301');
  });

  it('removedor de acentos informa quantos caracteres mudaram', async () => {
    const r = await run(removeAccentsTool, { text: 'Ação, coração e Ávila' });
    expect(r.ok && r.data).toMatchObject({ result: 'Acao, coracao e Avila', changed: 5 });
  });
});

describe('número por extenso', () => {
  const cases: [bigint, string][] = [
    [0n, 'zero'], [1n, 'um'], [11n, 'onze'], [16n, 'dezesseis'], [21n, 'vinte e um'], [99n, 'noventa e nove'],
    [100n, 'cem'], [101n, 'cento e um'], [111n, 'cento e onze'], [200n, 'duzentos'], [999n, 'novecentos e noventa e nove'],
    [1000n, 'mil'], [1001n, 'mil e um'], [1100n, 'mil e cem'], [1101n, 'mil cento e um'], [2000n, 'dois mil'],
    [2500n, 'dois mil e quinhentos'], [12345n, 'doze mil trezentos e quarenta e cinco'], [100000n, 'cem mil'],
    [101000n, 'cento e um mil'], [1000000n, 'um milhão'], [1000001n, 'um milhão e um'], [2000000n, 'dois milhões'],
    [1100000n, 'um milhão e cem mil'], [2500000n, 'dois milhões e quinhentos mil'],
    [1234567n, 'um milhão duzentos e trinta e quatro mil quinhentos e sessenta e sete'],
    [1000000000n, 'um bilhão'], [3000000000n, 'três bilhões'], [1000000000000n, 'um trilhão'],
    [-15n, 'menos quinze'],
  ];
  it.each(cases)('%s', (n, text) => {
    expect(numberToWords(n)).toBe(text);
  });

  it('feminino concorda em unidades, centenas e mil, mas não em milhões', () => {
    expect(numberToWords(1n, 'feminino')).toBe('uma');
    expect(numberToWords(2n, 'feminino')).toBe('duas');
    expect(numberToWords(22n, 'feminino')).toBe('vinte e duas');
    expect(numberToWords(200n, 'feminino')).toBe('duzentas');
    expect(numberToWords(2200n, 'feminino')).toBe('duas mil e duzentas');
    expect(numberToWords(2000000n, 'feminino')).toBe('dois milhões');
    expect(numberToWords(101n, 'feminino')).toBe('cento e uma');
    expect(numberToWords(100n, 'feminino')).toBe('cem');
  });

  it('ferramenta: entradas com pontos, negativos e inválidas', async () => {
    const r = await run(numberWordsTool, { value: '1.250' });
    expect(r.ok && r.data.text).toBe('mil duzentos e cinquenta');
    expect((await run(numberWordsTool, { value: '-3' })).ok).toBe(true);
    expect((await run(numberWordsTool, { value: '1,5' })).ok).toBe(false);
    expect((await run(numberWordsTool, { value: 'abc' })).ok).toBe(false);
    expect((await run(numberWordsTool, { value: '9'.repeat(19) })).ok).toBe(false);
  });
});

describe('valor monetário por extenso', () => {
  const cases: [bigint, string][] = [
    [0n, 'zero reais'], [1n, 'um centavo'], [100n, 'um real'], [101n, 'um real e um centavo'], [250n, 'dois reais e cinquenta centavos'],
    [50n, 'cinquenta centavos'], [125050n, 'mil duzentos e cinquenta reais e cinquenta centavos'],
    [100000000n, 'um milhão de reais'], [200000010n, 'dois milhões de reais e dez centavos'],
    [150000000n, 'um milhão e quinhentos mil reais'], [1000n, 'dez reais'], [100000n, 'mil reais'],
  ];
  it.each(cases)('%s centavos', (cents, text) => {
    expect(moneyToWords(cents)).toBe(text);
  });

  it('ferramenta aceita formatos brasileiro e com ponto decimal', async () => {
    for (const [value, text] of [
      ['R$ 1.250,50', 'mil duzentos e cinquenta reais e cinquenta centavos'],
      ['1250.5', 'mil duzentos e cinquenta reais e cinquenta centavos'],
      ['1000000', 'um milhão de reais'],
      ['0,01', 'um centavo'],
      ['0', 'zero reais'],
      ['-2,00', 'menos dois reais'],
    ] as const) {
      const r = await run(moneyWordsTool, { value });
      expect(r.ok && r.data.text, value).toBe(text);
    }
    const shown = await run(moneyWordsTool, { value: '1234567,8' });
    expect(shown.ok && shown.data.normalized).toBe('R$ 1.234.567,80');
  });

  it('ferramenta rejeita formatos ambíguos ou inválidos', async () => {
    for (const bad of ['1,234,56', 'abc', '1,234', '', '12.345,678', '1e5']) {
      expect((await run(moneyWordsTool, { value: bad })).ok, bad).toBe(false);
    }
  });
});

describe('JSON para YAML', () => {
  it('converte estruturas e preserva tipos ambíguos entre aspas', () => {
    expect(jsonToYaml('{"nome":"Gen","itens":[1,2],"ativo":true}', 2)).toBe('nome: Gen\nitens:\n  - 1\n  - 2\nativo: true\n');
    expect(jsonToYaml('{"a":"true","b":"123","c":null,"d":"null"}', 2)).toBe('a: "true"\nb: "123"\nc: null\nd: "null"\n');
    expect(jsonToYaml('[]', 2)).toBe('[]\n');
    expect(jsonToYaml('{"a":{"b":1}}', 4)).toBe('a:\n    b: 1\n');
  });

  it('textos com várias linhas e caracteres especiais ficam válidos', () => {
    const yaml = jsonToYaml('{"txt":"linha1\\nlinha2","dois":"a: b"}', 2);
    expect(yaml).toContain('txt: |-');
    expect(yaml).toContain('dois: "a: b"');
  });

  it('JSON inválido gera erro com posição quando o motor informa', async () => {
    const r = await run(jsonToYamlTool, { text: '{"a":}' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/^JSON inválido/);
    expect((await run(jsonToYamlTool, { text: '' })).ok).toBe(false);
  });
});

describe('CSV para JSON', () => {
  it('detecta delimitador, usa cabeçalho e mantém texto por padrão', () => {
    const r = csvToJson('cep,nome\n01310100,"Silva, Ana"\n00000123,Bruno', { delimiter: 'auto', header: true, types: false });
    expect(JSON.parse(r.json)).toEqual([
      { cep: '01310100', nome: 'Silva, Ana' },
      { cep: '00000123', nome: 'Bruno' },
    ]);
    expect(r).toMatchObject({ rows: 2, columns: 2 });
  });

  it('converte tipos quando pedido e aceita ponto e vírgula, tabulação e sem cabeçalho', () => {
    expect(JSON.parse(csvToJson('n;v\nA;1\nB;2.5\nC;true', { delimiter: ';', header: true, types: true }).json)).toEqual([
      { n: 'A', v: 1 }, { n: 'B', v: 2.5 }, { n: 'C', v: true },
    ]);
    expect(JSON.parse(csvToJson('a\tb\n1\t2', { delimiter: 'auto', header: false, types: true }).json)).toEqual([['a', 'b'], [1, 2]]);
  });

  it('trata aspas duplicadas, quebras de linha em campos e linhas vazias', () => {
    const r = csvToJson('t\n"ele disse ""oi"""\n"linha1\nlinha2"\n\n', { delimiter: ',', header: true, types: false });
    expect(JSON.parse(r.json)).toEqual([{ t: 'ele disse "oi"' }, { t: 'linha1\nlinha2' }]);
  });

  it('erros: vazio e aspas sem fechar', async () => {
    expect((await run(csvToJsonTool, { text: '   ' })).ok).toBe(false);
    const bad = await run(csvToJsonTool, { text: 'a,b\n"x,1' });
    expect(bad.ok).toBe(false);
  });
});
