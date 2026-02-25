import { Link } from 'react-router-dom';
import { Settings, ArrowRight } from 'lucide-react';
import { AwsIcon, AzureIcon, GcpIcon } from './CloudProviderIcons';

const NoCredentialsMessage = ({ provider }) => {
  const providerLabel = {
    aws: 'Amazon Web Services (AWS)',
    azure: 'Microsoft Azure',
    gcp: 'Google Cloud Platform (GCP)',
    costs: 'nenhuma cloud',
  }[provider] ?? provider;

  const icon = {
    aws: (
      <div className="w-20 h-14 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center mx-auto mb-6">
        <AwsIcon className="w-14 h-9" />
      </div>
    ),
    azure: (
      <div className="w-16 h-16 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center mx-auto mb-6">
        <AzureIcon className="w-9 h-9" />
      </div>
    ),
    gcp: (
      <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mx-auto mb-6">
        <GcpIcon className="w-10 h-10" />
      </div>
    ),
    costs: (
      <div className="w-16 h-16 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center mx-auto mb-6">
        <span className="text-3xl">💰</span>
      </div>
    ),
  }[provider];

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      {icon}

      <h2 className="text-xl font-semibold text-gray-800 mb-2">
        Nenhuma credencial configurada
      </h2>

      <p className="text-gray-500 text-center max-w-sm mb-8">
        Para visualizar os recursos de <strong>{providerLabel}</strong>, cadastre suas
        credenciais de acesso na página de Configurações.
      </p>

      <Link
        to="/settings"
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors"
      >
        <Settings className="w-4 h-4" />
        Ir para Configurações
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
};

export default NoCredentialsMessage;
