import { z } from 'zod';
import { ToolError, defineTool } from '@esc/gen-core';
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

const MAX_CHARS = 2_000_000;
const NAME = /^[A-Za-z_][\w.-]*$/;
const ATTRIBUTE_PREFIX = '@_';
const TEXT_KEY = '#text';

/** Nomes de elementos e atributos precisam ser válidos em XML; o prefixo "@_" marca atributos. */
function assertXmlNames(value: unknown, path = 'raiz', depth = 0): void {
  if (depth > 200) throw new ToolError('O JSON tem aninhamento profundo demais');
  if (Array.isArray(value)) {
    for (const item of value) assertXmlNames(item, path, depth + 1);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    const name = key.startsWith(ATTRIBUTE_PREFIX) ? key.slice(ATTRIBUTE_PREFIX.length) : key;
    if (key !== TEXT_KEY && !NAME.test(name)) throw new ToolError(`A chave "${key.slice(0, 40)}" (em ${path}) não é um nome válido de elemento XML`);
    assertXmlNames(inner, `${path}.${key}`, depth + 1);
  }
}

export function jsonToXml(json: string, rootName: string, pretty: boolean): string {
  if (!NAME.test(rootName)) throw new ToolError('O nome do elemento raiz é inválido (use letras, números, "_", "-" ou ".", começando por letra ou "_")');
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ToolError('O texto não é um JSON válido');
  }
  assertXmlNames(data);
  // Um JSON que é só um valor simples ou uma lista vira o conteúdo do elemento raiz.
  const wrapped = Array.isArray(data) ? { [rootName]: { item: data } } : typeof data === 'object' && data !== null ? { [rootName]: data } : { [rootName]: data };
  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: ATTRIBUTE_PREFIX, textNodeName: TEXT_KEY, format: pretty, indentBy: '  ', suppressEmptyNode: true });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${String(builder.build(wrapped)).trim()}`;
}

export function xmlToJson(xml: string, pretty: boolean): string {
  // Declarações DOCTYPE e ENTITY permitem ataques de expansão de entidades: nunca são aceitas.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new ToolError('Declarações DOCTYPE e ENTITY não são aceitas, por segurança');
  const check = XMLValidator.validate(xml);
  if (check !== true) throw new ToolError(`XML inválido (linha ${check.err.line}, coluna ${check.err.col}): ${check.err.msg}`);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: ATTRIBUTE_PREFIX, textNodeName: TEXT_KEY, parseTagValue: false, parseAttributeValue: false, processEntities: true, ignoreDeclaration: true });
  return JSON.stringify(parser.parse(xml), null, pretty ? 2 : 0);
}

export const xmlJsonTool = defineTool({
  id: 'json-xml',
  name: 'Conversor de JSON para XML e XML para JSON',
  description: 'Converte JSON em XML e XML em JSON, com indentação opcional e validação com linha e coluna do erro',
  category: 'conversores',
  keywords: ['json para xml', 'xml para json', 'json to xml', 'xml to json', 'converter', 'xml', 'json', 'atributos', 'formatar xml'],
  icon: '🔁',
  modes: ['browser', 'node'],
  live: true,
  inputSchema: z.object({
    text: z.string().max(MAX_CHARS).default(''),
    direction: z.enum(['json-to-xml', 'xml-to-json']).default('json-to-xml'),
    rootName: z.string().max(60).default('root'),
    pretty: z.boolean().default(true),
  }),
  outputSchema: z.object({ result: z.string() }),
  execute: ({ text, direction, rootName, pretty }) => {
    if (text.trim() === '') throw new ToolError('Cole o JSON ou o XML');
    return { result: direction === 'json-to-xml' ? jsonToXml(text, rootName, pretty) : xmlToJson(text, pretty) };
  },
  fields: {
    text: { label: 'Texto', multiline: true, placeholder: '{"nome": "Ana", "idade": 30}' },
    direction: { label: 'Conversão', optionLabels: { 'json-to-xml': 'JSON para XML', 'xml-to-json': 'XML para JSON' } },
    rootName: { label: 'Elemento raiz (JSON para XML)', help: 'Nome do elemento que envolve o JSON.' },
    pretty: { label: 'Indentar o resultado' },
  },
  outputLabels: { result: 'Resultado' },
  examples: [
    {
      description: 'JSON para XML',
      input: { text: '{"nome":"Ana","idade":30}', direction: 'json-to-xml', rootName: 'pessoa', pretty: false },
      output: { result: '<?xml version="1.0" encoding="UTF-8"?>\n<pessoa><nome>Ana</nome><idade>30</idade></pessoa>' },
    },
  ],
  documentation:
    'Chaves do JSON viram elementos; listas viram elementos repetidos; chaves que começam com "@_" viram atributos e "#text" é o texto do elemento. No sentido contrário, atributos aparecem com o prefixo "@_" e todos os valores ficam como texto (o XML não distingue números de texto). Nomes que não são válidos em XML são recusados. Por segurança, XML com DOCTYPE ou ENTITY não é aceito. Tudo roda no seu dispositivo.',
});
