import { describe, expect, it } from 'vitest';
import { createRng } from '@esc/gen-utils';
import {
  CEP_RANGES, GATEWAY_CARDS, IE_STATES, barcodeTool, boletoGeneralDv, buildBoleto, buildPixPayload, buildUtmUrl, checkBoletoLine, cnsGeneratorTool, crc16, demoBoletoTool,
  demoCardTool, demoPayslipTool, demoReceiptTool, dueFactor, escapeWifi, fakeAddressTool, fakeBankAccountTool, fakeEmailTool, fakePersonTool, formatCard, gameNickTool,
  generateAddress, generateCardNumber, generateCep, generateCns, generateEmail, generateIe, generateName, generatePerson, generatePlate, generateRg, generateSentence,
  generateUsername, genericDv, gs1CheckDigit, linkBuilderTool, luhnValid, makeBarcodeSvg, makeQrSvg, mod10, normalizeBarcode, normalizePixKey, parsePixPayload, pixDemoTool,
  pixGeneratorTool, plateGeneratorTool, qrCodeTool, raffleTool, randomNameTool, randomNumberTool, randomSentenceTool, rgCheckDigit, stateRegistrationTool, svgToDataUrl,
  testCardsTool, validateCEP, validateCNS, validateCPF, validateCard, validateEmail, validateIe, validatePhoneBR, validatePlate, whatsappLinkTool, whatsappNumber,
  wifiPayload, wifiTool, companyNameTool, withLuhn, calcNetSalary,
} from './index.js';

type Result = { ok: true; data: Record<string, unknown> } | { ok: false; error: { message: string; code: string; issues?: { path: string }[] } };
const run = async (tool: { run: (i: unknown) => Promise<unknown> }, input: unknown) => (await tool.run(input)) as Result;
const data = async (tool: { run: (i: unknown) => Promise<unknown> }, input: unknown) => {
  const r = await run(tool, input);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.data;
};
const fails = async (tool: { run: (i: unknown) => Promise<unknown> }, input: unknown, fragment?: string) => {
  const r = await run(tool, input);
  expect(r.ok).toBe(false);
  if (!r.ok && fragment) expect(JSON.stringify(r.error)).toContain(fragment);
};

describe('nomes, e-mails, frases e nicks', () => {
  it('semente reproduz exatamente e a ausência de semente varia', async () => {
    const a = await data(randomNameTool, { count: 10, seed: 'x' });
    const b = await data(randomNameTool, { count: 10, seed: 'x' });
    expect(a.names).toEqual(b.names);
    expect(a.names).not.toEqual((await data(randomNameTool, { count: 10, seed: 'y' })).names);
    expect((await data(randomNameTool, { count: 10 })).names).not.toEqual((await data(randomNameTool, { count: 10 })).names);
  });

  it('nomes respeitam sexo e quantidade de sobrenomes, sem repetir sobrenome', () => {
    const rng = createRng('n');
    for (let i = 0; i < 200; i++) {
      const f = generateName(rng, 'female', 3);
      expect(f.sex).toBe('female');
      const parts = f.full.split(' ');
      expect(parts).toHaveLength(4);
      expect(new Set(parts.slice(1)).size).toBe(3);
    }
    const kinds = new Set(Array.from({ length: 50 }, () => generateName(rng, 'any').sex));
    expect(kinds.size).toBe(2);
  });

  it('e-mails fictícios têm sintaxe válida e usam domínios reservados', async () => {
    const { emails } = (await data(fakeEmailTool, { count: 200, seed: 'e' })) as { emails: string[] };
    for (const e of emails) {
      expect(validateEmail(e).valid, e).toBe(true);
      expect(e).toMatch(/@(exemplo\.test|exemplo\.example|teste\.invalid)$/);
      expect([...e].every((ch) => ch.charCodeAt(0) <= 0x7f)).toBe(true);
    }
    expect(generateEmail(createRng('a'), 'José da Conceição')).toMatch(/^(jose|j)/);
  });

  it('usernames respeitam tamanho máximo, estilo e número', () => {
    const rng = createRng('u');
    for (let i = 0; i < 200; i++) {
      const u = generateUsername(rng, 'snake', true, 12);
      expect(u.length).toBeLessThanOrEqual(12);
      expect(u).toMatch(/^[a-z_]+\d+$/);
      expect(generateUsername(rng, 'dot', false, 20)).toMatch(/^[a-z]+\.[a-z]+$/);
      expect(generateUsername(rng, 'camel', false, 30)).toMatch(/^[a-z]+[A-Z][a-z]+$/);
    }
  });

  it('frases terminam em ponto e começam com maiúscula; nicks respeitam o estilo', async () => {
    const rng = createRng('f');
    for (let i = 0; i < 100; i++) {
      const s = generateSentence(rng);
      expect(s).toMatch(/^[A-ZÁÉÍÓÚ].*\.$/);
    }
    const nicks = ((await data(gameNickTool, { count: 50, style: 'xx', seed: 'n' })).nicks as string[]);
    for (const n of nicks) expect(n).toMatch(/^xX_[A-Za-z]+_Xx$/);
    for (const n of (await data(gameNickTool, { count: 50, style: 'underscore', seed: 'n' })).nicks as string[]) expect(n).toMatch(/^[A-Z][a-z]+_[A-Z][a-z]+\d*$/);
    expect(((await data(randomSentenceTool, { count: 4, seed: 's' })).sentences as string[])).toHaveLength(4);
    expect(((await data(companyNameTool, { count: 6, seed: 's' })).names as string[])).toHaveLength(6);
    await fails(randomNameTool, { count: 0 });
    await fails(randomNameTool, { count: 201 });
  });
});

