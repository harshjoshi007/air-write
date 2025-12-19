// Training data storage using localStorage

export interface TrainedTemplate {
  letter: string;
  points: { x: number; y: number }[];
  createdAt: number;
}

const STORAGE_KEY = 'airwrite-trained-templates';

export const getTrainedTemplates = (): TrainedTemplate[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const saveTrainedTemplate = (template: TrainedTemplate): void => {
  const templates = getTrainedTemplates();
  templates.push(template);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
};

export const getTemplatesForLetter = (letter: string): TrainedTemplate[] => {
  return getTrainedTemplates().filter(t => t.letter === letter.toUpperCase());
};

export const getTrainedLetterCounts = (): Record<string, number> => {
  const templates = getTrainedTemplates();
  const counts: Record<string, number> = {};
  templates.forEach(t => {
    counts[t.letter] = (counts[t.letter] || 0) + 1;
  });
  return counts;
};

export const clearTrainedTemplates = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

export const deleteTemplatesForLetter = (letter: string): void => {
  const templates = getTrainedTemplates().filter(t => t.letter !== letter.toUpperCase());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
};

export const deleteTemplateByIndex = (letter: string, createdAt: number): void => {
  const templates = getTrainedTemplates().filter(
    t => !(t.letter === letter.toUpperCase() && t.createdAt === createdAt)
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
};

export const exportTemplates = (): string => {
  const templates = getTrainedTemplates();
  return JSON.stringify(templates, null, 2);
};

export const importTemplates = (jsonString: string, merge: boolean = true): { success: boolean; count: number; error?: string } => {
  try {
    const imported = JSON.parse(jsonString) as TrainedTemplate[];
    
    if (!Array.isArray(imported)) {
      return { success: false, count: 0, error: 'Invalid format: expected an array' };
    }
    
    // Validate each template
    for (const template of imported) {
      if (!template.letter || !template.points || !Array.isArray(template.points)) {
        return { success: false, count: 0, error: 'Invalid template format' };
      }
    }
    
    if (merge) {
      const existing = getTrainedTemplates();
      const merged = [...existing, ...imported];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
    }
    
    return { success: true, count: imported.length };
  } catch (e) {
    return { success: false, count: 0, error: 'Failed to parse JSON' };
  }
};
