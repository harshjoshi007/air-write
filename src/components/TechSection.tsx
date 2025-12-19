import { Brain, Code, Database, Cpu } from 'lucide-react';

const techStack = [
  {
    icon: Cpu,
    name: 'MediaPipe Hands',
    description: 'Real-time hand landmark detection with 21 keypoints',
    color: 'text-primary'
  },
  {
    icon: Brain,
    name: 'TensorFlow.js',
    description: 'Browser-based CNN inference for letter classification',
    color: 'text-accent'
  },
  {
    icon: Code,
    name: 'React + TypeScript',
    description: 'Modern frontend with type safety',
    color: 'text-primary'
  },
  {
    icon: Database,
    name: 'Canvas API',
    description: 'Stroke visualization and image generation',
    color: 'text-accent'
  }
];

const TechSection = () => {
  return (
    <section className="py-20 px-4 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
      
      <div className="relative z-10 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Powered by <span className="gradient-text">Modern Tech</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Built with cutting-edge computer vision and deep learning technologies
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {techStack.map((tech, index) => (
            <div
              key={tech.name}
              className="glass p-6 rounded-2xl hover:border-primary/50 transition-all duration-300 group"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-secondary">
                  <tech.icon className={`w-8 h-8 ${tech.color}`} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">{tech.name}</h3>
                  <p className="text-muted-foreground">{tech.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Architecture diagram */}
        <div className="mt-16 glass-strong rounded-3xl p-8">
          <h3 className="text-2xl font-bold mb-8 text-center">System Architecture</h3>
          
          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            {/* Pipeline steps */}
            {[
              { step: 'Webcam', desc: 'Video Capture' },
              { step: 'MediaPipe', desc: 'Hand Detection' },
              { step: 'Tracker', desc: 'Fingertip Position' },
              { step: 'Canvas', desc: 'Stroke Image' },
              { step: 'CNN', desc: 'Classification' },
              { step: 'Output', desc: 'Predicted Letter' }
            ].map((item, index) => (
              <div key={item.step} className="flex items-center gap-4">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center mb-2">
                    <span className="text-lg font-bold text-primary">{index + 1}</span>
                  </div>
                  <p className="text-sm font-medium">{item.step}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                {index < 5 && (
                  <div className="hidden md:block w-8 h-0.5 bg-gradient-to-r from-primary to-accent" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TechSection;
