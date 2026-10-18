import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  analyzeBoleto, boletoValidatorTool, breakEvenRevenue, buildBoleto, calcNetSalary, chmodFromOctal, chmodFromSymbolic, chmodTool, cdiFactor, cltVsPjTool, cltYear, convenioMod11,
  cronTool, decodeHtmlEntities, decodeUlid, describeCron, diffLines, dueDateFromFactor, employeeCost, employeeCostTool, encodeHtmlEntities, encodeUlid, fixedIncomeTool, formatRun, fromPixels,
  generateUlids, hmacDigest, hmacTool, htmlEntitiesTool, irRateForDays, jsonCsvTool, jsonToCsv, markupTool, meiDas, meiDasTool, mod10, morseTool, morseToText, nextRuns, parseCron, pjMonthlyNet,
  pxRemTool, renderDiff, savingsMonthlyRate, textDiffTool, textToMorse, toPixels, ulidTool, yamlJsonTool, yamlToJson,
} from './index.js';

type Run = { run: (input: unknown) => Promise<unknown> };
type Result = { ok: true; data: Record<string, unknown> } | { ok: false; error: { message: string } };
const call = async (tool: Run, input: unknown) => (await tool.run(input)) as Result;
const data = async (tool: Run, input: unknown) => {
  const r = await call(tool, input);
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
};
const fails = async (tool: Run, input: unknown, fragment?: string) => {
  const r = await call(tool, input);
  expect(r.ok, JSON.stringify(input)).toBe(false);
  if (!r.ok && fragment) expect(r.error.message).toContain(fragment);
};
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('HMAC', () => {
  it('bate com o vetor do RFC 4231 (caso 2)', async () => {
    const d = await data(hmacTool, { message: 'what do ya want for nothing?', secret: 'Jefe', algorithm: 'SHA-256', encoding: 'hex' });
    expect(d.hmac).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
    expect(d.bits).toBe(256);
  });

  it('confere com o node:crypto em todos os algoritmos, com acentos e chaves longas', () => {
    for (const [name, node] of [['SHA-256', 'sha256'], ['SHA-384', 'sha384'], ['SHA-512', 'sha512']] as const) {
      for (const [message, secret] of [['', 'k'], ['ação ✓', 'segredo'], ['x'.repeat(5000), 'y'.repeat(300)]] as const) {
        expect(hex(hmacDigest(message, secret, name))).toBe(createHmac(node, secret).update(message).digest('hex'));
      }
    }
  });

  it('saída em Base64 e recusa chave vazia', async () => {
    const d = await data(hmacTool, { message: 'a', secret: 'b', algorithm: 'SHA-256', encoding: 'base64' });
    expect(d.hmac).toBe(createHmac('sha256', 'b').update('a').digest('base64'));
    await fails(hmacTool, { message: 'a', secret: '' }, 'chave secreta');
  });
});

describe('ULID', () => {
  const sample = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

  it('decodifica o exemplo da especificação', () => {
    const d = decodeUlid(sample);
    expect(d.timeMs).toBe(1469922850259);
    expect(d.iso).toBe('2016-07-30T23:54:10.259Z');
    // Segundo exemplo conhecido (README da especificação).
    expect(decodeUlid('01ARYZ6S41TSV4RRFFQ69G5FAV').timeMs).toBe(1469918176385);
    expect(d.randomness).toBe(sample.slice(10));
  });

  it('codifica de volta e gera em ordem crescente, no mesmo milissegundo', () => {
    expect(encodeUlid(0, 0n)).toBe('0'.repeat(26));
    const list = generateUlids(100, 1_700_000_000_000);
    expect(new Set(list).size).toBe(100);
    expect([...list].sort()).toEqual(list);
    for (const u of list) expect(decodeUlid(u).timeMs).toBe(1_700_000_000_000);
  });

  it('recusa ULID inválido ou fora do intervalo', async () => {
    await fails(ulidTool, { mode: 'decode', count: 1, ulid: 'curto' }, '26 caracteres');
    await fails(ulidTool, { mode: 'decode', count: 1, ulid: 'ILOU' + '0'.repeat(22) }, '26 caracteres');
    await fails(ulidTool, { mode: 'decode', count: 1, ulid: '8' + '0'.repeat(25) }, 'fora do intervalo');
    expect(() => encodeUlid(-1, 0n)).toThrow();
    expect(() => encodeUlid(2 ** 48, 0n)).toThrow();
  });

  it('a ferramenta gera e decodifica', async () => {
    const d = await data(ulidTool, { mode: 'generate', count: 3, ulid: '' });
    expect((d.ulids as string[]).length).toBe(3);
    const x = await data(ulidTool, { mode: 'decode', count: 1, ulid: sample.toLowerCase() });
    expect(x.timestamp).toBe(1469922850259);
  });
});

