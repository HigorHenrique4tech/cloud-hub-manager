import { useEffect, useRef, useState } from 'react';
import { X, ScrollText, CheckCircle2, ExternalLink } from 'lucide-react';
import authService from '../../services/authService';

const TERMS_CONTENT = `
TERMOS DE USO E POLÍTICA DE PRIVACIDADE
Versão 1.0 — Última atualização: maio de 2026

1. ACEITAÇÃO DOS TERMOS
Ao acessar ou utilizar a plataforma Cloud Hub Manager ("Plataforma"), você concorda com estes Termos de Uso. Se não concordar com qualquer parte destes termos, não utilize a Plataforma.

2. DESCRIÇÃO DO SERVIÇO
A Cloud Hub Manager é uma plataforma de gerenciamento multi-cloud que permite visualizar, controlar e otimizar recursos em provedores como AWS, Microsoft Azure, Google Cloud Platform e Microsoft 365. A Plataforma oferece funcionalidades de monitoramento de custos, FinOps, migração de dados, gerenciamento de identidades e outras ferramentas de gestão de nuvem.

3. ELEGIBILIDADE E CADASTRO
3.1. Para utilizar a Plataforma, você deve ser maior de 18 anos e ter capacidade legal para celebrar contratos.
3.2. Você é responsável por manter a confidencialidade das suas credenciais de acesso e por todas as atividades realizadas em sua conta.
3.3. Ao se cadastrar, você deve fornecer informações verdadeiras, precisas e completas.

4. USO ACEITÁVEL
4.1. Você concorda em utilizar a Plataforma apenas para fins legítimos de negócios.
4.2. É proibido utilizar a Plataforma para:
   - Acessar sistemas ou dados sem autorização;
   - Praticar atividades ilegais ou fraudulentas;
   - Violar direitos de propriedade intelectual;
   - Distribuir malware, vírus ou código malicioso;
   - Realizar ataques de negação de serviço (DoS/DDoS);
   - Coletar dados de outros usuários sem consentimento.

5. CREDENCIAIS E SEGURANÇA
5.1. A Plataforma armazena suas credenciais de acesso a provedores cloud de forma criptografada.
5.2. Você é o único responsável pela segurança e permissões das credenciais fornecidas.
5.3. Recomendamos utilizar credenciais com permissões mínimas necessárias (princípio do menor privilégio).
5.4. Em caso de comprometimento de credenciais, revogue-as imediatamente no provedor correspondente.

6. DADOS E PRIVACIDADE
6.1. Coletamos dados necessários para a prestação do serviço, incluindo: informações de cadastro, logs de atividade, métricas de uso e dados de faturamento.
6.2. Não vendemos seus dados pessoais a terceiros.
6.3. Os dados são armazenados em servidores seguros e protegidos conforme as melhores práticas do setor.
6.4. Você pode solicitar a exclusão dos seus dados a qualquer momento através do suporte.
6.5. Para mais informações, consulte nossa Política de Privacidade completa.

7. PROPRIEDADE INTELECTUAL
7.1. A Plataforma, incluindo seu código-fonte, design, marcas e conteúdo, é de propriedade exclusiva da empresa e protegida pelas leis de propriedade intelectual.
7.2. É concedida ao usuário uma licença limitada, não exclusiva e intransferível para usar a Plataforma.

8. LIMITAÇÃO DE RESPONSABILIDADE
8.1. A Plataforma é fornecida "como está", sem garantias expressas ou implícitas.
8.2. Não nos responsabilizamos por danos decorrentes de: interrupções de serviço dos provedores cloud terceiros; decisões tomadas com base em dados exibidos na Plataforma; acesso não autorizado à sua conta.
8.3. Em nenhuma hipótese nossa responsabilidade excederá o valor pago pelo serviço nos últimos 3 meses.

9. FATURAMENTO E PAGAMENTOS
9.1. Os planos e preços são os descritos na página de planos no momento da contratação.
9.2. Cobranças são realizadas antecipadamente, no início de cada período.
9.3. Reembolsos podem ser solicitados em até 7 dias corridos após a cobrança, conforme o Código de Defesa do Consumidor.
9.4. A falta de pagamento pode resultar na suspensão ou cancelamento da conta.

10. CANCELAMENTO
10.1. Você pode cancelar sua conta a qualquer momento.
10.2. Após o cancelamento, seus dados serão mantidos por 30 dias e então excluídos permanentemente, salvo obrigação legal contrária.
10.3. Reservamo-nos o direito de suspender ou encerrar contas que violem estes Termos.

11. MODIFICAÇÕES
11.1. Podemos atualizar estes Termos periodicamente. Usuários serão notificados sobre alterações relevantes.
11.2. O uso continuado da Plataforma após notificação implica aceitação dos novos termos.

12. LEI APLICÁVEL
Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de São Paulo/SP para dirimir quaisquer controvérsias.

13. CONTATO
Em caso de dúvidas sobre estes Termos, entre em contato:
E-mail: contato@cloudatlas.app.br
`;

export default function TermsModal({ onAccept, onDecline, loading = false }) {
  const scrollRef = useRef(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      if (atBottom) setScrolledToBottom(true);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const canAccept = scrolledToBottom && checked;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <ScrollText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Termos de Uso</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Leia e aceite para continuar</p>
          </div>
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 py-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line"
        >
          {TERMS_CONTENT}
          <div className="h-4" />
        </div>

        {/* Scroll hint */}
        {!scrolledToBottom && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-1 flex-shrink-0">
            Role até o final para habilitar a aceitação ↓
          </p>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 space-y-3">
          <label className={`flex items-start gap-3 cursor-pointer ${!scrolledToBottom ? 'opacity-40 pointer-events-none' : ''}`}>
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Li e concordo com os <strong>Termos de Uso</strong> e a{' '}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-primary hover:underline font-medium"
                onClick={e => e.stopPropagation()}
              >
                Política de Privacidade
                <ExternalLink className="w-3 h-3" />
              </a>{' '}
              da plataforma.
            </span>
          </label>

          <div className="flex gap-3">
            <button
              onClick={onDecline}
              disabled={loading}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                         text-gray-700 dark:text-gray-300 text-sm font-medium
                         hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              Recusar
            </button>
            <button
              onClick={onAccept}
              disabled={!canAccept || loading}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium
                         hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Aceitar e Continuar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
