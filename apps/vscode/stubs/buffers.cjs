/* global module */
// Substitui o pacote "buffers" (dependência indireta do exceljs, usada só para LER arquivos xlsx).
// O pacote não declara licença, então a extensão não o redistribui. A extensão só GERA planilhas.
module.exports = function Buffers() {
  throw new Error('Leitura de xlsx não é suportada nesta extensão')
}
