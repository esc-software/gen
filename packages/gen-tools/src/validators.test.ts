import { describe, expect, it } from 'vitest';
import {
  assessPassword,
  calculateRenavamCheckDigit,
  calculateTituloCheckDigits,
  computeCnsDefinitivo,
  emailTool,
  factorize,
  ibanMod97,
  isPrime,
  luhnValid,
  parseIPv4,
  parseIPv6,
  regexTool,
  runRegex,
  validateCEP,
  validateCNS,
  validateCard,
  validateDateText,
  validateEmail,
  validateIban,
  validateIp,
  validatePhoneBR,
  validatePixKey,
  validatePlate,
  validatePrimeInput,
  validateRenavam,
  validateTitulo,
  validateUrl,
  validateXml,
} from './index.js';

const ok = (r: { valid: boolean }) => r.valid;

describe('título de eleitor', () => {
  it('confere com um número publicado e rejeita variações', () => {
    expect(validateTitulo('825169091279')).toMatchObject({ valid: true, details: { uf: 'PB' } });
    expect(validateTitulo('8251 6909 1279').valid).toBe(true);
    expect(ok(validateTitulo('825169091270'))).toBe(false);
    expect(ok(validateTitulo('825169091209'))).toBe(false);
    expect(validateTitulo('825169099979').message).toContain('UF');
    expect(validateTitulo('1234').message).toContain('12');
  });

  it('calcula os dígitos e aplica a exceção de SP e MG', () => {
    expect(calculateTituloCheckDigits('82516909', '12')).toEqual({ first: 7, second: 9 });
    // Com sequência cuja soma dá resto 0, SP/MG usam 1 em vez de 0.
    const seq = '00000000'; // soma 0 -> resto 0
    expect(calculateTituloCheckDigits(seq, '12').first).toBe(0);
    expect(calculateTituloCheckDigits(seq, '01').first).toBe(1);
    expect(calculateTituloCheckDigits(seq, '02').first).toBe(1);
  });

  it('todo número montado pelo algoritmo valida', () => {
    for (let i = 0; i < 300; i++) {
      const seq = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
      const uf = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
      const { first, second } = calculateTituloCheckDigits(seq, uf);
      expect(validateTitulo(`${seq}${uf}${first}${second}`).valid).toBe(true);
    }
  });
});

describe('CNS', () => {
  it('valida provisórios pela soma ponderada múltipla de 11', () => {
    expect(validateCNS('700000000000005')).toMatchObject({ valid: true, details: { type: 'provisório' } });
    expect(validateCNS('700 0000 0000 0005').valid).toBe(true);
    expect(ok(validateCNS('700000000000006'))).toBe(false);
  });

  it('valida definitivos derivados do PIS', () => {
    const pis = '12345678919';
    const cns = computeCnsDefinitivo(pis);
    expect(cns).toHaveLength(15);
    expect(validateCNS(cns)).toMatchObject({ valid: true, details: { type: 'definitivo' } });
    expect(ok(validateCNS(cns.slice(0, 14) + (cns.endsWith('0') ? '1' : '0')))).toBe(false);
    // Todo PIS gera um CNS definitivo válido (inclusive os de sufixo 001).
    let saw001 = false;
    for (let i = 0; i < 2000; i++) {
      const p = '1' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
      const c = computeCnsDefinitivo(p);
      if (c.slice(11, 14) === '001') saw001 = true;
      expect(validateCNS(c).valid, c).toBe(true);
    }
    expect(saw001).toBe(true);
  });

  it('rejeita tamanho e prefixos inválidos', () => {
    expect(validateCNS('123').message).toContain('15');
    expect(validateCNS('300000000000000').message).toContain('começar');
  });
});

describe('RENAVAM', () => {
  it('valida números publicados em bibliotecas de referência', () => {
    for (const v of ['08804737318', '01234567897', '98765432103', '8804737318']) {
      expect(validateRenavam(v).valid, v).toBe(true);
    }
  });

  it('rejeita dígito errado, repetidos e tamanhos incorretos', () => {
    expect(ok(validateRenavam('08804737319'))).toBe(false);
    expect(validateRenavam('00000000000').message).toContain('iguais');
    expect(validateRenavam('123').message).toContain('11');
    expect(validateRenavam('abc').valid).toBe(false);
  });

  it('calcula o dígito verificador', () => {
    expect(calculateRenavamCheckDigit('0880473731')).toBe(8);
    expect(() => calculateRenavamCheckDigit('123')).toThrow(RangeError);
  });
});

