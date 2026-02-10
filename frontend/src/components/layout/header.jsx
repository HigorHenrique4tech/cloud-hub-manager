import { Cloud, RefreshCw } from 'lucide-react';

const Header = ({ onRefresh, refreshing }) => {
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Cloud className="w-8 h-8 text-primary mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Cloud Hub Manager
              </h1>
              <p className="text-sm text-gray-500">
                Gerenciamento multi-cloud centralizado
              </p>
            </div>
          </div>
          
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="btn-secondary flex items-center"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;