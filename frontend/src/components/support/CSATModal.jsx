import { useState } from 'react';
import { Star } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import supportService from '../../services/supportService';

const CSATModal = ({ ticket, onClose, onRated }) => {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');

  const mut = useMutation({
    mutationFn: () => supportService.rate(ticket.id, rating, comment || null),
    onSuccess: () => { onRated?.(); onClose?.(); },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Avalie o atendimento</h3>
          <p className="text-sm text-gray-500">
            Ticket #{ticket.ticket_number} — {ticket.title}
          </p>
        </div>

        <div className="flex items-center justify-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
              className="p-1 transition-transform hover:scale-110">
              <Star className={`w-8 h-8 ${
                (hover || rating) >= n
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-gray-300 dark:text-gray-600'
              }`} />
            </button>
          ))}
        </div>

        <textarea className="input w-full" rows={3} placeholder="Comentário (opcional)"
          value={comment} onChange={(e) => setComment(e.target.value)} />

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Mais tarde</button>
          <button onClick={() => mut.mutate()} disabled={!rating || mut.isLoading}
            className="btn-primary">
            {mut.isLoading ? 'Enviando...' : 'Enviar avaliação'}
          </button>
        </div>

        {mut.error && (
          <p className="text-sm text-red-600">
            {mut.error.response?.data?.detail || 'Erro ao enviar'}
          </p>
        )}
      </div>
    </div>
  );
};

export default CSATModal;