describe('endereço, CEP e pessoa', () => {
  it('CEP cai na faixa do estado e tem formato válido', () => {
    const rng = createRng('cep');
    for (const uf of Object.keys(CEP_RANGES)) {
      for (let i = 0; i < 20; i++) {
        const cep = generateCep(rng, uf);
        expect(validateCEP(cep).valid, cep).toBe(true);
        const prefix = Number(cep.slice(0, 5));
        expect(CEP_RANGES[uf]!.some(([lo, hi]) => prefix >= lo && prefix <= hi), `${uf} ${cep}`).toBe(true);
      }
    }
    expect(() => generateCep(rng, 'XX')).toThrow('UF');
  });

  it('endereço usa cidade e UF coerentes, e a ferramenta avisa que é de demonstração', async () => {
    const rng = createRng('addr');
    for (let i = 0; i < 100; i++) {
      const a = generateAddress(rng, 'RS');
      expect(a.uf).toBe('RS');
      expect(a.city).toBe('Porto Alegre');
    }
    const r = await data(fakeAddressTool, { count: 3, uf: 'SP', seed: 'x' });
    expect((r.addresses as string[]).every((l) => l.includes('/SP —'))).toBe(true);
    expect(String(r.note)).toContain('demonstração');
    await fails(fakeAddressTool, { count: 1, uf: 'XX' });
  });

  it('pessoa fictícia: CPF válido, telefone válido, e-mail válido e idade coerente', () => {
    const rng = createRng('p');
    const reference = { year: 2026, month: 6, day: 15 };
    for (let i = 0; i < 200; i++) {
      const p = generatePerson(rng, { sex: 'any', minAge: 18, maxAge: 65, referenceDate: reference });
      expect(validateCPF(p.cpf).valid).toBe(true);
      expect(validatePhoneBR(p.telefone).valid).toBe(true);
      expect(validateEmail(p.email).valid).toBe(true);
      expect(validateCEP(p.cep).valid).toBe(true);
      expect(p.rg).toMatch(/^\d{2}\.\d{3}\.\d{3}-[\dX]$/);
      const [d, m, y] = p.nascimento.split('/').map(Number) as [number, number, number];
      expect(new Date(Date.UTC(y, m - 1, d)).getUTCDate()).toBe(d); // data real
      const age = reference.year - y - (m < reference.month || (m === reference.month && d <= reference.day) ? 0 : 1);
      expect(p.idade).toBe(age);
      expect(p.idade).toBeGreaterThanOrEqual(17);
      expect(p.idade).toBeLessThanOrEqual(66);
    }
  });

  it('pessoa: ferramenta, filtros e erros', async () => {
    const r = await data(fakePersonTool, { count: 2, sex: 'female', uf: 'MG', seed: 'q', referenceDate: '2026-01-01' });
    const list = JSON.parse(r.json as string) as { sexo: string; uf: string }[];
    expect(list).toHaveLength(2);
    expect(list.every((p) => p.sexo === 'Feminino' && p.uf === 'MG')).toBe(true);
    expect(String(r.note)).toContain('sintéticos');
    expect(r.json).toEqual((await data(fakePersonTool, { count: 2, sex: 'female', uf: 'MG', seed: 'q', referenceDate: '2026-01-01' })).json);
    await fails(fakePersonTool, { minAge: 50, maxAge: 20 }, 'idade máxima');
  });

  it('RG: dígito verificador no modelo de São Paulo', () => {
    expect(rgCheckDigit('12345678')).toBe('2'); // soma 240, resto 9, 11 - 9 = 2
    expect(rgCheckDigit('00000000')).toBe('0'); // resto 0, dígito 11 vira 0
    for (let i = 0; i < 200; i++) expect(generateRg(createRng(String(i)))).toMatch(/^\d{2}\.\d{3}\.\d{3}-[\dX]$/);
  });
});

