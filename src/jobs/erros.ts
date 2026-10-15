/** Erro que não adianta tentar de novo (ex.: payload inválido). Vai direto para FALHOU. */
export class ErroPermanente extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroPermanente";
  }
}

/** O handler passou do timeoutMs do seu tipo. */
export class ErroTimeout extends Error {
  constructor(timeoutMs: number) {
    super(`Tempo esgotado após ${Math.round(timeoutMs / 1000)} s`);
    this.name = "ErroTimeout";
  }
}