describe('chmod', () => {
  it('converte octal em simbólico', () => {
    expect(chmodFromOctal('755').symbolic).toBe('rwxr-xr-x');
    expect(chmodFromOctal('644').symbolic).toBe('rw-r--r--');
    expect(chmodFromOctal('000').symbolic).toBe('---------');
    expect(chmodFromOctal('777').symbolic).toBe('rwxrwxrwx');
    expect(chmodFromOctal('4755').symbolic).toBe('rwsr-xr-x');
    expect(chmodFromOctal('2755').symbolic).toBe('rwxr-sr-x');
    expect(chmodFromOctal('1777').symbolic).toBe('rwxrwxrwt');
    expect(chmodFromOctal('4644').symbolic).toBe('rwSr--r--');
    expect(chmodFromOctal('1666').symbolic).toBe('rw-rw-rwT');
  });

  it('converte simbólico em octal e volta', () => {
    expect(chmodFromSymbolic('rwxr-xr-x').octal).toBe('755');
    expect(chmodFromSymbolic('rwsr-xr-x').octal).toBe('4755');
    expect(chmodFromSymbolic('rwSr--r--').octal).toBe('4644');
    expect(chmodFromSymbolic('rwxrwxrwt').octal).toBe('1777');
    for (let n = 0; n < 4096; n += 37) {
      const octal = n.toString(8).padStart(4, '0');
      const back = chmodFromSymbolic(chmodFromOctal(octal).symbolic).octal;
      expect(back.padStart(4, '0')).toBe(octal);
    }
  });

  it('rejeita entradas inválidas e descreve as classes', async () => {
    for (const bad of ['888', '75', '77777', 'rwxr-xr-', 'abcdefghi', '']) await fails(chmodTool, { permissions: bad });
    const d = await data(chmodTool, { permissions: '754' });
    expect(d.owner).toBe('leitura, escrita, execução');
    expect(d.group).toBe('leitura, execução');
    expect(d.others).toBe('leitura');
    expect(d.command).toBe('chmod 754 arquivo');
    expect(d.special).toBe('nenhuma');
  });
});

describe('px, rem, em', () => {
  it('converte com a base escolhida', async () => {
    const d = await data(pxRemTool, { value: 24, unit: 'px', baseFontSize: 16, viewportWidth: 1440 });
    expect(d).toMatchObject({ px: 24, rem: 1.5, em: 1.5, pt: 18, percent: 150 });
    expect(d.vw).toBeCloseTo(1.6667, 3);
  });

  it('é reversível entre unidades', () => {
    for (const unit of ['px', 'rem', 'em', 'pt', 'vw', 'percent'] as const) {
      const px = toPixels(37.5, unit, 18, 1280);
      expect(fromPixels(px, unit, 18, 1280)).toBeCloseTo(37.5, 9);
    }
    expect(toPixels(100, 'vw', 16, 1440)).toBe(1440);
    expect(toPixels(12, 'pt', 16, 1440)).toBe(16);
  });
});

describe('entidades HTML', () => {
  it('codifica os cinco caracteres e os acentos', () => {
    expect(encodeHtmlEntities(`<a href="x">'&'</a>`, 'none')).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    expect(encodeHtmlEntities('Ação & reação', 'named')).toBe('A&ccedil;&atilde;o &amp; rea&ccedil;&atilde;o');
    expect(encodeHtmlEntities('é', 'numeric')).toBe('&#233;');
    expect(encodeHtmlEntities('😀', 'named')).toBe('&#128512;');
    expect(encodeHtmlEntities('Ação', 'none')).toBe('Ação');
  });

  it('decodifica nomeadas e numéricas e deixa o resto como está', () => {
    expect(decodeHtmlEntities('&aacute;&Eacute;&ccedil;&atilde;&amp;&lt;&nbsp;&copy;')).toBe('áÉçã&< ©');
    expect(decodeHtmlEntities('&#233; &#xE9; &#x1F600;')).toBe('é é 😀');
    for (const keep of ['&foo;', '&#0;', '&#xD800;', '&#1114112;', '&constructor;', '&__proto__;', '&toString;', '&amp', '& amp;']) expect(decodeHtmlEntities(keep)).toBe(keep);
  });

  it('é reversível para texto comum', () => {
    const text = `Olá, <b>mundo</b> & "amigos" — çãõ éàü ©`;
    for (const style of ['none', 'named', 'numeric'] as const) expect(decodeHtmlEntities(encodeHtmlEntities(text, style))).toBe(text);
  });

  it('a ferramenta funciona e conta entidades', async () => {
    const d = await data(htmlEntitiesTool, { text: 'a & b', mode: 'encode', nonAscii: 'named' });
    expect(d).toEqual({ result: 'a &amp; b', changed: 1 });
    const x = await data(htmlEntitiesTool, { text: '&lt;p&gt;', mode: 'decode', nonAscii: 'named' });
    expect(x).toEqual({ result: '<p>', changed: 2 });
  });
});

describe('código Morse', () => {
  it('traduz nos dois sentidos', () => {
    expect(textToMorse('SOS').morse).toBe('... --- ...');
    expect(textToMorse('Olá mundo').morse).toBe('--- .-.. .- / -- ..- -. -.. ---');
    expect(morseToText('... --- ...').text).toBe('SOS');
    expect(morseToText('--- .-.. .- / -- ..- -. -.. ---').text).toBe('OLA MUNDO');
    expect(morseToText('··· −−− ···').text).toBe('SOS');
    expect(morseToText('... ---   ...').text).toBe('SO S');
  });

  it('é reversível para todo o alfabeto e avisa o que não conhece', () => {
    const all = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,?\'!/()&:;=+-_"$@';
    expect(morseToText(textToMorse(all).morse).text).toBe(all);
    expect(textToMorse('a€b').ignored).toEqual(['€']);
    expect(morseToText('... ......... ---').unknown).toEqual(['.........']);
    expect(textToMorse('').morse).toBe('');
  });

  it('a ferramenta devolve avisos', async () => {
    const d = await data(morseTool, { text: 'a€', mode: 'to-morse' });
    expect(d.result).toBe('.-');
    expect(d.ignored).toContain('€');
  });
});