describe('inscrição estadual', () => {
  it('vetores publicados validam', () => {
    for (const [uf, ie] of [['SP', '110.042.490.114'], ['SP', '110042490114'], ['RJ', '99.999.99-3'], ['MG', '062.307.904/0081'], ['PR', '123.45678-50'], ['SC', '251.040.852']] as const) {
      expect(validateIe(uf, ie).valid, `${uf} ${ie}`).toBe(true);
    }
    expect(validateIe('SP', '110042490114').formatted).toBe('110.042.490.114');
  });

  it('dígito alterado, tamanho errado e estado não suportado', () => {
    expect(validateIe('SP', '110042490115').valid).toBe(false);
    expect(validateIe('SP', '110042491114').valid).toBe(false);
    expect(validateIe('RJ', '99999994').message).toContain('Dígito');
    expect(validateIe('SC', '12345').message).toContain('9 dígitos');
    expect(validateIe('SP', 'abc').message).toContain('números');
    expect(validateIe('AM', '123').message).toContain('Disponíveis');
  });

  it('toda IE gerada valida e tem o tamanho do estado', () => {
    for (const uf of Object.keys(IE_STATES)) {
      for (let i = 0; i < 300; i++) {
        const digits = generateIe(createRng(`${uf}${i}`), uf);
        expect(digits).toHaveLength(IE_STATES[uf]!.length);
        expect(validateIe(uf, digits).valid, `${uf} ${digits}`).toBe(true);
        // Mudar qualquer dígito invalida.
        const swapped = digits.slice(0, -1) + String((Number(digits.at(-1)) + 1) % 10);
        expect(validateIe(uf, swapped).valid).toBe(false);
      }
    }
    expect(() => generateIe(createRng(), 'AM')).toThrow('algoritmo');
  });

  it('ferramenta', async () => {
    expect(await data(stateRegistrationTool, { action: 'validate', uf: 'PR', value: '1234567850' })).toMatchObject({ valid: true, ie: '123.45678-50' });
    expect((await data(stateRegistrationTool, { action: 'generate', uf: 'MG' })).valid).toBe(true);
    await fails(stateRegistrationTool, { action: 'validate', uf: 'SP' }, 'Informe');
    await fails(stateRegistrationTool, { action: 'generate', uf: 'AM' });
  });
});

describe('placa, CNS e números', () => {
  it('placas geradas passam no validador nos dois padrões', async () => {
    for (const kind of ['mercosul', 'old'] as const) {
      for (let i = 0; i < 200; i++) expect(validatePlate(generatePlate(createRng(`${kind}${i}`), kind)).valid).toBe(true);
    }
    expect(((await data(plateGeneratorTool, { count: 5, kind: 'old', seed: 'p' })).plates as string[]).every((p) => /^[A-Z]{3}-\d{4}$/.test(p))).toBe(true);
  });

  it('CNS gerados (definitivo e provisório) validam', async () => {
    for (let i = 0; i < 500; i++) {
      expect(validateCNS(generateCns(createRng(`d${i}`), 'definitive')).details?.type).toBe('definitivo');
      expect(validateCNS(generateCns(createRng(`p${i}`), 'provisional')).details?.type).toBe('provisório');
    }
    const r = await data(cnsGeneratorTool, { count: 3, kind: 'provisional', seed: 'c' });
    expect((r.numbers as string[]).every((n) => /^[789]\d{2} \d{4} \d{4} \d{4}$/.test(n))).toBe(true);
  });

  it('números aleatórios: faixa, unicidade, ordem, decimais e erros', async () => {
    const r = await data(randomNumberTool, { min: 1, max: 60, count: 6, unique: true, sorted: true, decimals: 0, seed: 'n' });
    const nums = (r.numbers as string[]).map(Number);
    expect(nums).toHaveLength(6);
    expect(new Set(nums).size).toBe(6);
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
    expect(nums.every((n) => n >= 1 && n <= 60)).toBe(true);
    expect(r.sum).toBe(nums.reduce((a, b) => a + b, 0));
    const all = (await data(randomNumberTool, { min: 1, max: 10, count: 10, unique: true, sorted: true, decimals: 0 })).numbers;
    expect(all).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    const dec = (await data(randomNumberTool, { min: 0, max: 1, count: 50, unique: false, sorted: false, decimals: 2 })).numbers as string[];
    expect(dec.every((x) => /^[01]\.\d{2}$/.test(x) && Number(x) <= 1)).toBe(true);
    const neg = (await data(randomNumberTool, { min: -5, max: -1, count: 20, unique: false, decimals: 0 })).numbers as string[];
    expect(neg.every((x) => Number(x) >= -5 && Number(x) <= -1)).toBe(true);
    await fails(randomNumberTool, { min: 5, max: 1 }, 'máximo');
    await fails(randomNumberTool, { min: 1, max: 3, count: 4, unique: true }, 'repetir');
    await fails(randomNumberTool, { min: 0.1, max: 0.2, decimals: 0 }, 'possíveis');
  });

  it('números aleatórios: distribuição aproximadamente uniforme', async () => {
    const counts = new Array<number>(6).fill(0);
    const r = (await data(randomNumberTool, { min: 1, max: 6, count: 6000, unique: false, sorted: false, decimals: 0 })).numbers as string[];
    for (const n of r) counts[Number(n) - 1]!++;
    for (const c of counts) expect(Math.abs(c - 1000)).toBeLessThan(150);
  });

  it('sorteador: vencedores únicos, embaralhamento e erros', async () => {
    const items = 'Ana\nBruno\nCarla\nDaniel\nEduarda';
    const w = (await data(raffleTool, { items, mode: 'winners', winners: 3 })).result as string[];
    expect(w).toHaveLength(3);
    const names = w.map((x) => x.replace(/^\d+º: /, ''));
    expect(new Set(names).size).toBe(3);
    expect(names.every((n) => items.split('\n').includes(n))).toBe(true);
    const order = (await data(raffleTool, { items, mode: 'order' })).result as string[];
    expect(order.map((x) => x.replace(/^\d+\. /, '')).sort()).toEqual(items.split('\n').sort());
    expect(((await data(raffleTool, { items: 'A\nA\n\n  A  \nB', mode: 'order' })).total)).toBe(2);
    expect(((await data(raffleTool, { items: 'A\nA\nB', mode: 'order', removeDuplicates: false })).total)).toBe(3);
    await fails(raffleTool, { items: '' }, 'ao menos um');
    await fails(raffleTool, { items: 'A\nB', mode: 'winners', winners: 3 }, 'sortear 3');
  });

  it('sorteador: cada item tem a mesma chance', async () => {
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (let i = 0; i < 2000; i++) {
      const r = (await data(raffleTool, { items: 'A\nB\nC\nD', mode: 'winners', winners: 1 })).result as string[];
      counts[r[0]!.replace(/^\d+º: /, '')]!++;
    }
    for (const c of Object.values(counts)) expect(Math.abs(c - 500)).toBeLessThan(90);
  });
});

