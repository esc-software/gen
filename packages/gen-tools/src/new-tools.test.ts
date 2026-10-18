import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  LOTTERY_GAMES, base64UrlDecode, base64UrlEncode, decodeJwt, describeTimes, fromRoman, gcd, gcdLcmTool, jsonToXml, jwtTool, lcm, lineListTool, lotteryTool, parseIntegers,
  pickNumbers, processLines, quadraticTool, romanTool, signJwt, solveQuadratic, splitLines, toRoman, verifyJwt, xmlJsonTool, xmlToJson, primeFactors,
  type LotteryGame,
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

describe('JWT', () => {
  const secret = 'your-256-bit-secret';
  const claims = { sub: '1234567890', name: 'John Doe', iat: 1516239022 };
  const known = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

  it('gera o token do exemplo público do jwt.io, byte a byte', () => {
    expect(signJwt({ algorithm: 'HS256', secret, payload: claims })).toBe(known);
  });

  it('a assinatura bate com o HMAC do Node para HS256, HS384 e HS512', () => {
    for (const [alg, name] of [['HS256', 'sha256'], ['HS384', 'sha384'], ['HS512', 'sha512']] as const) {
      const token = signJwt({ algorithm: alg, secret: 'segredo-de-teste-com-acentuação-é', payload: { a: 1, b: 'ç' } });
      const [h, p, s] = token.split('.') as [string, string, string];
      const expected = createHmac(name, 'segredo-de-teste-com-acentuação-é').update(`${h}.${p}`).digest('base64url');
      expect(s, alg).toBe(expected);
      expect(verifyJwt(token, 'segredo-de-teste-com-acentuação-é').valid, alg).toBe(true);
    }
  });

  it('decodifica sem verificar e mostra cabeçalho e payload', () => {
    const d = decodeJwt(known);
    expect(d.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(d.payload).toEqual(claims);
  });

  it('verifica: segredo certo passa; segredo errado e token alterado falham', () => {
    expect(verifyJwt(known, secret).valid).toBe(true);
    expect(verifyJwt(known, 'outro-segredo').valid).toBe(false);
    const [h, , s] = known.split('.') as [string, string, string];
    const forged = `${h}.${base64UrlEncode(new TextEncoder().encode(JSON.stringify({ ...claims, admin: true })))}.${s}`;
    expect(verifyJwt(forged, secret).valid).toBe(false);
    expect(verifyJwt(`${known.slice(0, -2)}AA`, secret).valid).toBe(false);
  });

  it('recusa "alg: none" e algoritmos que não são HMAC (ataques clássicos de JWT)', () => {
    const enc = (o: unknown) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(o)));
    expect(() => verifyJwt(`${enc({ alg: 'none', typ: 'JWT' })}.${enc({ sub: '1' })}.`, 'x')).toThrow(/não suportado/);
    expect(() => verifyJwt(`${enc({ alg: 'NONE' })}.${enc({ sub: '1' })}.`, 'x')).toThrow(/não suportado/);
    expect(() => verifyJwt(`${enc({ alg: 'RS256' })}.${enc({ sub: '1' })}.abc`, 'x')).toThrow(/não suportado/);
    expect(() => verifyJwt(`${enc({ typ: 'JWT' })}.${enc({ sub: '1' })}.abc`, 'x')).toThrow(/não suportado/);
    // o objeto do cabeçalho não pode herdar "alg" do prototype
    expect(() => verifyJwt(`${enc({ alg: 'constructor' })}.${enc({ sub: '1' })}.abc`, 'x')).toThrow(/não suportado/);
  });

  it('entradas inválidas dão erro claro', () => {
    expect(() => decodeJwt('a.b')).toThrow(/3 partes/);
    expect(() => decodeJwt('a.b.c.d')).toThrow(/3 partes/);
    expect(() => decodeJwt('!!!.e30.x')).toThrow(/Base64URL/);
    expect(() => decodeJwt('e30.e1.x')).toThrow();
    expect(() => decodeJwt(`${base64UrlEncode(new TextEncoder().encode('[1]'))}.e30.x`)).toThrow(/objeto/);
    expect(() => signJwt({ algorithm: 'HS256', secret: '', payload: {} })).toThrow(/segredo/);
    expect(() => verifyJwt(known, '')).toThrow(/segredo/);
    expect(() => base64UrlDecode('a')).toThrow();
  });

  it('as datas iat, nbf e exp viram texto legível e a situação é calculada', () => {
    const t = describeTimes({ iat: 1516239022, exp: 1516239022 + 3600 }, 1516239022 + 60);
    expect(t.issuedAt).toBe('2018-01-18T01:30:22Z');
    expect(t.status).toContain('Válido até 2018-01-18T02:30:22Z');
    expect(describeTimes({ exp: 1000 }, 2000).status).toContain('Expirado');
    expect(describeTimes({ nbf: 5000 }, 2000).status).toContain('Ainda não é válido');
    expect(describeTimes({}, 2000).status).toContain('não expira');
  });

  it('a ferramenta gera, decodifica e verifica pelo mesmo caminho', async () => {
    const generated = await data(jwtTool, { action: 'generate', algorithm: 'HS384', payload: '{"sub":"42"}', secret: 'x'.repeat(48), expiresInMinutes: 10, issuedAt: 1_700_000_000 });
    const token = String(generated.token);
    expect(JSON.parse(String(generated.payload))).toEqual({ sub: '42', iat: 1_700_000_000, exp: 1_700_000_600 });
    expect(generated.algorithm).toBe('HS384');
    const decoded = await data(jwtTool, { action: 'decode', token });
    expect(JSON.parse(String(decoded.header))).toEqual({ alg: 'HS384', typ: 'JWT' });
    expect(String(decoded.note)).toContain('não verifica a assinatura');
    expect((await data(jwtTool, { action: 'verify', token, secret: 'x'.repeat(48) })).signatureValid).toBe(true);
    expect((await data(jwtTool, { action: 'verify', token, secret: 'errado' })).signatureValid).toBe(false);
  });

  it('avisa quando o segredo é curto e recusa payload que não é objeto', async () => {
    const out = await data(jwtTool, { action: 'generate', payload: '{"a":1}', secret: 'curto' });
    expect(String(out.note)).toContain('menos de 32 caracteres');
    await fails(jwtTool, { action: 'generate', payload: '[1,2]', secret: 'abc' }, 'objeto');
    await fails(jwtTool, { action: 'generate', payload: '{', secret: 'abc' }, 'JSON');
    await fails(jwtTool, { action: 'generate', payload: '{}', secret: '' }, 'segredo');
    await fails(jwtTool, { action: 'decode', token: '' }, 'token');
    await fails(jwtTool, { action: 'verify', token: known, secret: '' }, 'segredo');
    await fails(jwtTool, { action: 'generate', payload: '{}', secret: 'a', algorithm: 'RS256' });
  });
});

