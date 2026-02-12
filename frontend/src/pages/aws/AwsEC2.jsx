import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import EC2Table from '../../components/resources/ec2table';
import awsService from '../../services/awsservices';

const AwsEC2 = () => {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').toLowerCase();

  const { data, isLoading, error } = useQuery({
    queryKey: ['aws-ec2'],
    queryFn: () => awsService.listEC2Instances(),
    retry: false,
  });

  if (isLoading) return <Layout><LoadingSpinner text="Carregando instâncias EC2..." /></Layout>;

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="aws" /></Layout>;
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar EC2'}</span>
        </div>
      </Layout>
    );
  }

  const instances = (data?.instances || []).filter(i =>
    !q || i.name?.toLowerCase().includes(q) || i.instance_id?.toLowerCase().includes(q) || i.instance_type?.toLowerCase().includes(q)
  );

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">EC2 — Instâncias</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Região: {data?.region || 'N/A'} · {instances.length} instância(s)
          {q && ` · filtrado por "${q}"`}
        </p>
      </div>

      <div className="card">
        <EC2Table instances={instances} />
      </div>
    </Layout>
  );
};

export default AwsEC2;