describe('QR Code, Wi-Fi e código de barras', () => {
  it('QR Code gera SVG válido, respeita cores e tamanho e o data URL decodifica para o SVG', async () => {
    const r = await data(qrCodeTool, { text: 'https://exemplo.com.br', errorCorrection: 'H', size: 300, margin: 4, dark: '#112233', light: '#ffeedd' });
    const svg = String(r.svg);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('#112233');
    expect(svg).toContain('#ffeedd');
    expect(svg).toContain('width="300"');
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(String(r.dataUrl).replace('data:image/svg+xml;base64,', '')), (c) => c.charCodeAt(0)));
    expect(decoded).toBe(svg);
    expect(svgToDataUrl('<svg/>')).toBe('data:image/svg+xml;base64,PHN2Zy8+');
  });

  it('QR: níveis de correção mudam a densidade, e erros são claros', async () => {
    const low = (await makeQrSvg('x'.repeat(100), { errorCorrection: 'L' })).length;
    const high = (await makeQrSvg('x'.repeat(100), { errorCorrection: 'H' })).length;
    expect(high).toBeGreaterThan(low);
    await fails(qrCodeTool, { text: '' }, 'Informe');
    await fails(qrCodeTool, { text: 'a', dark: 'preto' }, 'hexadecimal');
    await fails(qrCodeTool, { text: 'a'.repeat(2001) });
    await fails(qrCodeTool, { text: 'a', size: 10 });
    const big = await run(qrCodeTool, { text: 'ç'.repeat(1500), errorCorrection: 'H' });
    expect(big.ok).toBe(false);
  });

  it('Wi-Fi: escape, formato e senha', async () => {
    expect(escapeWifi('a;b,c:d"e\\f')).toBe('a\\;b\\,c\\:d\\"e\\\\f');
    expect(wifiPayload('Casa', 'senha123', 'WPA', false)).toBe('WIFI:T:WPA;S:Casa;P:senha123;;');
    expect(wifiPayload('Casa;1', 'p:w', 'WPA', true)).toBe('WIFI:T:WPA;S:Casa\\;1;P:p\\:w;H:true;;');
    expect(wifiPayload('Aberta', '', 'nopass', false)).toBe('WIFI:T:nopass;S:Aberta;;');
    const gen = await data(wifiTool, { ssid: 'Visitantes', generatePassword: true, length: 20, security: 'WPA', hidden: false });
    expect(gen.password).toMatch(/^[abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789]{20}$/);
    expect(String(gen.payload)).toContain(`P:${gen.password}`);
    expect(gen.password).not.toBe((await data(wifiTool, { ssid: 'Visitantes', generatePassword: true, length: 20, security: 'WPA' })).password);
    expect((await data(wifiTool, { ssid: 'X', security: 'nopass' })).password).toBe('(rede aberta)');
    expect((await data(wifiTool, { ssid: 'X', generatePassword: false, password: 'minhasenha1', security: 'WPA' })).payload).toBe('WIFI:T:WPA;S:X;P:minhasenha1;;');
    await fails(wifiTool, { ssid: 'X', generatePassword: false, password: 'curta', security: 'WPA' }, '8 a 63');
    await fails(wifiTool, { ssid: 'X', generatePassword: false, security: 'WEP' }, 'Informe a senha');
    await fails(wifiTool, { ssid: '' });
  });

  it('dígitos verificadores GS1 de produtos conhecidos', () => {
    expect(gs1CheckDigit('400638133393')).toBe(1); // EAN-13 4006381333931
    expect(gs1CheckDigit('03600029145')).toBe(2); // UPC-A 036000291452
    expect(gs1CheckDigit('7351353')).toBe(7); // EAN-8 73513537
    expect(gs1CheckDigit('789123456789')).toBe(5);
    expect(normalizeBarcode('ean13', '400638133393')).toBe('4006381333931');
    expect(normalizeBarcode('ean13', '4006381333931')).toBe('4006381333931');
    expect(normalizeBarcode('upca', '03600029145')).toBe('036000291452');
    expect(normalizeBarcode('ean8', '7351353')).toBe('73513537');
    expect(normalizeBarcode('itf14', '1234567890123')).toHaveLength(14);
    expect(normalizeBarcode('itf', '123')).toBe('0123');
    expect(normalizeBarcode('code39', 'abc-123')).toBe('ABC-123');
  });

  it('códigos de barras: erros por formato', () => {
    expect(() => normalizeBarcode('ean13', '4006381333932')).toThrow('correto seria 1');
    expect(() => normalizeBarcode('ean13', '123')).toThrow('12 dígitos');
    expect(() => normalizeBarcode('ean13', '40063813339a')).toThrow('números');
    expect(() => normalizeBarcode('code39', 'abc_123')).toThrow('Code 39');
    expect(() => normalizeBarcode('code128', 'ação')).toThrow('ASCII');
    expect(() => normalizeBarcode('code128', 'x'.repeat(81))).toThrow('80');
    expect(() => normalizeBarcode('itf', '12ab')).toThrow('números');
    expect(() => normalizeBarcode('ean8', '')).toThrow('Informe');
  });

  it('códigos de barras: SVG gerado para todos os formatos', async () => {
    for (const [format, text] of [['code128', 'PEDIDO-123'], ['ean13', '789123456789'], ['ean8', '7351353'], ['upca', '03600029145'], ['code39', 'ABC-123'], ['itf', '123456'], ['itf14', '1234567890123']] as const) {
      const r = await data(barcodeTool, { format, text });
      expect(String(r.svg), format).toContain('<svg');
      expect(String(r.svg).length, format).toBeGreaterThan(200);
    }
    const noText = await makeBarcodeSvg('code128', 'ABC', { showText: false });
    const withText = await makeBarcodeSvg('code128', 'ABC', { showText: true });
    expect(withText.length).toBeGreaterThan(noText.length);
    await fails(barcodeTool, { format: 'ean13', text: '4006381333932' }, 'verificador');
  });

  it('link do WhatsApp: normaliza o número e codifica a mensagem', async () => {
    expect(whatsappNumber('(11) 91234-5678')).toBe('5511912345678');
    expect(whatsappNumber('+55 11 91234-5678')).toBe('5511912345678');
    expect(whatsappNumber('+351 912 345 678')).toBe('351912345678');
    expect(() => whatsappNumber('123')).toThrow('inválido');
    expect(() => whatsappNumber('+12')).toThrow('internacional');
    expect((await data(whatsappLinkTool, { phone: '(11) 91234-5678' })).link).toBe('https://wa.me/5511912345678');
    expect((await data(whatsappLinkTool, { phone: '11912345678', message: 'Olá & tudo bem?' })).link).toBe('https://wa.me/5511912345678?text=Ol%C3%A1%20%26%20tudo%20bem%3F');
    await fails(whatsappLinkTool, { phone: '' });
  });

  it('gerador de links: UTM, mailto, tel e sms', async () => {
    expect(buildUtmUrl('https://exemplo.com.br/oferta?x=1', { source: 'news', medium: 'email', campaign: 'verao', term: undefined })).toBe('https://exemplo.com.br/oferta?x=1&utm_source=news&utm_medium=email&utm_campaign=verao');
    expect(buildUtmUrl('https://a.com/?utm_source=old', { source: 'new' })).toBe('https://a.com/?utm_source=new');
    expect(() => buildUtmUrl('exemplo.com', {})).toThrow('inválida');
    expect((await data(linkBuilderTool, { kind: 'mailto', target: 'a@b.com', subject: 'Olá mundo', body: 'Oi\ntudo bem?' })).link).toBe('mailto:a@b.com?subject=Ol%C3%A1%20mundo&body=Oi%0Atudo%20bem%3F');
    expect((await data(linkBuilderTool, { kind: 'mailto', target: 'a@b.com' })).link).toBe('mailto:a@b.com');
    expect((await data(linkBuilderTool, { kind: 'tel', target: '(11) 91234-5678' })).link).toBe('tel:+5511912345678');
    expect((await data(linkBuilderTool, { kind: 'sms', target: '+351912345678', body: 'oi' })).link).toBe('sms:+351912345678?body=oi');
    const html = String((await data(linkBuilderTool, { kind: 'utm', target: 'https://a.com/?q="x"', campaign: 'c' })).html);
    expect(html).not.toContain('"x"');
    await fails(linkBuilderTool, { kind: 'mailto', target: 'sem-arroba' }, 'E-mail inválido');
    await fails(linkBuilderTool, { kind: 'tel', target: '123' }, 'Telefone inválido');
  });
});