describe('gerador de números da loteria', () => {
  it('cada jogo respeita a quantidade, o intervalo e a ordem crescente, sem repetir dezenas', () => {
    for (const game of Object.keys(LOTTERY_GAMES) as LotteryGame[]) {
      const rule = LOTTERY_GAMES[game];
      for (const size of [rule.min, rule.max]) {
        const picked = pickNumbers(game, size);
        expect(picked, game).toHaveLength(size);
        expect(new Set(picked).size, game).toBe(size);
        expect([...picked].sort((a, b) => a - b), game).toEqual(picked);
        for (const n of picked) {
          expect(n).toBeGreaterThanOrEqual(rule.from);
          expect(n).toBeLessThanOrEqual(rule.to);
        }
      }
    }
  });

  it('a Lotomania usa 50 dezenas de 00 a 99', async () => {
    const out = await data(lotteryTool, { game: 'lotomania', bets: 1 });
    const line = (out.bets as string[])[0] as string;
    expect(line.split(' ')).toHaveLength(50);
    expect(out.rule).toBe('50 dezenas de 00 a 99');
  });

  it('formata com dois dígitos e gera várias apostas', async () => {
    const out = await data(lotteryTool, { game: 'megasena', bets: 5 });
    expect(out.bets).toHaveLength(5);
    for (const line of out.bets as string[]) expect(line).toMatch(/^\d{2}( \d{2}){5}$/);
    expect(out.game).toBe('Mega-Sena');
    expect(String(out.note)).toContain('não aumenta');
  });

  it('recusa quantidades fora do permitido', async () => {
    await fails(lotteryTool, { game: 'megasena', count: 5 }, 'de 6 a 20');
    await fails(lotteryTool, { game: 'megasena', count: 21 }, 'de 6 a 20');
    await fails(lotteryTool, { game: 'lotomania', count: 10 }, 'exatamente 50');
    await fails(lotteryTool, { game: 'bingo' });
    await fails(lotteryTool, { bets: 0 });
    await fails(lotteryTool, { bets: 51 });
  });

  it('não é sempre a mesma aposta (aleatoriedade)', () => {
    const seen = new Set(Array.from({ length: 30 }, () => pickNumbers('megasena').join('-')));
    expect(seen.size).toBeGreaterThan(25);
  });
});

