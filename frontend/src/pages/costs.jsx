import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, AlertCircle } from 'lucide-react';
import Layout from '../components/layout/layout';
import LoadingSpinner from '../components/common/loadingspinner';

const Costs = () => {
  const [loading, setLoading] = useState(true);
  const [costs, setCosts] = useState({
    aws: { daily: 0, weekly: 0, monthly: 0 },
    azure: { daily: 0, weekly: 0, monthly: 0 }
  });

  useEffect(() => {
    // Simulate cost loading
    setTimeout(() => {
      setCosts({
        aws: { daily: 45.23, weekly: 316.61, monthly: 1350.90 },
        azure: { daily: 32.50, weekly: 227.50, monthly: 975.00 }
      });
      setLoading(false);
    }, 1000);
  }, []);

  const CostCard = ({ title, daily, weekly, monthly }) => (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Hoje</span>
          <span className="text-2xl font-bold text-gray-900">${daily.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Esta Semana</span>
          <span className="text-2xl font-bold text-gray-900">${weekly.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Este Mês</span>
          <span className="text-2xl font-bold text-primary">${monthly.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <Layout>
        <LoadingSpinner text="Carregando dados de custos..." />
      </Layout>
    );
  }

  const totalDaily = costs.aws.daily + costs.azure.daily;
  const totalWeekly = costs.aws.weekly + costs.azure.weekly;
  const totalMonthly = costs.aws.monthly + costs.azure.monthly;

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Análise de Custos</h1>
        <p className="text-gray-600">Acompanhe os gastos de suas clouds</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Gasto de Hoje</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">${totalDaily.toFixed(2)}</p>
            </div>
            <DollarSign className="w-12 h-12 text-blue-400 opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Gasto Semanal</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">${totalWeekly.toFixed(2)}</p>
            </div>
            <TrendingUp className="w-12 h-12 text-green-400 opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Gasto Mensal</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">${totalMonthly.toFixed(2)}</p>
            </div>
            <AlertCircle className="w-12 h-12 text-orange-400 opacity-50" />
          </div>
        </div>
      </div>

      {/* Cloud Costs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CostCard
          title="Amazon Web Services (AWS)"
          daily={costs.aws.daily}
          weekly={costs.aws.weekly}
          monthly={costs.aws.monthly}
        />
        <CostCard
          title="Microsoft Azure"
          daily={costs.azure.daily}
          weekly={costs.azure.weekly}
          monthly={costs.azure.monthly}
        />
      </div>

      {/* Info Alert */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex">
          <AlertCircle className="w-5 h-5 text-blue-400 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-blue-900">Nota sobre os Custos</h3>
            <p className="text-sm text-blue-700 mt-1">
              Os dados de custos são estimativas baseadas no consumo atual. Para valores precisos, 
              consulte os painéis de billing das suas contas na AWS e Azure.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Costs;
