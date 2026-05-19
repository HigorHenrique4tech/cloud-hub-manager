import { Link } from 'react-router-dom';
import { FileText, ArrowLeft, Mail } from 'lucide-react';

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

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Termos de Uso
            </h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Versão 1.0 — Última atualização: maio de 2026
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8">

          <Section title="1. Aceitação dos Termos">
            <p>
              Ao criar uma conta ou utilizar a plataforma <strong className="text-gray-800 dark:text-gray-200">CloudAtlas</strong> (disponível em <em>hub.cloudatlas.app.br</em>),
              você concorda com estes Termos de Uso. Se agir em nome de uma empresa, declara ter poderes para vinculá-la a estes termos.
              Caso não concorde, não utilize a Plataforma.
            </p>
          </Section>

          <Section title="2. Descrição do Serviço">
            <p>
              O CloudAtlas é uma plataforma SaaS de gestão multi-cloud que permite monitorar, gerenciar e otimizar
              recursos em Amazon Web Services (AWS), Microsoft Azure, Google Cloud Platform (GCP) e Microsoft 365,
              incluindo funcionalidades de FinOps, automação de segurança, migração de dados e relatórios executivos.
            </p>
            <p>
              Os serviços estão disponíveis nos planos <strong className="text-gray-700 dark:text-gray-300">Free</strong>,{' '}
              <strong className="text-gray-700 dark:text-gray-300">Pro</strong> e{' '}
              <strong className="text-gray-700 dark:text-gray-300">Enterprise</strong>, com funcionalidades e limites distintos descritos na página de Preços.
            </p>
          </Section>

          <Section title="3. Elegibilidade e Cadastro">
            <p>Para utilizar a Plataforma você deve:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Ter ao menos 18 anos ou a maioridade legal em sua jurisdição.</li>
              <li>Fornecer informações verdadeiras, precisas e completas no cadastro.</li>
              <li>Manter suas credenciais de acesso em sigilo — você é responsável por toda atividade realizada com sua conta.</li>
              <li>Notificar imediatamente a CloudAtlas em caso de uso não autorizado da sua conta pelo e-mail <a href="mailto:suporte@cloudatlas.app.br" className="text-primary hover:underline">suporte@cloudatlas.app.br</a>.</li>
            </ul>
          </Section>

          <Section title="4. Planos, Pagamentos e Cancelamento">
            <p><strong className="text-gray-700 dark:text-gray-300">4.1 Trial gratuito:</strong> novos cadastros recebem 30 dias de acesso ao plano Pro sem custo. Ao término do trial, a conta retorna ao plano Free automaticamente.</p>
            <p><strong className="text-gray-700 dark:text-gray-300">4.2 Planos pagos:</strong> assinaturas são cobradas mensalmente via PIX ou cartão de crédito, processados pelo AbacatePay. O valor é debitado no início de cada ciclo mensal.</p>
            <p><strong className="text-gray-700 dark:text-gray-300">4.3 Cancelamento:</strong> você pode cancelar a qualquer momento nas configurações da conta. O acesso às funcionalidades pagas permanece ativo até o fim do período já pago. Não há reembolso proporcional por cancelamento antecipado.</p>
            <p><strong className="text-gray-700 dark:text-gray-300">4.4 Inadimplência:</strong> em caso de falha no pagamento, a conta é migrada para o plano Free após 7 dias de carência. O histórico de dados é preservado por 90 dias.</p>
          </Section>

          <Section title="5. Uso Aceitável">
            <p>Você concorda em não utilizar a Plataforma para:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Violar leis ou regulamentações aplicáveis, incluindo leis de privacidade de dados.</li>
              <li>Acessar ou tentar acessar contas de outros usuários sem autorização.</li>
              <li>Realizar engenharia reversa, descompilar ou criar obras derivadas da Plataforma.</li>
              <li>Introduzir vírus, malware ou código malicioso de qualquer natureza.</li>
              <li>Sobrecarregar a infraestrutura da Plataforma com requisições automatizadas abusivas.</li>
              <li>Revender ou sublicenciar o acesso à Plataforma sem autorização prévia por escrito.</li>
            </ul>
          </Section>

          <Section title="6. Credenciais de Provedores Cloud">
            <p>
              Ao cadastrar credenciais de AWS, Azure, GCP ou Microsoft 365 na Plataforma, você declara ter as permissões
              necessárias para fazê-lo. As credenciais são armazenadas com criptografia AES-128 (Fernet) por organização.
            </p>
            <p>
              A CloudAtlas utiliza suas credenciais exclusivamente para executar as operações solicitadas por você na Plataforma.
              Recomendamos criar credenciais com escopo de permissões mínimas necessárias (princípio do menor privilégio).
            </p>
          </Section>

          <Section title="7. Propriedade Intelectual">
            <p>
              A Plataforma, incluindo seu código-fonte, design, marcas e conteúdo, é de propriedade exclusiva da CloudAtlas.
              Estes Termos não transferem nenhum direito de propriedade intelectual a você.
            </p>
            <p>
              Os dados que você insere na Plataforma (configurações, recursos, relatórios) continuam sendo de sua propriedade.
              Concedemos a você uma licença limitada, não exclusiva e intransferível para usar a Plataforma conforme estes Termos.
            </p>
          </Section>

          <Section title="8. Disponibilidade e SLA">
            <p>
              Nos comprometemos a manter a Plataforma disponível com SLA de <strong className="text-gray-700 dark:text-gray-300">99,5% ao mês</strong> para planos Pro e Enterprise.
              Manutenções programadas serão comunicadas com antecedência mínima de 24 horas.
            </p>
            <p>
              O plano Free não possui garantia de SLA. A CloudAtlas não se responsabiliza por indisponibilidades causadas
              por falhas em provedores de nuvem terceiros (AWS, Azure, GCP, Microsoft).
            </p>
          </Section>

          <Section title="9. Limitação de Responsabilidade">
            <p>
              Na extensão máxima permitida pela lei, a CloudAtlas não será responsável por danos indiretos, incidentais,
              especiais, consequentes ou punitivos, incluindo perda de lucros, dados ou receita, decorrentes do uso ou
              incapacidade de uso da Plataforma.
            </p>
            <p>
              Nossa responsabilidade total por qualquer reivindicação relacionada ao uso da Plataforma não excederá o
              valor pago por você nos 3 meses anteriores ao evento que deu origem à reivindicação.
            </p>
          </Section>

          <Section title="10. Rescisão">
            <p>
              A CloudAtlas pode suspender ou encerrar seu acesso à Plataforma, com ou sem aviso prévio, em caso de
              violação material destes Termos ou por determinação judicial ou regulatória.
            </p>
            <p>
              Após o encerramento, seus dados serão retidos por 90 dias para eventual exportação, sendo então permanentemente excluídos,
              salvo obrigação legal de retenção mais longa.
            </p>
          </Section>

          <Section title="11. Alterações nos Termos">
            <p>
              Podemos revisar estes Termos periodicamente. Comunicaremos mudanças materiais por e-mail com antecedência
              mínima de 15 dias. O uso continuado da Plataforma após a vigência das alterações constitui aceitação dos novos Termos.
            </p>
          </Section>

          <Section title="12. Legislação Aplicável e Foro">
            <p>
              Estes Termos são regidos pelas leis da República Federativa do Brasil. Quaisquer disputas serão submetidas
              ao foro da Comarca de São Paulo — SP, com exclusão de qualquer outro, por mais privilegiado que seja.
            </p>
          </Section>

          <Section title="13. Contato">
            <p>Para dúvidas sobre estes Termos:</p>
            <div className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/20">
              <Mail className="w-4 h-4 text-primary flex-shrink-0" />
              <a href="mailto:suporte@cloudatlas.app.br" className="text-primary font-medium hover:underline">
                suporte@cloudatlas.app.br
              </a>
            </div>
          </Section>

          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
            Para informações sobre como tratamos seus dados pessoais, consulte nossa{' '}
            <Link to="/privacy" className="text-primary hover:underline">Política de Privacidade</Link> e nossa{' '}
            <Link to="/lgpd" className="text-primary hover:underline">Política LGPD</Link>.
          </div>
        </div>
      </div>
    </div>
  );
}
