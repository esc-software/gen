import { ToolError } from '@esc/gen-core';

/**
 * Ferramentas que precisam de dados de fora (IP público, cotações) falam com a API do Gen por um cliente que o SITE
 * registra ao iniciar. As bibliotecas, a CLI e a extensão não têm cliente: elas nunca abrem conexões por conta própria.
 */
export interface RemoteClient {
  /** Busca JSON em um caminho da API (por exemplo, "/v1/ip"). */
  getJson(path: string): Promise<unknown>;
}

let client: RemoteClient | undefined;

export function setRemoteClient(next: RemoteClient | undefined): void {
  client = next;
}

export async function remoteJson(path: string): Promise<unknown> {
  if (!client) throw new ToolError('Esta ferramenta consulta a API do Gen e só funciona no site.');
  try {
    return await client.getJson(path);
  } catch (e) {
    if (e instanceof ToolError) throw e;
    throw new ToolError('Não foi possível consultar a API agora. Verifique a conexão e tente de novo.');
  }
}
