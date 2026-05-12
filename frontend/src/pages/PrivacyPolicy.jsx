import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, Mail } from 'lucide-react';

const Section = ({ title, children }) => (
  <div className="mb-8">
    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
      <span className="w-1 h-5 rounded-full bg-primary flex-shrink-0" />
      {title}
    </h2>
    <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed space-y-2 pl-3">
      {children}
    </div>
  </div>
);

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Política de Privacidade
            </h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Versão 1.0 — Última atualização: maio de 2026
          </p>
        </div>

        {/* Content card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8">

          <Section title="1. Introdução e Controlador de Dados">
            <p>
              A <strong className="text-gray-800 dark:text-gray-200">Cloud Hub Manager</strong> ("Plataforma", "nós") é
              operada pela empresa responsável pelo serviço disponível em <em>cloudatlas.app.br</em>, inscrita perante
              as autoridades competentes do Brasil. Somos o <strong className="text-gray-800 dark:text-gray-200">controlador
              dos seus dados pessoais</strong> conforme a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD).
            </p>
            <p>
              Esta Política descreve quais dados coletamos, por que coletamos, como utilizamos, com quem compartilhamos e
              quais são seus direitos como titular dos dados.
            </p>
          </Section>

          <Section title="2. Dados que Coletamos">
            <p><strong className="text-gray-700 dark:text-gray-300">2.1 Dados de cadastro:</strong> nome completo, endereço de e-mail, senha (armazenada com hash bcrypt), CNPJ/razão social (opcional), telefone (opcional).</p>
            <p><strong className="text-gray-700 dark:text-gray-300">2.2 Credenciais de provedores cloud:</strong> chaves de acesso AWS, Azure e GCP fornecidas por você, armazenadas exclusivamente de forma criptografada (Fernet AES-128) com chave derivada por organização.</p>
            <p><strong className="text-gray-700 dark:text-gray-300">2.3 Dados de uso e logs:</strong> ações realizadas na plataforma (criação/exclusão de recursos, logins, alterações de configuração), endereço IP, user-agent do navegador e timestamps.</p>
            <p><strong className="text-gray-700 dark:text-gray-300">2.4 Dados de faturamento:</strong> registros de cobrança, histórico de pagamentos e informações de plano contratado. Não armazenamos dados completos de cartão de crédito — esses dados são processados pelo provedor AbacatePay.</p>
            <p><strong className="text-gray-700 dark:text-gray-300">2.5 Dados de sessão:</strong> tokens de autenticação (JWT e refresh tokens), endereço IP e dispositivo utilizados para controle de sessões ativas.</p>
          </Section>

          <Section title="3. Finalidades e Base Legal">
            <p>Tratamos seus dados com base nas seguintes hipóteses legais da LGPD:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-gray-700 dark:text-gray-300">Execução de contrato (Art. 7º V):</strong> autenticação, gerenciamento de recursos cloud, relatórios e faturamento.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Legítimo interesse (Art. 7º IX):</strong> logs de auditoria, detecção de fraudes e segurança da plataforma.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Cumprimento de obrigação legal (Art. 7º II):</strong> retenção de registros fiscais e de faturamento pelo prazo exigido por lei (5 anos).</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Consentimento (Art. 7º I):</strong> envio de comunicações de marketing e newsletters (quando solicitado).</li>
            </ul>
          </Section>

          <Section title="4. Compartilhamento com Subprocessadores">
            <p>Compartilhamos dados apenas com fornecedores necessários para a operação da Plataforma:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-gray-700 dark:text-gray-300">Amazon Web Services (AWS):</strong> hospedagem de infraestrutura e APIs de gestão de recursos.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Microsoft Azure / Microsoft Graph:</strong> gestão de recursos Azure e Microsoft 365.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Google Cloud Platform:</strong> gestão de recursos GCP.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">AbacatePay:</strong> processamento de pagamentos (dados de cartão nunca passam pelos nossos servidores).</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Provedor de SMTP:</strong> envio de e-mails transacionais (verificação, alertas, relatórios).</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Azure Blob Storage:</strong> armazenamento de vídeos da base de conhecimento.</li>
            </ul>
            <p>Não vendemos nem cedemos seus dados a terceiros para fins comerciais.</p>
          </Section>

          <Section title="5. Retenção de Dados">
            <p>Mantemos seus dados pelo tempo necessário para as finalidades descritas:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-gray-700 dark:text-gray-300">Dados de conta:</strong> pelo período de vigência do contrato + 90 dias após encerramento da conta.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Logs de auditoria:</strong> 1 ano, com anonimização de IPs após 90 dias.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Registros de faturamento:</strong> 5 anos (obrigação fiscal).</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Aceite de termos:</strong> pelo prazo de validade legal (comprovação de consentimento).</li>
            </ul>
          </Section>

          <Section title="6. Segurança dos Dados">
            <p>Adotamos medidas técnicas e organizacionais para proteger seus dados:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Criptografia em trânsito (TLS 1.2+) e em repouso (AES-128 para credenciais).</li>
              <li>Autenticação multifator (MFA) disponível para todas as contas.</li>
              <li>Rate limiting e bloqueio automático após tentativas excessivas de login.</li>
              <li>Revogação imediata de tokens após logout ou troca de senha.</li>
              <li>Auditoria de todas as ações administrativas.</li>
            </ul>
          </Section>

          <Section title="7. Seus Direitos (LGPD Art. 18)">
            <p>Como titular de dados, você tem os seguintes direitos, exercíveis a qualquer momento:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-gray-700 dark:text-gray-300">Confirmação e acesso:</strong> saber se tratamos seus dados e obter uma cópia.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Correção:</strong> atualizar dados incompletos ou incorretos em Configurações → Perfil.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Portabilidade:</strong> exportar todos os seus dados em formato JSON via Configurações → Minha Conta → Exportar Dados.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Eliminação:</strong> solicitar a exclusão/anonimização de seus dados via Configurações → Minha Conta → Encerrar Conta, ou por e-mail ao DPO.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Revogação de consentimento:</strong> para comunicações de marketing, clique em "cancelar inscrição" no e-mail ou contate o DPO.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Oposição:</strong> se discordar de algum tratamento baseado em legítimo interesse.</li>
            </ul>
            <p>Respondemos a solicitações em até 15 dias úteis.</p>
          </Section>

          <Section title="8. Encarregado de Dados (DPO)">
            <p>
              Para exercer seus direitos ou esclarecer dúvidas sobre privacidade, entre em contato com nosso
              Encarregado de Proteção de Dados (DPO):
            </p>
            <div className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/20">
              <Mail className="w-4 h-4 text-primary flex-shrink-0" />
              <a href="mailto:privacidade@cloudatlas.app.br" className="text-primary font-medium hover:underline">
                privacidade@cloudatlas.app.br
              </a>
            </div>
          </Section>

          <Section title="9. Cookies e Tecnologias de Rastreamento">
            <p>
              Utilizamos cookies estritamente necessários para autenticação (tokens de sessão armazenados de forma
              segura) e preferências do usuário (tema escuro/claro, workspace selecionado). Não utilizamos cookies de
              rastreamento ou publicidade de terceiros.
            </p>
          </Section>

          <Section title="10. Alterações nesta Política">
            <p>
              Podemos atualizar esta Política periodicamente. Notificaremos você por e-mail sobre mudanças materiais
              com antecedência mínima de 15 dias. O uso continuado da Plataforma após a data de vigência das alterações
              constitui aceitação da nova Política.
            </p>
          </Section>

          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
            Esta Política está em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018) e demais normas aplicáveis.
            Para dúvidas sobre conformidade regulatória, consulte a{' '}
            <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              ANPD — Autoridade Nacional de Proteção de Dados
            </a>.
          </div>
        </div>
      </div>
    </div>
  );
}