describe('cron', () => {
  const thursday = new Date(Date.UTC(2026, 0, 1, 0, 0));

  it('lê campos, listas, intervalos, passos, nomes e atalhos', () => {
    const c = parseCron('*/15 9-17 * * 1-5');
    expect(c.minute.values).toEqual([0, 15, 30, 45]);
    expect(c.hour.values).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(c.dow.values).toEqual([1, 2, 3, 4, 5]);
    expect(parseCron('0 0 * * 7').dow.values).toEqual([0]);
    expect(parseCron('0 0 * * MON-FRI').dow.values).toEqual([1, 2, 3, 4, 5]);
    expect(parseCron('0 0 1 jan,jul *').month.values).toEqual([1, 7]);
    expect(parseCron('@daily').expression).toBe('0 0 * * *');
    expect(parseCron('5/20 * * * *').minute.values).toEqual([5, 25, 45]);
    expect(parseCron('0 0 * * 5-7').dow.values).toEqual([0, 5, 6]);
  });

  it('calcula as próximas execuções', () => {
    const runs = nextRuns(parseCron('*/15 9-17 * * 1-5'), thursday, 3).map(formatRun);
    expect(runs).toEqual(['01/01/2026 09:00 (quinta-feira)', '01/01/2026 09:15 (quinta-feira)', '01/01/2026 09:30 (quinta-feira)']);
    // Sexta (02/01) 17:45 é a última do dia; depois, segunda (05/01).
    const afterFriday = nextRuns(parseCron('*/15 9-17 * * 1-5'), new Date(Date.UTC(2026, 0, 2, 17, 45)), 1).map(formatRun);
    expect(afterFriday).toEqual(['05/01/2026 09:00 (segunda-feira)']);
    // Estritamente depois do instante inicial.
    expect(nextRuns(parseCron('0 3 * * *'), new Date(Date.UTC(2026, 0, 1, 3, 0)), 1).map(formatRun)).toEqual(['02/01/2026 03:00 (sexta-feira)']);
  });

  it('dia do mês e dia da semana restritos valem como "ou"', () => {
    const runs = nextRuns(parseCron('0 0 1 * 1'), thursday, 6).map(formatRun);
    expect(runs.map((r) => r.slice(0, 10))).toEqual(['05/01/2026', '12/01/2026', '19/01/2026', '26/01/2026', '01/02/2026', '02/02/2026']);
  });

  it('trata anos bissextos e datas impossíveis', () => {
    expect(nextRuns(parseCron('0 0 29 2 *'), thursday, 1).map(formatRun)).toEqual(['29/02/2028 00:00 (terça-feira)']);
    expect(nextRuns(parseCron('0 0 31 2 *'), thursday, 3)).toEqual([]);
  });

  it('explica em português', () => {
    expect(describeCron(parseCron('0 3 * * *'))).toBe('Às 03:00, todos os dias');
    expect(describeCron(parseCron('*/5 * * * *'))).toBe('A cada 5 minutos');
    expect(describeCron(parseCron('* * * * *'))).toBe('A cada minuto');
    expect(describeCron(parseCron('*/15 9-17 * * 1-5'))).toBe('A cada 15 minutos, entre 09:00 e 17:59, de segunda-feira a sexta-feira');
    expect(describeCron(parseCron('0 9 * * 1-5'))).toBe('Às 09:00, de segunda-feira a sexta-feira');
    expect(describeCron(parseCron('0 0 1 * *'))).toBe('Às 00:00, no dia 1 do mês');
    expect(describeCron(parseCron('30 4 1,15 * *'))).toBe('Às 04:30, nos dias 1 e 15 do mês');
    expect(describeCron(parseCron('0 */2 * * *'))).toBe('No minuto 0, a cada 2 horas');
    expect(describeCron(parseCron('0 0 1 jan *'))).toBe('Às 00:00, no dia 1 do mês, em janeiro');
    expect(describeCron(parseCron('15 * * * *'))).toBe('No minuto 15 de cada hora');
  });

  it('recusa expressões inválidas com mensagem clara', async () => {
    for (const bad of ['', '* * * *', '* * * * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '*/0 * * * *', '5-1 * * * *', 'a b c d e', '1,,2 * * * *', '@nunca', '1/2/3 * * * *', '* * * * 8']) {
      await fails(cronTool, { expression: bad, count: 1, from: '2026-01-01' });
    }
    await fails(cronTool, { expression: '* * * * *', count: 1, from: 'ontem' }, 'AAAA-MM-DD');
    await fails(cronTool, { expression: '* * * * *', count: 1, from: '2026-02-30' }, 'inexistente');
  });

  it('a ferramenta devolve resumo, campos e execuções', async () => {
    const d = await data(cronTool, { expression: '0 3 * * *', count: 2, from: '2026-01-01T00:00' });
    expect(d.summary).toBe('Às 03:00, todos os dias');
    expect(d.nextRuns).toBe('01/01/2026 03:00 (quinta-feira)\n02/01/2026 03:00 (sexta-feira)');
    expect(String(d.fields)).toContain('Hora: 3 → 3');
  });
});

describe('comparador de textos', () => {
  const lines = (s: string) => s.split('\n');
  const plain = { ignoreCase: false, ignoreWhitespace: false };

  it('conta o que mudou', async () => {
    const d = await data(textDiffTool, { original: 'a\nb\nc', changed: 'a\nB\nc', ignoreCase: false, ignoreWhitespace: false, context: 1 });
    expect(d).toMatchObject({ added: 1, removed: 1, unchanged: 2, identical: false });
    expect(String(d.diff)).toBe('  a\n- b\n+ B\n  c');
    expect(await data(textDiffTool, { original: 'x', changed: 'x', ignoreCase: false, ignoreWhitespace: false, context: 3 })).toMatchObject({ identical: true, diff: '(os textos são iguais)' });
  });

  it('ignora maiúsculas e espaços quando pedido', () => {
    expect(diffLines(['Olá  mundo'], ['olá mundo'], { ignoreCase: true, ignoreWhitespace: true }).every((o) => o.type === 'same')).toBe(true);
    expect(diffLines(['Olá'], ['olá'], plain).some((o) => o.type !== 'same')).toBe(true);
  });

  it('reconstrói os dois textos a partir das operações (propriedade)', () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let round = 0; round < 200; round++) {
      const make = () => Array.from({ length: Math.floor(rnd() * 12) }, () => String.fromCharCode(97 + Math.floor(rnd() * 4)));
      const a = make();
      const b = make();
      const ops = diffLines(a, b, plain);
      expect(ops.filter((o) => o.type !== 'add').map((o) => o.line)).toEqual(a);
      expect(ops.filter((o) => o.type !== 'remove').map((o) => o.line)).toEqual(b);
    }
  });

  it('usa a menor edição (maior subsequência comum)', () => {
    const ops = diffLines(lines('a\nb\nc\nd\ne'), lines('a\nc\nd\nx\ne'), plain);
    expect(ops.filter((o) => o.type === 'remove').map((o) => o.line)).toEqual(['b']);
    expect(ops.filter((o) => o.type === 'add').map((o) => o.line)).toEqual(['x']);
  });

  it('mostra só o contexto e separa trechos distantes', () => {
    const a = Array.from({ length: 20 }, (_, i) => `l${i}`);
    const b = [...a];
    b[2] = 'X';
    b[17] = 'Y';
    const out = renderDiff(diffLines(a, b, plain), 1);
    expect(out).toContain('…');
    expect(out).not.toContain('l10');
    expect(out).toContain('- l2\n+ X');
  });

  it('recusa textos enormes e muito diferentes sem travar', async () => {
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join('\n');
    const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join('\n');
    await fails(textDiffTool, { original: a, changed: b, ignoreCase: false, ignoreWhitespace: false, context: 3 }, 'grandes');
  });
});