describe('Pix (BR Code)', () => {
  it('CRC16/CCITT-FALSE confere com o vetor padrão', () => {
    expect(crc16('123456789')).toBe('29B1');
    expect(crc16('')).toBe('FFFF');
    expect(crc16('A')).toBe('B915');
  });

  it('payload: estrutura, campos e CRC', () => {
    const payload = buildPixPayload({ key: '529.982.247-25', name: 'Maria da Silva', city: 'São Paulo', amount: 25.5, txid: 'PEDIDO123' });
    const { fields, crcOk } = parsePixPayload(payload);
    expect(crcOk).toBe(true);
    expect(fields['00']).toBe('01');
    expect(fields['01']).toBe('11');
    expect(fields['26']).toBe('0014br.gov.bcb.pix011152998224725');
    expect(fields['52']).toBe('0000');
    expect(fields['53']).toBe('986');
    expect(fields['54']).toBe('25.50');
    expect(fields['58']).toBe('BR');
    expect(fields['59']).toBe('MARIA DA SILVA');
    expect(fields['60']).toBe('SAO PAULO');
    expect(fields['62']).toBe('0509PEDIDO123');
    expect(payload.startsWith('000201010211')).toBe(true);
    expect(payload).toMatch(/6304[0-9A-F]{4}$/);
  });

  it('payload: valor livre, uso único, txid padrão, descrição e normalização de chaves', () => {
    const free = parsePixPayload(buildPixPayload({ key: 'Fulano@Exemplo.com', name: 'Loja', city: 'Rio' }));
    expect(free.fields['54']).toBeUndefined();
    expect(free.fields['62']).toBe('0503***');
    expect(free.fields['26']).toContain('fulano@exemplo.com');
    const once = parsePixPayload(buildPixPayload({ key: '+5511912345678', name: 'Loja', city: 'Rio', oneTime: true, description: 'Pedido #1' }));
    expect(once.fields['01']).toBe('12');
    expect(once.fields['26']).toContain('02');
    expect(once.fields['26']).toContain('Pedido #1');
    expect(normalizePixKey('11.222.333/0001-81')).toEqual({ key: '11222333000181', type: 'CNPJ' });
    expect(normalizePixKey('123e4567-e89b-42d3-a456-426614174000').type).toBe('aleatória');
  });

  it('payload: nome longo é cortado e erros são claros', () => {
    expect(parsePixPayload(buildPixPayload({ key: '529.982.247-25', name: 'Nome Muito Mas Muito Longo Mesmo Para Caber', city: 'Cidade Com Nome Gigante', amount: 1 })).fields['59']).toHaveLength(25);
    expect(() => buildPixPayload({ key: '123', name: 'A', city: 'B' })).toThrow('Chave Pix inválida');
    expect(() => buildPixPayload({ key: '529.982.247-25', name: '###', city: 'B' })).toThrow('nome');
    expect(() => buildPixPayload({ key: '529.982.247-25', name: 'A', city: '' })).toThrow('cidade');
    expect(() => buildPixPayload({ key: '529.982.247-25', name: 'A', city: 'B', amount: 0 })).toThrow('maior que zero');
    expect(() => buildPixPayload({ key: '529.982.247-25', name: 'A', city: 'B', description: 'x'.repeat(100) })).toThrow('caracteres demais');
    expect(() => parsePixPayload('0A')).toThrow('malformado');
  });

  it('ferramentas: QR com o payload e demonstrativo claramente sinalizado', async () => {
    const r = await data(pixGeneratorTool, { key: '529.982.247-25', name: 'Maria da Silva', city: 'São Paulo', amount: 25.5 });
    expect(String(r.summary)).toContain('R$ 25,50');
    expect(parsePixPayload(String(r.payload)).crcOk).toBe(true);
    expect(String(r.svg)).toContain('<svg');
    const demo = await data(pixDemoTool, { amount: 10 });
    const parsed = parsePixPayload(String(demo.payload));
    expect(parsed.crcOk).toBe(true);
    expect(parsed.fields['59']).toBe('DEMONSTRACAO');
    expect(parsed.fields['26']).toContain('NAO PAGUE');
    expect(demo.payload).not.toBe((await data(pixDemoTool, { amount: 10 })).payload); // chave nova a cada vez
    await fails(pixGeneratorTool, { key: '', name: 'A', city: 'B' }, 'Chave Pix');
  });
});

