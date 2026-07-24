import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

const SortableWidget = ({ id, children, className = '' }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group rounded-xl
        ${isDragging ? 'opacity-80 scale-[1.02] shadow-card-hover ring-2 ring-primary/40' : ''}
        ${isOver && !isDragging ? 'ring-2 ring-primary/30 ring-offset-2 ring-offset-gray-100 dark:ring-offset-gray-900' : ''}
        transition-[box-shadow,transform,ring] duration-150 ease-out
        ${className}`}
    >
      {/* Drop-zone glow when hovered during drag */}
      {isOver && !isDragging && (
        <div className="pointer-events-none absolute inset-0 rounded-xl bg-primary/5 animate-fade-in" />
      )}

      {/* Drag handle */}
      <button
        type="button"
        aria-label="Arrastar widget"
        className="absolute left-1.5 top-2.5 z-10 p-1 rounded-md cursor-grab active:cursor-grabbing
                   opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:bg-gray-200/70 dark:hover:bg-gray-700/70
                   transition-opacity touch-none focus-ring"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} className="text-gray-400" />
      </button>

      {children}
    </div>
  );
};

export default SortableWidget;