describe('equação do 2º grau', () => {
  it('duas raízes reais', () => {
    const s = solveQuadratic(1, -5, 6);
    expect(s).toMatchObject({ delta: 1, kind: 'two-real', x1: 3, x2: 2, vertex: { x: 2.5, y: -0.25 } });
  });
  it('raiz dupla e sem raízes reais', () => {
    expect(solveQuadratic(1, -2, 1)).toMatchObject({ delta: 0, kind: 'one-real', x1: 1 });
    const c = solveQuadratic(1, 1, 1);
    expect(c.kind).toBe('complex');
    expect(c.delta).toBe(-3);
    expect(c.realPart).toBe(-0.5);
    expect(c.imaginaryPart).toBeCloseTo(0.866025403784, 11);
  });
  it('a negativo e coeficientes decimais', () => {
    expect(solveQuadratic(-1, 0, 4)).toMatchObject({ kind: 'two-real', x1: -2, x2: 2 });
    const s = solveQuadratic(0.5, -1.5, 1);
    expect(s.x1).toBe(2);
    expect(s.x2).toBe(1);
  });
  it('as raízes anulam a equação', () => {
    for (const [a, b, c] of [[2, -7, 3], [1, 4, -5], [3, 1, -2]] as const) {
      const s = solveQuadratic(a, b, c);
      for (const x of [s.x1, s.x2] as number[]) expect(Math.abs(a * x * x + b * x + c)).toBeLessThan(1e-9);
    }
  });
  it('a ferramenta mostra o passo a passo e recusa a = 0', async () => {
    const out = await data(quadraticTool, { a: 1, b: -5, c: 6 });
    expect(out.roots).toBe('x₁ = 3 e x₂ = 2');
    expect(out.delta).toBe('1');
    expect(out.equation).toBe('1x² − 5x + 6 = 0');
    expect((out.steps as string[])[0]).toContain('Δ = b² − 4ac');
    expect(out.vertex).toBe('(2,5; -0,25)');
    expect(out.concavity).toContain('para cima');
    await fails(quadraticTool, { a: 0, b: 1, c: 1 }, 'não pode ser zero');
    await fails(quadraticTool, { a: 1e13, b: 1, c: 1 });
    await fails(quadraticTool, { a: 'x', b: 1, c: 1 });
  });
});

