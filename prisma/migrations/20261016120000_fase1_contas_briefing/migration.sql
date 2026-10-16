-- CreateEnum
CREATE TYPE "EscolhaIsca" AS ENUM ('TEM', 'SUGESTAO', 'SEM_ISCA');

-- CreateEnum
CREATE TYPE "FormatoIsca" AS ENUM ('CHECKLIST_PDF', 'AULA_VIDEO', 'CUPOM', 'DIAGNOSTICO', 'TESTE_GRATIS', 'AMOSTRA', 'OUTRO');

-- CreateEnum
CREATE TYPE "EntregaIsca" AS ENUM ('LINK_BIO', 'DM', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "StatusFicha" AS ENUM ('RASCUNHO', 'APROVADA', 'SUBSTITUIDA');

-- CreateEnum
CREATE TYPE "OrigemFicha" AS ENUM ('IA', 'EDICAO');

-- CreateEnum
CREATE TYPE "CategoriaReferencia" AS ENUM ('LOGO', 'LOGO_NEGATIVO', 'SIMBOLO', 'LOGO_ARQUIVO_FONTE', 'FONTE', 'ARTE', 'PROVA');

-- CreateEnum
CREATE TYPE "OrigemReferencia" AS ENUM ('PROPRIA', 'TERCEIROS');

-- CreateEnum
CREATE TYPE "FormatoReferencia" AS ENUM ('POST', 'CARROSSEL', 'STORIES', 'CAPA_REELS');

-- CreateEnum
CREATE TYPE "PesoReferencia" AS ENUM ('EXATO', 'SO_A_IDEIA');

-- CreateEnum
CREATE TYPE "StatusReserva" AS ENUM ('ATIVA', 'CONCILIADA', 'LIBERADA', 'EXPIRADA', 'PENDENTE_PRECO');

-- AlterTable
ALTER TABLE "ContaInstagram" ADD COLUMN     "arquivadaEm" TIMESTAMP(3),
ADD COLUMN     "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "produtoPrincipalId" TEXT;

-- AlterTable
ALTER TABLE "GeracaoIA" ADD COLUMN     "reservaId" TEXT;

-- AlterTable
ALTER TABLE "Midia" ADD COLUMN     "miniaturaChave" TEXT,
ADD COLUMN     "privada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "temAlfa" BOOLEAN;

-- CreateTable
CREATE TABLE "Marca" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "briefing" JSONB NOT NULL DEFAULT '{}',
    "etapaAtual" INTEGER NOT NULL DEFAULT 1,
    "briefingIniciadoEm" TIMESTAMP(3),
    "referenciasConcluidasEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Marca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "briefing" JSONB NOT NULL DEFAULT '{}',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "arquivadoEm" TIMESTAMP(3),
    "geracaoJobId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Isca" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "escolha" "EscolhaIsca" NOT NULL,
    "descricao" TEXT,
    "formato" "FormatoIsca",
    "comoRecebe" "EntregaIsca",
    "link" TEXT,
    "pronta" BOOLEAN NOT NULL DEFAULT false,
    "previsaoPronta" DATE,
    "sugestaoChave" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Isca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FichaProduto" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "status" "StatusFicha" NOT NULL DEFAULT 'RASCUNHO',
    "origem" "OrigemFicha" NOT NULL,
    "conteudo" JSONB NOT NULL,
    "versaoPrompt" TEXT,
    "modelo" TEXT,
    "jobId" TEXT,
    "instrucao" TEXT,
    "baseVersao" INTEGER,
    "blocosRevisados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pendenciasDispensadas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aprovadaEm" TIMESTAMP(3),
    "aprovadaPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FichaProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referencia" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "midiaId" TEXT NOT NULL,
    "categoria" "CategoriaReferencia" NOT NULL,
    "origem" "OrigemReferencia",
    "gosta" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gostaLivre" TEXT,
    "naoGosta" TEXT,
    "formato" "FormatoReferencia",
    "peso" "PesoReferencia",
    "direitoDeclarado" BOOLEAN NOT NULL DEFAULT false,
    "licencaFonteDeclarada" BOOLEAN NOT NULL DEFAULT false,
    "avisos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "removidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConjuntoReferencias" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "itens" JSONB NOT NULL,
    "cores" JSONB NOT NULL,
    "fontes" JSONB NOT NULL,
    "links" JSONB NOT NULL,
    "concluidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConjuntoReferencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservaOrcamento" (
    "id" TEXT NOT NULL,
    "contaId" TEXT,
    "mesReferencia" TEXT NOT NULL,
    "valorBrl" DECIMAL(18,8) NOT NULL,
    "status" "StatusReserva" NOT NULL DEFAULT 'ATIVA',
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "origem" TEXT NOT NULL,
    "finalizadaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservaOrcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" TEXT NOT NULL,
    "contaId" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "link" TEXT,
    "lidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Marca_contaId_key" ON "Marca"("contaId");

-- CreateIndex
CREATE INDEX "Produto_contaId_idx" ON "Produto"("contaId");

-- CreateIndex
CREATE UNIQUE INDEX "Isca_produtoId_key" ON "Isca"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "FichaProduto_jobId_key" ON "FichaProduto"("jobId");

-- CreateIndex
CREATE INDEX "FichaProduto_contaId_idx" ON "FichaProduto"("contaId");

-- CreateIndex
CREATE UNIQUE INDEX "FichaProduto_produtoId_versao_key" ON "FichaProduto"("produtoId", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "Referencia_midiaId_key" ON "Referencia"("midiaId");

-- CreateIndex
CREATE INDEX "Referencia_contaId_categoria_idx" ON "Referencia"("contaId", "categoria");

-- CreateIndex
CREATE UNIQUE INDEX "ConjuntoReferencias_contaId_versao_key" ON "ConjuntoReferencias"("contaId", "versao");

-- CreateIndex
CREATE INDEX "ReservaOrcamento_mesReferencia_status_idx" ON "ReservaOrcamento"("mesReferencia", "status");

-- CreateIndex
CREATE INDEX "ReservaOrcamento_contaId_mesReferencia_idx" ON "ReservaOrcamento"("contaId", "mesReferencia");

-- CreateIndex
CREATE INDEX "Notificacao_lidaEm_criadoEm_idx" ON "Notificacao"("lidaEm", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "ContaInstagram_produtoPrincipalId_key" ON "ContaInstagram"("produtoPrincipalId");

-- CreateIndex
CREATE INDEX "GeracaoIA_reservaId_idx" ON "GeracaoIA"("reservaId");

-- CreateIndex
CREATE INDEX "Midia_status_criadoEm_idx" ON "Midia"("status", "criadoEm");

-- AddForeignKey
ALTER TABLE "ContaInstagram" ADD CONSTRAINT "ContaInstagram_produtoPrincipalId_fkey" FOREIGN KEY ("produtoPrincipalId") REFERENCES "Produto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marca" ADD CONSTRAINT "Marca_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaInstagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaInstagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Isca" ADD CONSTRAINT "Isca_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaProduto" ADD CONSTRAINT "FichaProduto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaProduto" ADD CONSTRAINT "FichaProduto_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaInstagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referencia" ADD CONSTRAINT "Referencia_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaInstagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referencia" ADD CONSTRAINT "Referencia_midiaId_fkey" FOREIGN KEY ("midiaId") REFERENCES "Midia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConjuntoReferencias" ADD CONSTRAINT "ConjuntoReferencias_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaInstagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeracaoIA" ADD CONSTRAINT "GeracaoIA_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "ReservaOrcamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaOrcamento" ADD CONSTRAINT "ReservaOrcamento_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaInstagram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaInstagram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