describe('placa de veículo', () => {
  it('reconhece os dois padrões e a equivalência', () => {
    expect(validatePlate('abc-1234')).toMatchObject({ valid: true, details: { type: 'padrão antigo', equivalent: 'ABC1C34' } });
    expect(validatePlate('ABC1C34')).toMatchObject({ valid: true, details: { type: 'Mercosul', equivalent: 'ABC-1234' } });
    expect(validatePlate('ABC1D23').details?.equivalent).toBe('ABC-1323');
  });

  it('rejeita formatos errados', () => {
    for (const v of ['AB-12345', 'ABCD123', '1234ABC', '', 'ABC12D3']) expect(validatePlate(v).valid, v).toBe(false);
  });
});

describe('CEP', () => {
  it('formata e valida', () => {
    expect(validateCEP('01310100')).toMatchObject({ valid: true, details: { formatted: '01310-100' } });
    expect(validateCEP('01310-100').valid).toBe(true);
    expect(ok(validateCEP('00000-000'))).toBe(false);
    expect(ok(validateCEP('1234'))).toBe(false);
  });
});

describe('telefone', () => {
  it('celulares e fixos, com e sem +55', () => {
    expect(validatePhoneBR('(11) 91234-5678')).toMatchObject({ valid: true, details: { type: 'celular', e164: '+5511912345678' } });
    expect(validatePhoneBR('+55 21 3456-7890')).toMatchObject({ valid: true, details: { type: 'fixo', formatted: '(21) 3456-7890' } });
    expect(validatePhoneBR('5511912345678').valid).toBe(true);
  });

  it('rejeita DDD inexistente, celular sem 9 e fixo com prefixo errado', () => {
    expect(validatePhoneBR('(10) 91234-5678').message).toContain('DDD');
    expect(validatePhoneBR('(11) 81234-5678').message).toContain('9');
    expect(validatePhoneBR('(11) 9234-5678').valid).toBe(false);
    expect(validatePhoneBR('1234').valid).toBe(false);
  });
});

describe('chave Pix', () => {
  it('identifica cada tipo', () => {
    expect(validatePixKey('529.982.247-25').details?.type).toBe('CPF');
    expect(validatePixKey('11.222.333/0001-81').details?.type).toBe('CNPJ');
    expect(validatePixKey('nome@exemplo.com').details?.type).toBe('e-mail');
    expect(validatePixKey('+5511912345678').details?.type).toBe('telefone');
    expect(validatePixKey('123e4567-e89b-42d3-a456-426614174000').details?.type).toBe('aleatória');
  });

  it('rejeita chaves inválidas com o motivo', () => {
    expect(validatePixKey('52998224726').message).toContain('CPF');
    expect(validatePixKey('11222333000182').message).toContain('CNPJ');
    expect(validatePixKey('+5510912345678').message).toContain('DDD');
  });
});

describe('e-mail', () => {
  it('aceita endereços comuns, com +, subdomínio e IDN', () => {
    for (const v of ['a@b.co', 'maria.silva+loja@exemplo.com.br', "o'brien@exemplo.org", 'x@sub.dominio.com', 'josé@exemplo.com'.replace('josé', 'jose'), 'ana@bücher.de']) {
      expect(validateEmail(v).valid, v).toBe(true);
    }
  });

  it('rejeita problemas específicos com mensagem útil', () => {
    const cases: [string, string][] = [
      ['', 'Informe'], ['sem-arroba.com', '@'], ['@dominio.com', 'antes'], ['a..b@dominio.com', 'pontos seguidos'],
      ['.a@dominio.com', 'começar'], ['a b@dominio.com', 'espaços'], ['a@dominio', 'ponto'], ['a@-dominio.com', 'caracteres'],
      ['a@dominio.c', 'Terminação'], ['a@dominio..com', 'vazia'], ['a(b)@dominio.com', 'não permitidos'],
    ];
    for (const [value, fragment] of cases) {
      const r = validateEmail(value);
      expect(r.valid, value).toBe(false);
      expect(r.message, value).toContain(fragment);
    }
    expect(validateEmail('a'.repeat(65) + '@dominio.com').message).toContain('64');
  });

  it('a ferramenta informa que a sintaxe não garante existência', async () => {
    const r = await emailTool.run({ value: 'a@b.com' });
    expect(r.ok && String((r.data as { message: string }).message)).toContain('não garante');
  });
});