describe('MMC e MDC', () => {
  it('exemplos conhecidos', async () => {
    const out = await data(gcdLcmTool, { numbers: '12, 18, 30' });
    expect(out).toMatchObject({ mdc: '6', mmc: '180', coprimes: false });
    expect(out.factorization).toEqual(['12 = 2² × 3', '18 = 2 × 3²', '30 = 2 × 3 × 5']);
    expect(await data(gcdLcmTool, { numbers: '7 13' })).toMatchObject({ mdc: '1', mmc: '91', coprimes: true });
    expect(await data(gcdLcmTool, { numbers: '1\n1' })).toMatchObject({ mdc: '1', mmc: '1' });
  });
  it('gcd e lcm batem com a definição', () => {
    for (const [a, b] of [[12n, 18n], [35n, 14n], [17n, 5n], [100n, 100n]]) {
      expect(gcd(a as bigint, b as bigint) * lcm(a as bigint, b as bigint)).toBe((a as bigint) * (b as bigint));
    }
  });
  it('números grandes não perdem exatidão', async () => {
    const out = await data(gcdLcmTool, { numbers: '999999999999999 999999999999998' });
    expect(out.mdc).toBe('1');
    expect(out.mmc).toBe('999999999999997000000000000002');
    expect((out.factorization as string[])[0]).toContain('fatoração omitida');
  });
  it('fatoração', () => {
    expect([...primeFactors(360).entries()]).toEqual([[2, 3], [3, 2], [5, 1]]);
    expect([...primeFactors(97).entries()]).toEqual([[97, 1]]);
    expect([...primeFactors(999999937).entries()]).toEqual([[999999937, 1]]);
  });
  it('recusa entradas inválidas', async () => {
    await fails(gcdLcmTool, { numbers: '12' }, 'pelo menos dois');
    await fails(gcdLcmTool, { numbers: '12, 0' }, 'maiores que zero');
    await fails(gcdLcmTool, { numbers: '12, -4' }, 'inteiro positivo');
    await fails(gcdLcmTool, { numbers: '12, 3.5' }, 'inteiro positivo');
    await fails(gcdLcmTool, { numbers: '12, 1234567890123456' }, '15 dígitos');
    await fails(gcdLcmTool, { numbers: Array.from({ length: 21 }, (_, i) => i + 1).join(' ') }, 'no máximo 20');
    expect(() => parseIntegers('a b')).toThrow();
  });
});

describe('números romanos', () => {
  it('conversão nos dois sentidos para todos os valores de 1 a 3999', () => {
    for (let n = 1; n <= 3999; n++) expect(fromRoman(toRoman(n)), String(n)).toBe(n);
  });
  it('exemplos conhecidos', async () => {
    expect(toRoman(1994)).toBe('MCMXCIV');
    expect(toRoman(3999)).toBe('MMMCMXCIX');
    expect(toRoman(4)).toBe('IV');
    expect(await data(romanTool, { value: '2024' })).toEqual({ roman: 'MMXXIV', decimal: 2024 });
    expect(await data(romanTool, { value: 'xliv' })).toEqual({ roman: 'XLIV', decimal: 44 });
    expect(await data(romanTool, { value: ' MCMXC ' })).toEqual({ roman: 'MCMXC', decimal: 1990 });
  });
  it('recusa formas irregulares e valores fora do intervalo', async () => {
    for (const bad of ['IIII', 'VX', 'IC', 'MMMM', 'ABC', 'IIX', 'XXXX', '0', '4000', '-5', '1.5', '']) await fails(romanTool, { value: bad });
    expect(() => fromRoman('')).toThrow();
    expect(() => toRoman(0)).toThrow();
  });
});

describe('linhas de texto', () => {
  const run = (operation: string, text: string, extra: object = {}) => data(lineListTool, { operation, text, ...extra });
  it('remove duplicadas mantendo a primeira ocorrência e a ordem', async () => {
    expect(await run('dedupe', 'maçã\nbanana\nmaçã\nuva\nbanana')).toEqual({ result: 'maçã\nbanana\nuva', before: 5, after: 3, removed: 2 });
  });
  it('ignora maiúsculas só quando pedido, e corta espaços', async () => {
    expect((await run('dedupe', 'Ana\nana\n Ana ')).result).toBe('Ana\nana');
    expect((await run('dedupe', 'Ana\nana\n Ana ', { ignoreCase: true })).result).toBe('Ana');
    expect((await run('dedupe', 'a\n a', { trim: false })).result).toBe('a\n a');
  });
  it('ordena em português (acentos) de A a Z e de Z a A', async () => {
    expect((await run('sort-az', 'zebra\nébano\navião\nÁgua')).result).toBe('Água\navião\nébano\nzebra');
    expect((await run('sort-za', 'b\na\nc')).result).toBe('c\nb\na');
  });
  it('ordena numericamente, com vírgula, e deixa texto no fim', async () => {
    expect((await run('sort-numeric', '10\n2\n1,5\nabc\n-3')).result).toBe('-3\n1,5\n2\n10\nabc');
  });
  it('inverte, remove vazias e embaralha sem perder linhas', async () => {
    expect((await run('reverse', '1\n2\n3')).result).toBe('3\n2\n1');
    expect(await run('remove-empty', 'a\n\n  \nb\n')).toMatchObject({ result: 'a\nb', removed: 2 });
    const shuffled = String((await run('shuffle', Array.from({ length: 50 }, (_, i) => String(i)).join('\n'))).result).split('\n');
    expect([...shuffled].sort()).toEqual(Array.from({ length: 50 }, (_, i) => String(i)).sort());
  });
  it('quebra de linha no fim e CRLF não criam linhas a mais', () => {
    expect(splitLines('a\r\nb\r\n')).toEqual(['a', 'b']);
    expect(splitLines('')).toEqual([]);
    expect(processLines(['b', 'a'], { operation: 'sort-az', ignoreCase: false, trim: true })).toEqual(['a', 'b']);
  });
  it('recusa operação desconhecida e texto grande demais', async () => {
    await fails(lineListTool, { operation: 'apagar', text: 'a' });
    await fails(lineListTool, { text: 'x'.repeat(1_000_001) });
    await fails(lineListTool, { text: 'a\n'.repeat(200_001) }, 'linhas');
  });
});

