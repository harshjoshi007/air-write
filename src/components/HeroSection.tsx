import { Hand, Sparkles, Zap, Eye } from 'lucide-react';

const features = [
  {
    icon: Eye,
    title: 'Real-Time Detection',
    description: 'MediaPipe tracks 21 hand landmarks with millisecond precision'
  },
  {
    icon: Hand,
    title: 'Touchless Input',
    description: 'Write letters & numbers in the air without any physical contact'
  },
  {
    icon: Sparkles,
    title: 'Smart Recognition',
    description: 'CNN model classifies strokes into letters (A-Z) & numbers (0-9)'
  },
  {
    icon: Zap,
    title: 'Instant Feedback',
    description: 'See your predictions in real-time as you write'
  }
];

const HeroSection = () => {
  const scrollToApp = () => {
    document.getElementById('app-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden neural-bg">
      {/* Animated background elements */}
      <div className="absolute inset-0 grid-pattern opacity-30" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }} />
      
      <div className="relative z-10 max-w-5xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8 animate-pulse-glow">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium text-primary">Computer Vision + Deep Learning</span>
        </div>

        {/* Main title */}
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold mb-6 tracking-tight">
          <span className="text-foreground">Air</span>
          <span className="gradient-text text-glow">Write</span>
        </h1>

        {/* Subtitle */}
        <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
          Real-time air writing recognition using{' '}
          <span className="text-primary">MediaPipe</span> hand tracking and{' '}
          <span className="text-accent">CNN-based</span> letter & number classification
        </p>

        {/* CTA Button */}
        <button
          onClick={scrollToApp}
          className="group relative px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg transition-all duration-300 hover:scale-105 glow-primary"
        >
          <span className="relative z-10 flex items-center gap-2">
            Start Writing
            <Hand className="w-5 h-5 group-hover:rotate-12 transition-transform" />
          </span>
        </button>

        {/* Features grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-20">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="glass p-6 rounded-2xl hover:border-primary/50 transition-all duration-300 group"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <feature.icon className="w-10 h-10 text-primary mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 rounded-full border-2 border-primary/50 flex items-start justify-center p-2">
          <div className="w-1 h-2 bg-primary rounded-full animate-pulse" />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
