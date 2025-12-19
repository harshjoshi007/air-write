import { useState, useEffect, useRef } from 'react';
import { Trash2, Eye, EyeOff, X } from 'lucide-react';
import { getTrainedTemplates, deleteTemplatesForLetter, deleteTemplateByIndex, TrainedTemplate } from '@/lib/trainingStore';

interface Props {
  selectedLetter: string;
  onTemplatesChange: () => void;
}

const TrainedTemplatesViewer = ({ selectedLetter, onTemplatesChange }: Props) => {
  const [templates, setTemplates] = useState<TrainedTemplate[]>([]);
  const [showAll, setShowAll] = useState(false);

  const refreshTemplates = () => {
    const all = getTrainedTemplates();
    const filtered = showAll ? all : all.filter(t => t.letter === selectedLetter);
    setTemplates(filtered);
  };

  useEffect(() => {
    refreshTemplates();
  }, [selectedLetter, showAll]);

  const handleDeleteLetter = (letter: string) => {
    if (confirm(`Delete all templates for "${letter}"?`)) {
      deleteTemplatesForLetter(letter);
      onTemplatesChange();
      refreshTemplates();
    }
  };

  const handleDeleteSingle = (template: TrainedTemplate) => {
    deleteTemplateByIndex(template.letter, template.createdAt);
    onTemplatesChange();
    refreshTemplates();
  };

  // Group templates by letter
  const grouped = templates.reduce((acc, t) => {
    if (!acc[t.letter]) acc[t.letter] = [];
    acc[t.letter].push(t);
    return acc;
  }, {} as Record<string, TrainedTemplate[]>);

  if (templates.length === 0) {
    return (
      <div className="glass-strong rounded-3xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Saved Templates</h3>
          <button
            onClick={() => setShowAll(!showAll)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAll ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {showAll ? 'All' : selectedLetter}
          </button>
        </div>
        <p className="text-sm text-muted-foreground text-center py-8">
          No templates saved{showAll ? '' : ` for "${selectedLetter}"`}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-strong rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Saved Templates</h3>
        <button
          onClick={() => setShowAll(!showAll)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showAll ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          {showAll ? 'All Letters' : `Only ${selectedLetter}`}
        </button>
      </div>

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
        {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([letter, letterTemplates]) => (
          <div key={letter} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-primary">{letter}</span>
              <button
                onClick={() => handleDeleteLetter(letter)}
                className="text-xs text-destructive hover:underline flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Delete all
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {letterTemplates.map((template, idx) => (
                <TemplatePreview 
                  key={`${template.letter}-${template.createdAt}-${idx}`} 
                  template={template}
                  onDelete={() => handleDeleteSingle(template)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const TemplatePreview = ({ template, onDelete }: { template: TrainedTemplate; onDelete: () => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || template.points.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = 8;
    const size = canvas.width - padding * 2;

    ctx.beginPath();
    ctx.strokeStyle = '#00fff7';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const firstPoint = template.points[0];
    ctx.moveTo(padding + firstPoint.x * size, padding + firstPoint.y * size);

    for (let i = 1; i < template.points.length; i++) {
      const point = template.points[i];
      ctx.lineTo(padding + point.x * size, padding + point.y * size);
    }
    ctx.stroke();

    // Draw start point
    ctx.beginPath();
    ctx.fillStyle = '#00ff00';
    ctx.arc(padding + firstPoint.x * size, padding + firstPoint.y * size, 3, 0, Math.PI * 2);
    ctx.fill();
  }, [template]);

  return (
    <div className="relative group aspect-square rounded-lg bg-background border border-border overflow-hidden">
      <canvas
        ref={canvasRef}
        width={64}
        height={64}
        className="w-full h-full"
      />
      <button
        onClick={onDelete}
        className="absolute top-1 right-1 p-1 rounded-full bg-destructive/80 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
        title="Delete this template"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

export default TrainedTemplatesViewer;