describe('JSON e XML', () => {
  it('JSON para XML', () => {
    expect(jsonToXml('{"nome":"Ana","idade":30}', 'pessoa', false)).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<pessoa><nome>Ana</nome><idade>30</idade></pessoa>');
  });
  it('listas viram elementos repetidos; atributos usam "@_" e texto usa "#text"', () => {
    expect(jsonToXml('{"item":["a","b"]}', 'lista', false)).toContain('<lista><item>a</item><item>b</item></lista>');
    expect(jsonToXml('{"livro":{"@_id":"7","#text":"Dom Casmurro"}}', 'acervo', false)).toContain('<livro id="7">Dom Casmurro</livro>');
    expect(jsonToXml('[1,2]', 'r', false)).toContain('<r><item>1</item><item>2</item></r>');
  });
  it('escapa caracteres especiais do texto', () => {
    expect(jsonToXml('{"t":"a < b & c"}', 'r', false)).toContain('<t>a &lt; b &amp; c</t>');
  });
  it('XML para JSON, com atributos e repetição', () => {
    const json = JSON.parse(xmlToJson('<acervo><livro id="7">Dom Casmurro</livro><livro id="8">Iracema</livro></acervo>', false));
    expect(json).toEqual({ acervo: { livro: [{ '#text': 'Dom Casmurro', '@_id': '7' }, { '#text': 'Iracema', '@_id': '8' }] } });
    expect(JSON.parse(xmlToJson('<a><n>1</n><b>true</b></a>', false))).toEqual({ a: { n: '1', b: 'true' } });
  });
  it('ida e volta preserva a estrutura', () => {
    const original = { pessoa: { nome: 'Ana', tel: ['1', '2'] } };
    expect(JSON.parse(xmlToJson(jsonToXml(JSON.stringify(original.pessoa), 'pessoa', true), true))).toEqual(original);
  });
  it('recusa DOCTYPE e ENTITY (expansão de entidades), XML inválido e nomes inválidos', async () => {
    await fails(xmlJsonTool, { direction: 'xml-to-json', text: '<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>' }, 'DOCTYPE');
    await fails(xmlJsonTool, { direction: 'xml-to-json', text: '<a><!ENTITY x "y"></a>' }, 'ENTITY');
    await fails(xmlJsonTool, { direction: 'xml-to-json', text: '<a><b></a>' }, 'linha');
    await fails(xmlJsonTool, { direction: 'json-to-xml', text: '{"1abc":1}' }, 'nome válido');
    await fails(xmlJsonTool, { direction: 'json-to-xml', text: '{"a b":1}' }, 'nome válido');
    await fails(xmlJsonTool, { direction: 'json-to-xml', text: '{"a":1}', rootName: '1x' }, 'raiz');
    await fails(xmlJsonTool, { direction: 'json-to-xml', text: '{' }, 'JSON');
    await fails(xmlJsonTool, { text: '' }, 'Cole');
  });
  it('JSON muito aninhado não derruba a ferramenta', async () => {
    const deep = '['.repeat(500) + ']'.repeat(500);
    const r = await call(xmlJsonTool, { direction: 'json-to-xml', text: deep });
    expect(typeof r.ok).toBe('boolean');
  });
});
