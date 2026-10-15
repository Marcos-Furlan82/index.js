-- CreateEnum
CREATE TYPE "StatusConta" AS ENUM ('ATIVA', 'PAUSADA');

-- CreateEnum
CREATE TYPE "StatusJob" AS ENUM ('PENDENTE', 'EXECUTANDO', 'CONCLUIDO', 'FALHOU', 'CANCELADO');

-- CreateEnum
CREATE TYPE "OrigemMidia" AS ENUM ('UPLOAD', 'GEMINI', 'VEO', 'RENDER');

-- CreateEnum
CREATE TYPE "StatusMidia" AS ENUM ('PENDENTE', 'DISPONIVEL', 'REJEITADA');

-- CreateEnum
CREATE TYPE "AcaoAoAtingirTeto" AS ENUM ('PARAR_GERACAO', 'PRIORIZAR_BARATOS');

-- CreateEnum
CREATE TYPE "TipoGeracao" AS ENUM ('TEXTO', 'IMAGEM', 'VIDEO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sessao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Sessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TentativaLogin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "sucesso" BOOLEAN NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TentativaLogin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaInstagram" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "usuarioInstagram" TEXT,
    "status" "StatusConta" NOT NULL DEFAULT 'ATIVA',
    "tetoMensalBrl" DECIMAL(12,2),
    "fuso" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaInstagram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "contaId" TEXT,
    "payload" JSONB NOT NULL,
    "resultado" JSONB,
    "status" "StatusJob" NOT NULL DEFAULT 'PENDENTE',
    "executarEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "maxTentativas" INTEGER NOT NULL DEFAULT 5,
    "erro" TEXT,
    "chaveIdempotencia" TEXT,
    "lockedAt" TIMESTAMP(3),
    "iniciadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Midia" (
    "id" TEXT NOT NULL,
    "contaId" TEXT,
    "origem" "OrigemMidia" NOT NULL,
    "status" "StatusMidia" NOT NULL DEFAULT 'PENDENTE',
    "chave" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamanhoBytes" BIGINT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "urlPublica" TEXT,
    "largura" INTEGER,
    "altura" INTEGER,
    "duracaoSeg" DECIMAL(10,3),
    "licenca" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadoEm" TIMESTAMP(3),

    CONSTRAINT "Midia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracao" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "tetoMensalBrl" DECIMAL(12,2) NOT NULL DEFAULT 1000,
    "cotacaoUsdBrl" DECIMAL(10,4),
    "cotacaoAtualizadaEm" TIMESTAMP(3),
    "cotacaoFonte" TEXT NOT NULL DEFAULT 'manual',
    "cotacaoAtualizadaPor" TEXT,
    "acaoAoAtingirTeto" "AcaoAoAtingirTeto" NOT NULL DEFAULT 'PARAR_GERACAO',
    "emailNotificacao" TEXT,
    "fuso" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecoModelo" (
    "id" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "usdPorMTokEntrada" DECIMAL(14,6),
    "usdPorMTokSaida" DECIMAL(14,6),
    "usdPorMTokCacheLeitura" DECIMAL(14,6),
    "usdPorMTokCacheEscrita" DECIMAL(14,6),
    "usdPorImagem" DECIMAL(14,6),
    "usdPorSegundoVideo" DECIMAL(14,6),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrecoModelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeracaoIA" (
    "id" TEXT NOT NULL,
    "contaId" TEXT,
    "especialista" TEXT,
    "provedor" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "tipo" "TipoGeracao" NOT NULL,
    "versaoPrompt" TEXT,
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensSaida" INTEGER NOT NULL DEFAULT 0,
    "tokensCacheLeitura" INTEGER NOT NULL DEFAULT 0,
    "tokensCacheEscrita" INTEGER NOT NULL DEFAULT 0,
    "imagens" INTEGER NOT NULL DEFAULT 0,
    "segundosVideo" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "custoUsd" DECIMAL(18,8),
    "custoBrl" DECIMAL(18,8),
    "cotacaoUsada" DECIMAL(10,4),
    "precoPendente" BOOLEAN NOT NULL DEFAULT false,
    "precosAplicados" JSONB,
    "mesReferencia" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeracaoIA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertaOrcamento" (
    "id" TEXT NOT NULL,
    "mesReferencia" TEXT NOT NULL,
    "escopo" TEXT NOT NULL,
    "limiar" INTEGER NOT NULL,
    "percentual" DECIMAL(8,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertaOrcamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Sessao_tokenHash_key" ON "Sessao"("tokenHash");

-- CreateIndex
CREATE INDEX "Sessao_usuarioId_idx" ON "Sessao"("usuarioId");

-- CreateIndex
CREATE INDEX "TentativaLogin_email_criadoEm_idx" ON "TentativaLogin"("email", "criadoEm");

-- CreateIndex
CREATE INDEX "TentativaLogin_ip_criadoEm_idx" ON "TentativaLogin"("ip", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Job_chaveIdempotencia_key" ON "Job"("chaveIdempotencia");

-- CreateIndex
CREATE INDEX "Job_status_executarEm_idx" ON "Job"("status", "executarEm");

-- CreateIndex
CREATE UNIQUE INDEX "Midia_chave_key" ON "Midia"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "PrecoModelo_provedor_modelo_key" ON "PrecoModelo"("provedor", "modelo");

-- CreateIndex
CREATE INDEX "GeracaoIA_mesReferencia_contaId_idx" ON "GeracaoIA"("mesReferencia", "contaId");

-- CreateIndex
CREATE UNIQUE INDEX "AlertaOrcamento_mesReferencia_escopo_limiar_key" ON "AlertaOrcamento"("mesReferencia", "escopo", "limiar");

-- AddForeignKey
ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaInstagram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Midia" ADD CONSTRAINT "Midia_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaInstagram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeracaoIA" ADD CONSTRAINT "GeracaoIA_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaInstagram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