describe('YAML para JSON', () => {
  it('converte documentos comuns', () => {
    expect(yamlToJson('nome: Maria\nidade: 30\ntags:\n  - dev\n  - qa', 0)).toBe('{"nome":"Maria","idade":30,"tags":["dev","qa"]}');
    expect(yamlToJson('a: 1', 2)).toBe('{\n  "a": 1\n}');
    expect(yamlToJson('x: &base {a: 1}\ny: *base', 0)).toBe('{"x":{"a":1},"y":{"a":1}}');
    expect(yamlToJson('- 1\n- true\n- null\n- "2"', 0)).toBe('[1,true,null,"2"]');
  });

  it('aponta a linha do erro e rejeita chaves repetidas', async () => {
    await fails(yamlJsonTool, { text: 'a: [1, 2\nb: 3', indent: 2 }, 'YAML inválido');
    await fails(yamlJsonTool, { text: 'a: 1\na: 2', indent: 2 }, 'YAML inválido');
    await fails(yamlJsonTool, { text: '   ', indent: 2 }, 'vazia');
    const r = await call(yamlJsonTool, { text: 'a: 1\n  b: 2', indent: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/linha \d+/);
  });

  it('não expande uma bomba de aliases', async () => {
    let doc = 'l0: &l0 [x, x, x, x, x, x, x, x, x]\n';
    for (let i = 1; i < 10; i++) doc += `l${i}: &l${i} [${Array(9).fill(`*l${i - 1}`).join(', ')}]\n`;
    await fails(yamlJsonTool, { text: doc, indent: 0 });
  });
});

describe('JSON para CSV', () => {
  it('converte uma lista de objetos', () => {
    expect(jsonToCsv('[{"nome":"Ana","idade":30},{"nome":"Bruno","idade":25}]', ',')).toEqual({ csv: 'nome,idade\nAna,30\nBruno,25', rows: 2, columns: 2 });
    expect(jsonToCsv('{"a":1}', ',').csv).toBe('a\n1');
  });

  it('une colunas, achata objetos e guarda listas como JSON', () => {
    const r = jsonToCsv('[{"a":1,"o":{"x":1,"y":{"z":2}}},{"b":"t","l":[1,2]}]', ';');
    expect(r.csv.split('\n')[0]).toBe('a;o.x;o.y.z;b;l');
    expect(r.csv.split('\n')[2]).toBe(';;;t;[1,2]');
    // Com vírgula como separador, a vírgula dentro da lista obriga a aspas.
    expect(jsonToCsv('[{"l":[1,2]}]', ',').csv).toBe('l\n"[1,2]"');
    expect(jsonToCsv('[1,"a"]', ',').csv).toBe('valor\n1\na');
  });

  it('protege contra injeção de fórmula, mas não mexe em números negativos', () => {
    const r = jsonToCsv('[{"v":"=1+1"},{"v":"+cmd"},{"v":"@x"},{"v":"-5"},{"v":-3},{"v":"-texto"}]', ',');
    expect(r.csv.split('\n').slice(1)).toEqual(["'=1+1", "'+cmd", "'@x", '-5', '-3', "'-texto"]);
  });

  it('escapa aspas, vírgulas e quebras de linha', () => {
    expect(jsonToCsv('[{"t":"a,b","u":"x\\ny","v":"diz \\"oi\\""}]', ',').csv).toBe('t,u,v\n"a,b","x\ny","diz ""oi"""');
  });

  it('recusa JSON inválido e entrada vazia', async () => {
    await fails(jsonCsvTool, { text: '[{"a":', delimiter: ',' }, 'JSON inválido');
    await fails(jsonCsvTool, { text: '', delimiter: ',' }, 'vazia');
  });
});

describe('validador de boleto', () => {
  const real = '00190.50095 40144.816069 06809.350314 3 37370000000100';
  const ref = { year: 2007, month: 12, day: 1 };

  it('valida a linha digitável do exemplo do Banco do Brasil', () => {
    const r = analyzeBoleto(real, ref);
    expect(r.valid).toBe(true);
    expect(r.details).toMatchObject({ bank: '001 (Banco do Brasil)', amount: 'R$ 1,00', dueDate: '31/12/2007', type: 'Boleto de cobrança bancária' });
    expect(r.details?.barcode).toHaveLength(44);
  });

  it('aceita o código de barras e a linha sem pontuação e gera a linha a partir dele', () => {
    const barcode = String(analyzeBoleto(real, ref).details?.barcode);
    const fromBarcode = analyzeBoleto(barcode, ref);
    expect(fromBarcode.valid).toBe(true);
    expect(fromBarcode.details?.line).toBe(real);
    expect(analyzeBoleto(real.replace(/\D/g, ''), ref).valid).toBe(true);
  });

  it('acusa qualquer dígito trocado', () => {
    const digits = real.replace(/\D/g, '');
    for (let pos = 0; pos < digits.length; pos++) {
      const mutated = digits.slice(0, pos) + String((Number(digits[pos]) + 1) % 10) + digits.slice(pos + 1);
      // Trocar o valor ou o vencimento só quebra o dígito geral, e é exatamente isso que precisa acusar.
      expect(analyzeBoleto(mutated, ref).valid, `posição ${pos}`).toBe(false);
    }
  });

  it('diz qual campo falhou e recusa tamanhos errados', () => {
    const digits = real.replace(/\D/g, '');
    expect(analyzeBoleto(digits.slice(0, 9) + '6' + digits.slice(10), ref).message).toContain('campo 1');
    expect(analyzeBoleto('123', ref).message).toContain('47 dígitos');
    expect(analyzeBoleto('', ref).valid).toBe(false);
    expect(analyzeBoleto('abc', ref).valid).toBe(false);
  });

  it('valida boletos gerados pelo gerador demonstrativo, inclusive sem valor e sem vencimento', () => {
    for (const [factor, cents] of [[0, 0], [1000, 12345], [9999, 99999999], [4321, 1]] as const) {
      const { line, barcode } = buildBoleto({ bank: '237', currency: '9', factor, amountCents: cents, freeField: '1234567890123456789012345' });
      for (const text of [line, barcode]) {
        const r = analyzeBoleto(text, ref);
        expect(r.valid, text).toBe(true);
        expect(r.details?.bank).toBe('237 (Bradesco)');
      }
    }
    const free = analyzeBoleto(buildBoleto({ bank: '341', currency: '9', factor: 0, amountCents: 0, freeField: '0'.repeat(25) }).line, ref);
    expect(free.details).toMatchObject({ amount: 'Sem valor fixo (definido no pagamento)', dueDate: 'Sem data de vencimento (à vista)' });
  });

  it('escolhe o ciclo do fator de vencimento mais próximo de hoje', () => {
    expect(dueDateFromFactor(0, ref)).toBeNull();
    // 1000 → 03/07/2000 no ciclo antigo e 22/02/2025 no novo.
    expect(dueDateFromFactor(1000, { year: 2000, month: 6, day: 1 })?.date).toEqual({ year: 2000, month: 7, day: 3 });
    expect(dueDateFromFactor(1000, { year: 2026, month: 10, day: 1 })?.date).toEqual({ year: 2025, month: 2, day: 22 });
    expect(dueDateFromFactor(3737, ref)).toEqual({ date: { year: 2007, month: 12, day: 31 }, repeats: true, other: { year: 2032, month: 8, day: 21 } });
    expect(analyzeBoleto(real, { year: 2026, month: 10, day: 18 }).details?.dueNote).toContain('31/12/2007');
    expect(dueDateFromFactor(999, ref)?.repeats).toBe(false);
  });

  it('valida boletos de arrecadação (convênio) de módulo 10 e 11, em 44 e 48 dígitos', () => {
    for (const id of ['6', '8', '7', '9']) {
      const module10 = id === '6' || id === '7';
      const dv = (s: string) => (module10 ? mod10(s) : convenioMod11(s));
      const forty3 = ('83' + id + '00000123456789012345678901234567890123456789').slice(0, 43);
      const barcode = forty3.slice(0, 3) + dv(forty3) + forty3.slice(3);
      expect(barcode).toHaveLength(44);
      const blocks = [0, 1, 2, 3].map((i) => barcode.slice(i * 11, i * 11 + 11));
      const line = blocks.map((b) => b + dv(b)).join('');
      expect(line).toHaveLength(48);
      for (const text of [barcode, line]) {
        const r = analyzeBoleto(text, ref);
        expect(r.valid, `${id} ${text}`).toBe(true);
        expect(r.details?.type).toBe('Boleto de arrecadação (convênio)');
        expect(r.details?.segment).toBe('Energia elétrica e gás');
      }
      // Trocar um dígito do meio é acusado.
      const bad = barcode.slice(0, 20) + String((Number(barcode[20]) + 1) % 10) + barcode.slice(21);
      expect(analyzeBoleto(bad, ref).valid).toBe(false);
    }
  });

  it('o módulo 11 de convênio trata resto 0 e 1 como zero', () => {
    expect(convenioMod11('2')).toBe(7); // soma 4 → resto 4 → 11 − 4
    expect(convenioMod11('1')).toBe(9); // soma 2
    expect(convenioMod11('0')).toBe(0);
    expect(convenioMod11('14')).toBe(0); // soma 11 → resto 0
    expect(convenioMod11('06')).toBe(0); // soma 12 → resto 1
    expect(convenioMod11('5')).toBe(1); // soma 10 → resto 10
  });

  it('a ferramenta responde no formato dos validadores', async () => {
    const d = await data(boletoValidatorTool, { value: real });
    expect(d.valid).toBe(true);
    expect(d.bank).toContain('Banco do Brasil');
    expect((await data(boletoValidatorTool, { value: '123' })).valid).toBe(false);
  });
});

describe('CLT ou PJ', () => {
  const base = { cltSalary: 6000, cltBenefits: 0, pjRevenue: 9000, regime: 'simples_factor_r', pjExpenses: 300, unpaidMonths: 1, dependents: 0, year: 2026 };

  it('monta o ano CLT com 11 meses, férias com 1/3, 13º, FGTS e benefícios', () => {
    const month = calcNetSalary({ gross: 6000, dependents: 0, pension: 0, transportDiscount: 0, other: 0, deduction: 'auto', year: 2026 }).net;
    const c = cltYear(6000, 500, 0, 2026);
    expect(c.monthlyNet).toBeCloseTo(month, 2);
    expect(c.thirteenthNet).toBeCloseTo(month, 2);
    expect(c.vacationNet).toBeGreaterThan(month);
    expect(c.annualNet).toBeCloseTo(11 * month + c.vacationNet + month, 1);
    expect(c.fgtsAnnual).toBeCloseTo(0.08 * (6000 * 12 + 2000 + 6000), 2);
    expect(c.benefitsAnnual).toBe(6000);
    expect(c.total).toBeCloseTo(c.annualNet + c.fgtsAnnual + c.benefitsAnnual, 1);
  });

  it('compara e a diferença é coerente com os equivalentes mensais', async () => {
    const d = await data(cltVsPjTool, base);
    expect(d.difference).toBeCloseTo((d.pjMonthlyEquivalent as number) - (d.cltMonthlyEquivalent as number), 2);
    expect(d.pjAnnualNet).toBeCloseTo((d.pjMonthlyNet as number) * 11, 1);
    expect(String(d.verdict)).toMatch(/rende|Empate/);
  });

  it('o faturamento de empate de fato empata', () => {
    const o = { regime: 'simples_factor_r' as const, proLabore: undefined, expenses: 300, dependents: 0, year: 2026 };
    const target = cltYear(6000, 0, 0, 2026).total / 12;
    const be = breakEvenRevenue(target, 11 / 12, o);
    expect(be).toBeDefined();
    expect((pjMonthlyNet(be as number, o) * 11) / 12).toBeCloseTo(target, 0);
    expect(be as number).toBeGreaterThan(6000);
    // Faturando 10% acima do empate, o PJ ganha; 10% abaixo, perde.
    expect((pjMonthlyNet((be as number) * 1.1, o) * 11) / 12).toBeGreaterThan(target);
    expect((pjMonthlyNet((be as number) * 0.9, o) * 11) / 12).toBeLessThan(target);
  });

  it('MEI não calcula empate e entradas inválidas são recusadas', async () => {
    const d = await data(cltVsPjTool, { ...base, regime: 'mei_services', pjRevenue: 5000 });
    expect(d.breakEvenRevenue).toBeUndefined();
    await fails(cltVsPjTool, { ...base, cltSalary: 0 }, 'salário');
    await fails(cltVsPjTool, { ...base, pjRevenue: 0 }, 'faturamento');
    await fails(cltVsPjTool, { ...base, year: 1999 });
  });

  it('o PJ rende mais quanto mais fatura', () => {
    const o = { regime: 'simples_factor_r' as const, proLabore: undefined, expenses: 0, dependents: 0, year: 2026 };
    let last = 0;
    for (const r of [3000, 5000, 8000, 12000, 20000, 40000, 80000]) {
      const v = pjMonthlyNet(r, o);
      expect(v).toBeGreaterThan(last);
      last = v;
    }
  });
});

describe('custo de um funcionário', () => {
  it('Simples: só FGTS como encargo', () => {
    const c = employeeCost({ salary: 3000, benefits: 0, simples: true, ratPercent: 2, thirdPartiesPercent: 5.8, includeFgtsFine: false });
    expect(c).toMatchObject({ thirteenth: 250, vacation: 333.33, fgts: 286.67, employerInss: 0, rat: 0, thirdParties: 0, monthly: 3870 });
  });

  it('lucro presumido: 20% + RAT + terceiros sobre salário, 13º e férias sem o terço', () => {
    const c = employeeCost({ salary: 3000, benefits: 400, simples: false, ratPercent: 2, thirdPartiesPercent: 5.8, includeFgtsFine: true });
    expect(c.employerInss).toBe(700);
    expect(c.rat).toBe(70);
    expect(c.thirdParties).toBe(203);
    expect(c.fgtsFine).toBeCloseTo(0.4 * 286.67, 1);
    expect(c.monthly).toBeCloseTo(3000 + 250 + 333.33 + 286.67 + 700 + 70 + 203 + 400 + c.fgtsFine, 1);
  });

  it('a ferramenta calcula o múltiplo e recusa salário zero', async () => {
    const d = await data(employeeCostTool, { salary: 3000, benefits: 0, regime: 'presumido', ratPercent: 2, thirdPartiesPercent: 5.8, includeFgtsFine: false });
    expect(d.monthlyCost).toBeCloseTo(4843, 0);
    expect(d.multiplier).toBeCloseTo(1.61, 2);
    expect(d.annualCost).toBeCloseTo((d.monthlyCost as number) * 12, 0);
    await fails(employeeCostTool, { salary: 0, benefits: 0, regime: 'simples', ratPercent: 2, thirdPartiesPercent: 5.8, includeFgtsFine: false }, 'salário');
  });
});

describe('DAS MEI', () => {
  it('2026: 5% de R$ 1.621 mais ICMS e ISS', () => {
    expect(meiDas('commerce', 2026)).toMatchObject({ inss: 81.05, total: 82.05 });
    expect(meiDas('services', 2026)).toMatchObject({ inss: 81.05, total: 86.05 });
    expect(meiDas('both', 2026)).toMatchObject({ inss: 81.05, total: 87.05 });
  });

  it('2025 usa o salário mínimo de 2025', () => {
    expect(meiDas('commerce', 2025).total).toBe(76.9);
    expect(meiDas('services', 2025).total).toBe(80.9);
    expect(meiDas('both', 2025).total).toBe(81.9);
  });

  it('limite proporcional e situação do faturamento', async () => {
    const full = await data(meiDasTool, { activity: 'services', year: 2026, monthsActive: 12, revenueYear: 70000 });
    expect(full).toMatchObject({ das: 86.05, annualLimit: 81000, tolerance: 97200, annualCost: 1032.6 });
    expect(String(full.status)).toContain('Dentro do limite');
    expect(String((await data(meiDasTool, { activity: 'services', year: 2026, monthsActive: 12, revenueYear: 90000 })).status)).toContain('até 20%');
    expect(String((await data(meiDasTool, { activity: 'services', year: 2026, monthsActive: 12, revenueYear: 100000 })).status)).toContain('mais de 20%');
    const partial = await data(meiDasTool, { activity: 'commerce', year: 2026, monthsActive: 5, revenueYear: 33750 });
    expect(partial).toMatchObject({ annualLimit: 33750, tolerance: 40500 });
    expect(String(partial.status)).toContain('Dentro do limite');
    await fails(meiDasTool, { activity: 'services', year: 1999, monthsActive: 12 });
  });
});

describe('markup', () => {
  it('forma o preço com o markup divisor', async () => {
    const d = await data(markupTool, { mode: 'price', cost: 50, taxesPercent: 10, commissionPercent: 5, otherPercent: 0, profitPercent: 20, salePrice: 100 });
    expect(d).toMatchObject({ price: 76.92, multiplier: 1.5385, markupPercent: 53.85, grossProfit: 26.92, variableCosts: 11.54, netProfit: 15.38, netMarginPercent: 20 });
    expect(d.grossMarginPercent).toBeCloseTo(35, 1);
  });

  it('markup de 100% é margem de 50%', async () => {
    const d = await data(markupTool, { mode: 'analyze', cost: 50, taxesPercent: 0, commissionPercent: 0, otherPercent: 0, profitPercent: 0, salePrice: 100 });
    expect(d).toMatchObject({ markupPercent: 100, grossMarginPercent: 50, netProfit: 50, netMarginPercent: 50 });
  });

  it('analisa um preço existente com despesas variáveis', async () => {
    const d = await data(markupTool, { mode: 'analyze', cost: 50, taxesPercent: 10, commissionPercent: 5, otherPercent: 0, profitPercent: 20, salePrice: 100 });
    expect(d).toMatchObject({ variableCosts: 15, netProfit: 35, netMarginPercent: 35 });
  });

  it('é consistente: o preço calculado entrega o lucro pedido', async () => {
    for (const profit of [1, 10, 25, 40, 60]) {
      const d = await data(markupTool, { mode: 'price', cost: 37.9, taxesPercent: 6, commissionPercent: 3, otherPercent: 2, profitPercent: profit, salePrice: 100 });
      expect(d.netMarginPercent as number).toBeCloseTo(profit, 1);
    }
  });

  it('recusa soma de 100% ou mais e custo zero', async () => {
    await fails(markupTool, { mode: 'price', cost: 10, taxesPercent: 40, commissionPercent: 30, otherPercent: 10, profitPercent: 20, salePrice: 100 }, '100%');
    await fails(markupTool, { mode: 'price', cost: 0, taxesPercent: 0, commissionPercent: 0, otherPercent: 0, profitPercent: 10, salePrice: 100 }, 'custo');
    await fails(markupTool, { mode: 'analyze', cost: 10, taxesPercent: 0, commissionPercent: 0, otherPercent: 0, profitPercent: 10, salePrice: 0 }, 'preço');
  });
});

describe('renda fixa', () => {
  const base = { amount: 10000, months: 12, cdiAnnualPercent: 14.9, selicAnnualPercent: 15, cdbPercentCdi: 100, lciPercentCdi: 90, trMonthlyPercent: 0 };

  it('IR regressivo nas faixas oficiais', () => {
    expect(irRateForDays(1)).toBe(0.225);
    expect(irRateForDays(180)).toBe(0.225);
    expect(irRateForDays(181)).toBe(0.2);
    expect(irRateForDays(360)).toBe(0.2);
    expect(irRateForDays(361)).toBe(0.175);
    expect(irRateForDays(720)).toBe(0.175);
    expect(irRateForDays(721)).toBe(0.15);
  });

  it('100% do CDI por 252 dias úteis rende exatamente o CDI do ano', () => {
    expect(cdiFactor(10, 100, 252)).toBeCloseTo(1.1, 12);
    expect(cdiFactor(10, 0, 252)).toBe(1);
    expect(cdiFactor(12, 50, 252)).toBeGreaterThan(1.05);
    expect(cdiFactor(12, 50, 252)).toBeLessThan(1.06);
  });

  it('poupança: 0,5% ao mês com Selic acima de 8,5%, senão 70% da Selic', () => {
    expect(savingsMonthlyRate(15, 0)).toBeCloseTo(0.005, 12);
    expect(savingsMonthlyRate(8.5, 0)).toBeCloseTo((0.7 * 8.5) / 100 / 12, 12);
    expect(savingsMonthlyRate(10, 0.1)).toBeCloseTo(1.005 * 1.001 - 1, 12);
  });

  it('calcula o CDB de 12 meses: IR de 17,5% sobre o lucro', async () => {
    const d = await data(fixedIncomeTool, base);
    expect(d.cdbIrRate).toBe(17.5);
    expect(d.cdbIr).toBeCloseTo(((d.cdbGross as number) - 10000) * 0.175, 1);
    expect(d.cdbNet).toBeCloseTo((d.cdbGross as number) - (d.cdbIr as number), 1);
    // 365 dias corridos ≈ 252 dias úteis: bruto de 100% do CDI = 14,9%.
    expect(d.cdbGross).toBeCloseTo(11490, -1);
    expect(d.savingsNet).toBeCloseTo(10000 * 1.005 ** 12, 1);
    expect(d.lciNet as number).toBeGreaterThan(d.savingsNet as number);
  });

  it('prazo curto: 6 meses cai na faixa de 20% e a LCI isenta pode ganhar do CDB', async () => {
    const d = await data(fixedIncomeTool, { ...base, months: 6 });
    expect(d.cdbIrRate).toBe(20);
    expect(d.lciNet as number).toBeGreaterThan(d.cdbNet as number);
    expect(String(d.best)).toContain('LCI/LCA');
  });

  it('prazos longos usam 15% e a poupança perde para a renda fixa nesses juros', async () => {
    const d = await data(fixedIncomeTool, { ...base, months: 36 });
    expect(d.cdbIrRate).toBe(15);
    expect(d.cdbNet as number).toBeGreaterThan(d.savingsNet as number);
  });

  it('recusa valor zerado', async () => {
    await fails(fixedIncomeTool, { ...base, amount: 0 }, 'valor');
  });
});
