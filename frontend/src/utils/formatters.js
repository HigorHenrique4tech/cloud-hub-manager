// Format date to readable string
export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

// Format relative time (e.g., "2 hours ago")
export const formatRelativeTime = (dateString) => {
  if (!dateString) return 'N/A';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return 'agora mesmo';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutos atrás`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} horas atrás`;
  return `${Math.floor(diffInSeconds / 86400)} dias atrás`;
};

// Get status badge color
export const getStatusColor = (state) => {
  const stateMap = {
    running: 'success',
    stopped: 'danger',
    stopping: 'warning',
    pending: 'warning',
    terminated: 'gray',
    deallocated: 'danger',
    deallocating: 'warning',
    starting: 'warning'
  };
  
  return stateMap[state?.toLowerCase()] || 'gray';
};

// Get status display text
export const getStatusText = (state) => {
  if (!state) return 'Unknown';
  
  const textMap = {
    running: 'Rodando',
    stopped: 'Parado',
    stopping: 'Parando',
    pending: 'Pendente',
    terminated: 'Terminado',
    deallocated: 'Desalocado',
    deallocating: 'Desalocando',
    starting: 'Iniciando'
  };
  
  return textMap[state.toLowerCase()] || state;
};

// Format instance type
export const formatInstanceType = (type) => {
  if (!type) return 'N/A';
  return type.toUpperCase();
};