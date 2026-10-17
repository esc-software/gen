/**
 * Aleatoriedade criptograficamente segura, baseada em `crypto.getRandomValues`
 * (disponível em navegadores e no Node.js >= 20 como global).
 */

/** Inteiro uniforme em [0, max), sem viés de módulo (rejection sampling). */
export function secureRandomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 0xffffffff) {
    throw new RangeError('max deve ser um inteiro entre 1 e 2^32 - 1');
  }
  const limit = 0x100000000 - (0x100000000 % max);
  const buf = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0] as number;
  } while (value >= limit);
  return value % max;
}

/** String de `length` caracteres sorteados do `alphabet`. */
export function secureRandomString(alphabet: string, length: number): string {
  if (alphabet.length === 0) throw new RangeError('alphabet não pode ser vazio');
  if (!Number.isInteger(length) || length < 0) {
    throw new RangeError('length deve ser um inteiro não negativo');
  }
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[secureRandomInt(alphabet.length)];
  return out;
}

/** Embaralha uma cópia do array (Fisher-Yates com aleatoriedade segura). */
export function secureShuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
