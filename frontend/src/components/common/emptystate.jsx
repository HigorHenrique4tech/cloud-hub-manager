import { Cloud } from 'lucide-react';

const EmptyState = ({ message = 'Nenhum recurso encontrado', icon: Icon = Cloud }) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-gray-500">
      <Icon className="w-16 h-16 mb-4 text-gray-400" />
      <p className="text-lg">{message}</p>
    </div>
  );
};

export default EmptyState;