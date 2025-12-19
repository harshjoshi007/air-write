import { useState } from 'react';
import HeroSection from '@/components/HeroSection';
import WebcamInterface from '@/components/WebcamInterface';
import TrainingMode from '@/components/TrainingMode';
import TechSection from '@/components/TechSection';
import Footer from '@/components/Footer';
import { Pencil, GraduationCap } from 'lucide-react';

const Index = () => {
  const [mode, setMode] = useState<'recognize' | 'train'>('recognize');

  return (
    <main className="min-h-screen bg-background">
      <HeroSection />
      
      {/* Mode Toggle */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setMode('recognize')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all ${
                mode === 'recognize' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'glass hover:bg-secondary'
              }`}
            >
              <Pencil className="w-4 h-4" />
              Recognize
            </button>
            <button
              onClick={() => setMode('train')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all ${
                mode === 'train' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'glass hover:bg-secondary'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              Train Model
            </button>
          </div>
        </div>
      </div>

      {mode === 'recognize' ? <WebcamInterface /> : <TrainingMode />}
      <TechSection />
      <Footer />
    </main>
  );
};

export default Index;
