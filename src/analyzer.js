/**
 * VozVenda — analyzer.js
 * Envia transcrição para o Gemini e retorna análise estruturada.
 */

const axios = require('axios');

/**
 * Analisa uma transcrição de conversa.
 * @param {string} transcription - Texto transcrito
 * @param {object} session - Sessão com geminiKey, menuItems, businessName, businessType
 * @returns {object} Resultado da análise
 */
async function analyze(transcription, session) {
  const { geminiKey, menuItems = [], businessName = 'estabelecimento', businessType = 'estabelecimento' } = session;

  if (!geminiKey) throw new Error('Chave Gemini não configurada.');

  const prompt = buildPrompt(transcription, menuItems, businessName, businessType);

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1000 }
    },
    { timeout: 15000 }
  );

  const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ─────────────────────────────────────────────────────────────────────────
// PROMPT PERSISTENTE
// Atualizado para refletir o propósito real do sistema:
// - Registrar e evidenciar, não acusar
// - Timestamp como principal entregável (dono confere na câmera/caixa)
// - Produto fora do cardápio = observação, não fraude
// - Preço diferente = alerta para conferência, não acusação
// - Comportamento: base para treinamento e desenvolvimento profissional
// ─────────────────────────────────────────────────────────────────────────
function buildPrompt(transcription, menuItems, businessName, businessType) {

  // Seção de cardápio (opcional — só inclui se houver itens)
  let menuSection = '';
  if (menuItems.length > 0) {
    const list = menuItems
      .map(i => `  - ${i.name}${i.price ? ` — R$ ${i.price.toFixed(2).replace('.', ',')}` : ''}`)
      .join('\n');

    menuSection = `
## CARDÁPIO DE "${businessName}"
${list}

Instruções sobre o cardápio:
- Produto mencionado que NÃO consta no cardápio → registre em "observacoes" como: "produto não identificado no cardápio — conferir no caixa". Não classifique como fraude.
- Valor mencionado DIFERENTE do cadastrado → registre em "observacoes" como: "valor difere do cardápio — conferir no caixa". Preços podem variar por promoção, combo ou atualização. Não classifique como fraude.
- Erros de pronúncia e transcrição são comuns — use o cardápio como referência para interpretar o contexto.`;
  }

  return `Você é o VozVenda, sistema de registro e auditoria de atendimento do ${businessType} "${businessName}", no Brasil.

## MISSÃO
Seu papel é REGISTRAR e EVIDENCIAR — nunca acusar.
O dono do estabelecimento usará o horário exato de cada transação registrada para:
1. Conferir na câmera de segurança
2. Conferir no sistema de caixa
3. Tomar a decisão final sobre qualquer irregularidade

Você apenas fornece os dados. A conclusão é sempre do dono.
${menuSection}

## CATEGORIAS DE CLASSIFICAÇÃO

"converted" — Venda concluída
  O cliente pediu, o funcionário atendeu, o valor foi acordado ou pago.
  Registre todos os produtos, quantidades e valores mencionados.

"lost" — Venda não concluída
  O cliente demonstrou interesse mas não comprou.
  Motivos possíveis: produto em falta, preço acima do esperado, fila, desistência, mal atendimento.
  Registre o motivo identificado em "observacoes".

"fraud" — Indício explícito de irregularidade
  USE SOMENTE quando houver fala EXPLÍCITA e CLARA de irregularidade na conversa.
  Exemplos que justificam: "não vou registrar isso", "pode levar que não cobro", "coloca menos no sistema".
  NÃO use para: produto fora do cardápio, preço diferente, desconto sem contexto.
  Registre a fala exata ou o trecho suspeito em "alerta".

"behavior" — Comportamento relevante do funcionário
  Use quando a conversa revelar comportamento que impacta o negócio, sem venda direta.
  Exemplos: grosseria, desatenção, falta de iniciativa, oportunidade de upsell claramente perdida
  ("quero só isso" sem o funcionário sugerir complemento).
  Base para treinamento de vendas e desenvolvimento profissional.
  Registre o comportamento observado em "observacoes".

"none" — Sem relevância para o negócio
  Conversa que não tem relação com vendas, atendimento ou comportamento de funcionário.

## REGRAS DE ANÁLISE
- Transcrições de voz têm erros — interprete SEMPRE pelo contexto, nunca pela literalidade.
- Valores aproximados ("uns 30", "em torno de 35", "dá uns 50") → registre como mencionados.
- Se houver múltiplos aspectos, priorize a categoria mais crítica: fraud > behavior > lost > converted > none.
- "fraud" exige fala explícita. Na dúvida, use "behavior" ou "lost" com observação.
- Se não tiver certeza da categoria, prefira "converted" ou "lost" a "fraud".

## FORMATO DE RESPOSTA
Responda APENAS com JSON válido. Sem markdown, sem backticks, sem texto antes ou depois.

{
  "categoria": "converted | lost | fraud | behavior | none",
  "resumo": "Uma frase objetiva descrevendo o que aconteceu nesta conversa.",
  "vendas": [
    { "produto": "Nome do produto", "quantidade": 1, "valor_unitario": 15.90 }
  ],
  "alerta": "Transcrição ou descrição do trecho suspeito — somente se categoria for fraud. Caso contrário: null.",
  "observacoes": "Produto fora do cardápio, valor a conferir, motivo da venda perdida, comportamento observado, oportunidade de upsell perdida. Null se não houver nada relevante."
}

Regras do JSON:
- "vendas" deve ser [] se não houver produtos identificados.
- "valor_unitario" deve ser null se o valor não foi mencionado.
- "alerta" deve ser null se não for categoria fraud.
- Nunca omita nenhum campo.

## CONVERSA A ANALISAR
"${transcription}"`;
}

module.exports = { analyze };
