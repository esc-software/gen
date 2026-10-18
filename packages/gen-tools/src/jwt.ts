import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { hmac } from '@noble/hashes/hmac';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2';

const HASHES = { HS256: sha256, HS384: sha384, HS512: sha512 } as const;
export type JwtAlgorithm = keyof typeof HASHES;
const MIN_SECRET_BYTES: Record<JwtAlgorithm, number> = { HS256: 32, HS384: 48, HS512: 64 };

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new ToolError('O token tem caracteres que não são Base64URL');
  if (text.length % 4 === 1) throw new ToolError('Uma das partes do token tem tamanho inválido');
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

const encodeJson = (value: unknown) => base64UrlEncode(encoder.encode(JSON.stringify(value)));

function parseObject(text: string, what: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ToolError(`${what} não é um JSON válido`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new ToolError(`${what} precisa ser um objeto JSON, como {"sub": "123"}`);
  return parsed as Record<string, unknown>;
}

function parseSegment(part: string, what: string): Record<string, unknown> {
  let text: string;
  try {
    text = decoder.decode(base64UrlDecode(part));
  } catch (e) {
    if (e instanceof ToolError) throw e;
    throw new ToolError(`${what} do token não é Base64URL com texto UTF-8 válido`);
  }
  return parseObject(text, `${what} do token`);
}

/** Compara em tempo constante (sem sair no primeiro byte diferente). */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

const sign = (signingInput: string, secret: string, algorithm: JwtAlgorithm) => hmac(HASHES[algorithm], encoder.encode(secret), encoder.encode(signingInput));

export interface SignOptions {
  algorithm: JwtAlgorithm;
  secret: string;
  payload: Record<string, unknown>;
  /** Adiciona "iat" (e "exp", se houver validade). Em segundos desde 1970. */
  issuedAt?: number;
  expiresInMinutes?: number;
}

/** Gera um JWT assinado com HMAC (HS256, HS384 ou HS512). */
export function signJwt({ algorithm, secret, payload, issuedAt, expiresInMinutes }: SignOptions): string {
  if (secret === '') throw new ToolError('Informe o segredo da assinatura');
  const claims: Record<string, unknown> = { ...payload };
  if (issuedAt !== undefined && claims.iat === undefined) claims.iat = issuedAt;
  if (expiresInMinutes !== undefined) {
    const base = typeof claims.iat === 'number' && Number.isFinite(claims.iat) ? claims.iat : undefined;
    if (base === undefined) throw new ToolError('Para definir a validade é preciso saber quando o token foi emitido (iat)');
    claims.exp = base + expiresInMinutes * 60;
  }
  const signingInput = `${encodeJson({ alg: algorithm, typ: 'JWT' })}.${encodeJson(claims)}`;
  return `${signingInput}.${base64UrlEncode(sign(signingInput, secret, algorithm))}`;
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  signingInput: string;
}

/** Lê o cabeçalho e o payload SEM verificar a assinatura. */
export function decodeJwt(token: string): DecodedJwt {
  const parts = token.trim().split('.');
  if (parts.length !== 3) throw new ToolError('O JWT precisa ter 3 partes separadas por ponto: cabeçalho.payload.assinatura');
  const [h, p, s] = parts as [string, string, string];
  return { header: parseSegment(h, 'O cabeçalho'), payload: parseSegment(p, 'O payload'), signature: s, signingInput: `${h}.${p}` };
}

/** Verifica a assinatura HMAC. Recusa "none" e qualquer algoritmo que não seja HS256, HS384 ou HS512. */
export function verifyJwt(token: string, secret: string): { decoded: DecodedJwt; algorithm: JwtAlgorithm; valid: boolean } {
  if (secret === '') throw new ToolError('Informe o segredo para verificar a assinatura');
  const decoded = decodeJwt(token);
  const alg = decoded.header.alg;
  if (typeof alg !== 'string' || !Object.hasOwn(HASHES, alg)) {
    throw new ToolError(`Algoritmo "${String(alg)}" não suportado: esta ferramenta verifica só HS256, HS384 e HS512 (tokens "none" nunca são aceitos)`);
  }
  const algorithm = alg as JwtAlgorithm;
  let given: Uint8Array;
  try {
    given = base64UrlDecode(decoded.signature);
  } catch {
    return { decoded, algorithm, valid: false };
  }
  return { decoded, algorithm, valid: equalBytes(sign(decoded.signingInput, secret, algorithm), given) };
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString().replace('.000Z', 'Z');

/** Datas e situação das claims "iat", "nbf" e "exp" (segundos desde 1970). */
export function describeTimes(payload: Record<string, unknown>, nowSeconds: number) {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const iat = num(payload.iat);
  const nbf = num(payload.nbf);
  const exp = num(payload.exp);
  let status = 'Sem data de validade (exp): o token não expira por conta própria.';
  if (exp !== undefined) status = exp <= nowSeconds ? `Expirado em ${iso(exp)}.` : `Válido até ${iso(exp)}.`;
  if (nbf !== undefined && nbf > nowSeconds) status = `Ainda não é válido: começa em ${iso(nbf)}.`;
  return { issuedAt: iat === undefined ? undefined : iso(iat), notBefore: nbf === undefined ? undefined : iso(nbf), expiresAt: exp === undefined ? undefined : iso(exp), status };
}

const NOTE = 'Tudo é calculado no seu dispositivo. Mesmo assim, use segredos de teste: não cole chaves de produção em ferramentas online.';

export const jwtTool = defineTool({
  id: 'jwt',
  name: 'Gerador e Decodificador de JWT',
  description: 'Gera JWT assinado (HS256, HS384, HS512), decodifica o conteúdo de um token e verifica a assinatura',
  category: 'geradores',
  keywords: ['jwt', 'json web token', 'token', 'decodificar', 'decode', 'hs256', 'assinatura', 'autenticação', 'bearer', 'payload', 'claims'],
  icon: '🔑',
  modes: ['browser', 'node'],
  inputSchema: z.object({
    action: z.enum(['generate', 'decode', 'verify']).default('generate'),
    algorithm: z.enum(['HS256', 'HS384', 'HS512']).default('HS256'),
    payload: z.string().max(20_000).default('{"sub":"1234567890","name":"Maria da Silva"}'),
    secret: z.string().max(10_000).optional(),
    expiresInMinutes: z.number().int().min(1).max(525_600).optional(),
    issuedAt: z.number().int().min(0).max(32_503_680_000).optional(),
    token: z.string().max(100_000).optional(),
  }),
  outputSchema: z.object({
    token: z.string().optional(),
    header: z.string().optional(),
    payload: z.string().optional(),
    algorithm: z.string().optional(),
    signatureValid: z.boolean().optional(),
    issuedAt: z.string().optional(),
    notBefore: z.string().optional(),
    expiresAt: z.string().optional(),
    status: z.string().optional(),
    note: z.string(),
  }),
  execute: ({ action, algorithm, payload, secret, expiresInMinutes, issuedAt, token }) => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const pretty = (o: unknown) => JSON.stringify(o, null, 2);
    if (action === 'generate') {
      const claims = parseObject(payload, 'O payload');
      const issued = issuedAt ?? (expiresInMinutes !== undefined ? nowSeconds : undefined);
      const jwt = signJwt({ algorithm, secret: secret ?? '', payload: claims, issuedAt: issued, expiresInMinutes });
      const decoded = decodeJwt(jwt);
      const short = (secret ?? '').length < MIN_SECRET_BYTES[algorithm];
      return {
        token: jwt,
        header: pretty(decoded.header),
        payload: pretty(decoded.payload),
        algorithm,
        ...describeTimes(decoded.payload, nowSeconds),
        note: `${short ? `O segredo tem menos de ${MIN_SECRET_BYTES[algorithm]} caracteres, o mínimo recomendado para ${algorithm}. ` : ''}${NOTE}`,
      };
    }
    if ((token ?? '').trim() === '') throw new ToolError('Cole o token JWT');
    if (action === 'decode') {
      const decoded = decodeJwt(token as string);
      const alg = decoded.header.alg;
      return {
        header: pretty(decoded.header),
        payload: pretty(decoded.payload),
        algorithm: typeof alg === 'string' ? alg : undefined,
        ...describeTimes(decoded.payload, nowSeconds),
        note: `Decodificar não verifica a assinatura: qualquer pessoa pode ler o conteúdo de um JWT. ${alg === 'none' ? 'Este token usa "alg": "none", ou seja, não tem assinatura. ' : ''}${NOTE}`,
      };
    }
    const result = verifyJwt(token as string, secret ?? '');
    return {
      header: pretty(result.decoded.header),
      payload: pretty(result.decoded.payload),
      algorithm: result.algorithm,
      signatureValid: result.valid,
      ...describeTimes(result.decoded.payload, nowSeconds),
      note: `${result.valid ? 'A assinatura confere com o segredo informado.' : 'A assinatura NÃO confere: o segredo está errado ou o token foi alterado.'} A verificação não aceita "alg": "none". ${NOTE}`,
    };
  },
  fields: {
    action: { label: 'Operação', optionLabels: { generate: 'Gerar um JWT', decode: 'Decodificar (sem verificar)', verify: 'Verificar a assinatura' } },
    algorithm: { label: 'Algoritmo (para gerar)', help: 'HMAC com SHA-256, SHA-384 ou SHA-512. Ao verificar, vale o algoritmo que está no token.' },
    payload: { label: 'Payload (JSON)', multiline: true, help: 'Usado em Gerar. Precisa ser um objeto JSON.' },
    secret: { label: 'Segredo', placeholder: 'um-segredo-longo-de-teste', help: 'Usado em Gerar e Verificar. Prefira pelo menos 32 caracteres para HS256.' },
    expiresInMinutes: { label: 'Validade em minutos (opcional)', help: 'Em Gerar: adiciona "iat" e "exp" ao payload.' },
    issuedAt: { label: 'Emitido em, timestamp Unix (opcional)', help: 'Em Gerar: vale como "iat". Se vazio e houver validade, usa agora.' },
    token: { label: 'Token JWT', multiline: true, placeholder: 'eyJhbGciOiJIUzI1NiIs…', help: 'Usado em Decodificar e Verificar.' },
  },
  outputLabels: {
    token: 'Token',
    header: 'Cabeçalho',
    payload: 'Payload',
    algorithm: 'Algoritmo',
    signatureValid: 'Assinatura válida',
    issuedAt: 'Emitido em (iat)',
    notBefore: 'Válido a partir de (nbf)',
    expiresAt: 'Expira em (exp)',
    status: 'Situação',
    note: 'Importante',
  },
  examples: [
    {
      description: 'Gerar com HS256',
      input: { action: 'generate', algorithm: 'HS256', payload: '{"sub":"1234567890","name":"John Doe","iat":1516239022}', secret: 'your-256-bit-secret' },
      output: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' },
    },
  ],
  documentation:
    'Um JWT (JSON Web Token) tem três partes em Base64URL separadas por ponto: cabeçalho, payload e assinatura. Aqui a assinatura é HMAC (HS256, HS384 ou HS512) com o segredo que você informa. Gerar monta o token; Decodificar mostra o cabeçalho e o payload sem verificar nada (o conteúdo de um JWT não é secreto, só protegido contra alteração); Verificar recalcula a assinatura e compara em tempo constante. Tokens com "alg": "none" nunca são aceitos na verificação, e algoritmos assimétricos (RS256, ES256) não são suportados. As datas "iat", "nbf" e "exp" são segundos desde 1970 (UTC). Tudo roda no seu dispositivo, mas use segredos de teste.',
});