describe('cartões, conta e documentos demonstrativos', () => {
  it('cartões gerados têm Luhn válido, bandeira e tamanho coerentes', () => {
    const rng = createRng('cartao');
    for (const brand of ['visa', 'mastercard', 'amex', 'diners', 'discover', 'jcb'] as const) {
      for (let i = 0; i < 100; i++) {
        const n = generateCardNumber(rng, brand);
        expect(luhnValid(n), `${brand} ${n}`).toBe(true);
        const v = validateCard(n);
        expect(v.valid, `${brand} ${n} ${v.message}`).toBe(true);
      }
    }
    expect(validateCard(generateCardNumber(rng, 'visa')).details?.brand).toBe('Visa');
    expect(validateCard(generateCardNumber(rng, 'amex')).details?.brand).toBe('American Express');
    expect(withLuhn('411111111111111')).toBe('4111111111111111');
    expect(formatCard('378282246310005')).toBe('3782 822463 10005');
    expect(formatCard('4111111111111111')).toBe('4111 1111 1111 1111');
  });

  it('ferramenta de cartão demonstrativo: validade futura, CVV e aviso', async () => {
    const r = await data(demoCardTool, { count: 20, brand: 'amex', seed: 'k', referenceDate: '2026-01-01' });
    for (const line of r.cards as string[]) {
      expect(line).toMatch(/^American Express · \d{4} \d{6} \d{5} · validade \d{2}\/\d{2} · CVV \d{4} · [A-ZÁÉÍÓÚÂÊÔÃÕÇ ]+$/);
      const year = Number(/validade \d{2}\/(\d{2})/.exec(line)![1]);
      expect(year).toBeGreaterThanOrEqual(27);
    }
    expect(String(r.note)).toContain('não foi emitido');
    await fails(demoCardTool, { count: 51 });
  });

  it('cartões de teste de gateways: números consistentes com a documentação', async () => {
    const digits = (n: string) => n.replace(/\s/g, '');
    const invalidOnPurpose = new Set(['4242424242424241']); // incorrect_number
    for (const c of GATEWAY_CARDS) {
      if (!invalidOnPurpose.has(digits(c.number))) expect(luhnValid(digits(c.number)), `${c.gateway} ${c.number}`).toBe(true);
      expect(c.scenario.length).toBeGreaterThan(5);
    }
    expect(luhnValid('4242424242424241')).toBe(false);
    expect(GATEWAY_CARDS.some((c) => digits(c.number) === '4242424242424242')).toBe(true);
    const mp = await data(testCardsTool, { gateway: 'mercadopago' });
    expect((mp.cards as string[]).join('\n')).toContain('APRO');
    expect(String(mp.sources)).toContain('mercadopago.com.br');
    const stripe = await data(testCardsTool, { gateway: 'stripe', search: '3d secure' });
    expect((stripe.cards as string[]).length).toBeGreaterThanOrEqual(3);
    expect((stripe.cards as string[]).join('').includes('APRO')).toBe(false);
    await fails(testCardsTool, { gateway: 'all', search: 'inexistente-xyz' }, 'Nenhum');
  });

  it('conta fictícia: DV genérico determinístico e aviso', async () => {
    expect(genericDv('1234')).toBe(genericDv('1234'));
    const r = await data(fakeBankAccountTool, { count: 5, accountType: 'savings', seed: 'c' });
    expect((r.accounts as string[]).every((l) => /^\d{3} - .+ · Agência \d{4}-\d · Conta poupança \d{5,8}-\d$/.test(l))).toBe(true);
    expect(String(r.note)).toContain('genérico');
  });

  it('fator de vencimento: marcos conhecidos', () => {
    expect(dueFactor({ year: 2000, month: 7, day: 3 })).toBe(1000);
    expect(dueFactor({ year: 2025, month: 2, day: 21 })).toBe(9999);
    expect(dueFactor({ year: 2025, month: 2, day: 22 })).toBe(1000);
    expect(dueFactor({ year: 2025, month: 2, day: 23 })).toBe(1001);
    expect(dueFactor({ year: 2026, month: 3, day: 15 })).toBe(1000 + ((Date.UTC(2026, 2, 15) - Date.UTC(1997, 9, 7)) / 86_400_000 - 1000) % 9000);
  });

  it('boleto: módulos 10 e 11 e um exemplo real da documentação do Banco do Brasil', () => {
    expect(mod10('001905009')).toBe(5);
    expect(mod10('4014481606')).toBe(9);
    expect(mod10('0680935031')).toBe(4);
    const real = checkBoletoLine('00190.50095 40144.816069 06809.350314 3 37370000000100');
    expect(real.valid).toBe(true);
    expect(real.barcode).toBe('00193373700000001000500940144816060680935031');
    expect(boletoGeneralDv('0019' + '37370000000100' + '0500940144816060680935031')).toBe(3);
  });

  it('boleto gerado: linha e código de barras são consistentes e à prova de adulteração', () => {
    const rng = createRng('boleto');
    for (let i = 0; i < 200; i++) {
      const { barcode, line } = buildBoleto({ bank: '000', currency: '9', factor: 1000 + rng.int(9000), amountCents: rng.int(10_000_000), freeField: rng.digits(25) });
      expect(barcode).toHaveLength(44);
      const check = checkBoletoLine(line);
      expect(check.valid).toBe(true);
      expect(check.barcode).toBe(barcode);
      const pos = rng.pick([0, 1, 2, 3, 4, 6, 7, 8, 12, 14, 20, 40]);
      const digits = line.replace(/\D/g, '').split('');
      digits[pos] = String((Number(digits[pos]) + 1) % 10);
      expect(checkBoletoLine(digits.join('')).valid, `posição ${pos}`).toBe(false);
    }
    expect(checkBoletoLine('123').valid).toBe(false);
  });

  it('ferramenta de boleto: aviso, valor e vencimento codificados', async () => {
    const r = await data(demoBoletoTool, { amount: 150, dueDate: '2026-03-15', beneficiary: 'Empresa Teste', seed: 'b' });
    expect(String(r.document)).toContain('NÃO PAGUE');
    expect(String(r.document)).toContain('Banco 000 inexistente');
    expect(String(r.document)).toContain('R$ 150,00');
    expect(String(r.barcode).slice(0, 3)).toBe('000');
    expect(String(r.barcode).slice(9, 19)).toBe('0000015000');
    expect(Number(String(r.barcode).slice(5, 9))).toBe(r.dueFactor);
    expect(checkBoletoLine(String(r.line)).valid).toBe(true);
    expect(String(r.svg)).toContain('<svg');
    expect(String((await data(demoBoletoTool, { amount: 0, dueDate: '2026-03-15' })).document)).toContain('qualquer valor');
    await fails(demoBoletoTool, { amount: 10, dueDate: '2026-02-30' }, 'inválida');
    await fails(demoBoletoTool, { amount: 10, dueDate: '1999-01-01' }, '2000');
    await fails(demoBoletoTool, { amount: -1, dueDate: '2026-03-15' });
  });

  it('comprovante e holerite demonstrativos', async () => {
    const c = await data(demoReceiptTool, { kind: 'pix', amount: 100, payer: 'Fulano', receiver: 'Beltrano', dateTime: '2026-03-15T14:30', seed: 'c' });
    expect(String(c.document)).toContain('SEM VALOR LEGAL');
    expect(String(c.document)).toContain('2026-03-15 14:30');
    expect(String(c.document)).toContain('Fulano');
    expect(c.authentication).toMatch(/^\d{4}\.\d{4}\.\d{4}\.\d{4}$/);
    expect(c.document).toEqual((await data(demoReceiptTool, { kind: 'pix', amount: 100, payer: 'Fulano', receiver: 'Beltrano', dateTime: '2026-03-15T14:30', seed: 'c' })).document);
    const h = await data(demoPayslipTool, { employee: 'Fulana', company: 'Empresa', month: '2026-01', gross: 3000, dependents: 0, transportVoucher: true, year: 2026 });
    const expected = calcNetSalary({ gross: 3000, dependents: 0, pension: 0, transportDiscount: 180, other: 0, deduction: 'auto', year: 2026 });
    expect(h.net).toBe(expected.net);
    expect(String(h.document)).toContain('HOLERITE DEMONSTRATIVO');
    expect(String(h.document)).toContain('Vale-transporte');
    expect(String(h.document)).toContain('Competência: 01/2026');
    await fails(demoPayslipTool, { month: '2026/01' });
    await fails(demoPayslipTool, { year: 2019 }, 'Competências');
  });
});
