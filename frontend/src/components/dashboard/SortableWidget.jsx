import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

const SortableWidget = ({ id, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div
        className="absolute left-2 top-3 z-10 cursor-grab opacity-0 group-hover:opacity-60 transition-opacity touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} className="text-slate-400" />
      </div>
      {children}
    </div>
  );
};

export default SortableWidget;