describe('URL', () => {
  it('valida e separa as partes', () => {
    expect(validateUrl('https://www.exemplo.com.br:8080/a/b?x=1#topo')).toMatchObject({
      valid: true,
      details: { protocol: 'https', host: 'www.exemplo.com.br', port: '8080', path: '/a/b', query: '?x=1', fragment: '#topo' },
    });
    expect(validateUrl('http://localhost:3000').valid).toBe(true);
    expect(validateUrl('http://192.168.0.1/x').valid).toBe(true);
  });

  it('rejeita sem protocolo, esquemas perigosos e hosts sem domínio', () => {
    expect(validateUrl('exemplo.com').message).toContain('protocolo');
    expect(validateUrl('javascript://x').valid).toBe(false);
    expect(validateUrl('data://text/html,x').valid).toBe(false);
    expect(validateUrl('https://semdominio').valid).toBe(false);
    expect(validateUrl('https://').valid).toBe(false);
    expect(validateUrl('').valid).toBe(false);
  });
});

describe('IP', () => {
  it('IPv4: valida, classifica e rejeita octetos inválidos e zeros à esquerda', () => {
    expect(parseIPv4('192.168.0.1')).toEqual([192, 168, 0, 1]);
    expect(parseIPv4('256.1.1.1')).toBeNull();
    expect(parseIPv4('01.2.3.4')).toBeNull();
    expect(parseIPv4('1.2.3')).toBeNull();
    expect(validateIp('10.0.0.1').details?.kind).toContain('privado');
    expect(validateIp('127.0.0.1').details?.kind).toBe('loopback');
    expect(validateIp('8.8.8.8').details?.kind).toBe('público');
    expect(validateIp('169.254.1.1').details?.kind).toBe('link-local');
    expect(validateIp('100.64.0.1').details?.kind).toContain('CGNAT');
    expect(validateIp('172.32.0.1').details?.kind).toBe('público');
    expect(validateIp('172.16.0.1').details?.kind).toContain('privado');
  });

  it('IPv6: formas completa, abreviada e com IPv4 embutido', () => {
    expect(parseIPv6('2001:db8:0:0:0:0:0:1')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('2001:db8::1')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('::ffff:192.168.0.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0xc0a8, 1]);
    expect(parseIPv6('fe80::1')?.[0]).toBe(0xfe80);
    for (const bad of ['1::2::3', '12345::1', 'g::1', '1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8:9', 'fe80::1%eth0', ':::', '1:2:3:4:5:6:7:8::']) {
      expect(parseIPv6(bad), bad).toBeNull();
    }
    expect(validateIp('::1').details?.kind).toContain('loopback');
    expect(validateIp('fe80::1').details?.kind).toContain('link-local');
    expect(validateIp('fd00::1').details?.kind).toContain('local único');
    expect(validateIp('ff02::1').details?.kind).toContain('multicast');
  });

  it('rejeita lixo', () => {
    for (const v of ['', 'abc', '1.2.3.4.5', '1.2.3.256']) expect(validateIp(v).valid, v).toBe(false);
  });
});

describe('cartão de crédito', () => {
  it('Luhn em números de teste conhecidos', () => {
    for (const n of ['4111111111111111', '5555555555554444', '378282246310005', '6011111111111117', '3530111333300000', '30569309025904']) {
      expect(luhnValid(n), n).toBe(true);
    }
    expect(luhnValid('4111111111111112')).toBe(false);
  });

  it('identifica a bandeira e mascara o número', () => {
    expect(validateCard('4111 1111 1111 1111')).toMatchObject({ valid: true, details: { brand: 'Visa', masked: '411111******1111' } });
    expect(validateCard('5555-5555-5555-4444').details?.brand).toBe('Mastercard');
    expect(validateCard('378282246310005').details?.brand).toBe('American Express');
    expect(validateCard('6011111111111117').details?.brand).toBe('Discover');
    expect(validateCard('3530111333300000').details?.brand).toBe('JCB');
    expect(validateCard('2223003122003222').details?.brand).toBe('Mastercard');
  });

  it('rejeita Luhn incorreto, letras e tamanhos', () => {
    expect(validateCard('4111 1111 1111 1112').message).toContain('Luhn');
    expect(validateCard('4111-abcd').valid).toBe(false);
    expect(validateCard('4111').message).toContain('12 a 19');
    expect(validateCard('').valid).toBe(false);
  });
});

describe('IBAN', () => {
  it('valida exemplos conhecidos com ou sem espaços e em minúsculas', () => {
    for (const v of ['GB82 WEST 1234 5698 7654 32', 'DE89 3704 0044 0532 0130 00', 'FR14 2004 1010 0505 0001 3M02 606', 'PT50 0002 0123 1234 5678 9015 4', 'BR1800360305000010009795493C1', 'gb82west12345698765432']) {
      expect(validateIban(v).valid, v).toBe(true);
    }
  });

  it('rejeita dígito alterado, tamanho errado e formato inválido', () => {
    expect(validateIban('GB82 WEST 1234 5698 7654 33').message).toContain('controle');
    expect(validateIban('GB82 WEST 1234 5698 7654 3').message).toContain('Tamanho');
    expect(validateIban('1234').valid).toBe(false);
    expect(validateIban('').valid).toBe(false);
  });

  it('país fora da tabela só confere o dígito de controle', () => {
    // Constrói um IBAN "ZZ" válido para mod 97.
    const body = 'ZZ00ABCDEFGHIJKL';
    const check = String(98 - ibanMod97(body)).padStart(2, '0');
    const iban = `ZZ${check}ABCDEFGHIJKL`;
    expect(validateIban(iban)).toMatchObject({ valid: true });
    expect(validateIban(iban).message).toContain('não foi verificado');
  });
});

describe('XML', () => {
  it('aceita documento bem formado', () => {
    expect(validateXml('<?xml version="1.0"?><a><b id="1">ok</b><c/></a>').valid).toBe(true);
  });

  it('rejeita com linha e coluna', () => {
    const r = validateXml('<a>\n  <b>\n</a>');
    expect(r.valid).toBe(false);
    expect(r.message).toMatch(/linha \d+, coluna \d+/);
    expect(r.details?.line).toBeGreaterThan(0);
    expect(validateXml('<a>').valid).toBe(false);
    expect(validateXml('<a b=1/>').valid).toBe(false);
    expect(validateXml('').valid).toBe(false);
  });
});

describe('data', () => {
  it('valida com bissextos e dá o dia da semana', () => {
    expect(validateDateText('29/02/2024')).toMatchObject({ valid: true, details: { iso: '2024-02-29', weekday: 'quinta-feira', dayOfYear: 60, leapYear: true } });
    expect(validateDateText('2000-02-29').valid).toBe(true);
    expect(validateDateText('1/1/2025').details?.iso).toBe('2025-01-01');
    expect(validateDateText('31-12-2025').details?.dayOfYear).toBe(365);
  });

  it('rejeita datas impossíveis com o motivo', () => {
    expect(validateDateText('29/02/2023').message).toContain('28 dias');
    expect(validateDateText('29/02/1900').valid).toBe(false);
    expect(validateDateText('31/04/2024').message).toContain('30 dias');
    expect(validateDateText('10/13/2024').message).toContain('Mês');
    expect(validateDateText('2024-00-10').valid).toBe(false);
    expect(validateDateText('amanhã').valid).toBe(false);
  });
});

describe('números primos', () => {
  it('Miller-Rabin confere com a lista de primos pequenos e rejeita pseudoprimos famosos', () => {
    const primes = [2, 3, 5, 7, 11, 13, 97, 7919, 104729];
    for (const p of primes) expect(isPrime(BigInt(p)), String(p)).toBe(true);
    // Carmichael e pseudoprimos fortes de base 2.
    for (const c of [561n, 1105n, 1729n, 2047n, 3277n, 4033n, 3215031751n]) expect(isPrime(c), String(c)).toBe(false);
    expect(isPrime(0n)).toBe(false);
    expect(isPrime(1n)).toBe(false);
    expect(isPrime(1000000007n)).toBe(true);
    expect(isPrime(2n ** 61n - 1n)).toBe(true); // primo de Mersenne
    expect(isPrime(2n ** 67n - 1n)).toBe(false); // famoso composto de Mersenne
  });

  it('concorda com crivo simples até 5000', () => {
    const sieve = new Array<boolean>(5001).fill(true);
    sieve[0] = sieve[1] = false;
    for (let i = 2; i * i <= 5000; i++) if (sieve[i]) for (let j = i * i; j <= 5000; j += i) sieve[j] = false;
    for (let n = 0; n <= 5000; n++) expect(isPrime(BigInt(n)), String(n)).toBe(sieve[n]);
  });

  it('fatora e descreve', () => {
    expect(factorize(360n)).toEqual([2n, 2n, 2n, 3n, 3n, 5n]);
    expect(validatePrimeInput('360').message).toContain('2^3 × 3^2 × 5');
    expect(validatePrimeInput('97')).toMatchObject({ valid: true, details: { nextPrime: '101' } });
    expect(validatePrimeInput('1').message).toContain('2');
    expect(validatePrimeInput('abc').valid).toBe(false);
    expect(validatePrimeInput('1'.repeat(30)).message).toContain('24');
  });
});

describe('senha forte', () => {
  it('reprova senhas comuns, curtas e previsíveis', () => {
    expect(assessPassword('senha123').score).toBe(0);
    expect(assessPassword('abc').score).toBe(0);
    expect(assessPassword('aaaaaaaaaaaa').problems.join()).toContain('repetidos');
    expect(assessPassword('abcd1234efgh').problems.join()).toContain('sequência');
  });

  it('aprova senhas longas e variadas', () => {
    expect(assessPassword('cavalo-Bateria_8-grampo!').score).toBe(4);
    expect(assessPassword('Xk9#mP2$vL7@qR4!').score).toBeGreaterThanOrEqual(3);
  });

  it('mais longa e variada nunca pontua menos que uma curta de mesmo alfabeto', () => {
    expect(assessPassword('Ab1!Ab1!Ab1!Ab1!zQ').entropy).toBeGreaterThan(assessPassword('Ab1!zQ').entropy);
  });
});

describe('regex', () => {
  it('encontra correspondências e grupos', () => {
    const r = runRegex('(\\d{3})-(\\d{4})', 'g', 'ligue 555-1234 ou 555-9876');
    expect(r).toMatchObject({ valid: true, total: 2 });
    expect(r.matches[0]).toMatchObject({ index: 6, text: '555-1234', groups: ['555', '1234'] });
  });

  it('acrescenta g quando falta e respeita i', () => {
    expect(runRegex('a', 'i', 'aAa').total).toBe(3);
  });

  it('erros: padrão inválido, flags inválidas e backtracking catastrófico', () => {
    expect(runRegex('(abc', 'g', 'x').message).toContain('inválida');
    expect(runRegex('a', 'gg', 'x').message).toContain('Flags');
    expect(runRegex('a', 'z', 'x').message).toContain('Flags');
    expect(runRegex('(a+)+$', 'g', 'aaaaaaaaaaaaaaaaaaaaaaaa!').message).toContain('catastrófico');
    expect(runRegex('(.*)*x', 'g', 'x').valid).toBe(false);
  });

  it('limita as correspondências exibidas, mas conta todas', () => {
    const r = runRegex('a', 'g', 'a'.repeat(900));
    expect(r.total).toBe(900);
    expect(r.matches).toHaveLength(500);
  });

  it('correspondências vazias não travam', () => {
    expect(runRegex('x*', 'g', 'abc').total).toBe(4);
  });

  it('ferramenta: padrão vazio e saída formatada', async () => {
    const empty = await regexTool.run({ pattern: '', text: 'x' });
    expect(empty.ok && (empty.data as { valid: boolean }).valid).toBe(false);
    const res = await regexTool.run({ pattern: '(a)(b)?', text: 'a' });
    expect(res.ok && (res.data as { matches: string[] }).matches[0]).toContain('2="(não participou)"');
  });
});
