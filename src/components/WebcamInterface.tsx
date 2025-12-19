import { useHandTracking } from '@/hooks/useHandTracking';
import { Camera, CameraOff, Trash2, Sparkles, Loader2, Hand, Pencil, ThumbsUp, Brain } from 'lucide-react';

const gestureInfo = {
  idle: { label: 'No Hand Detected', color: 'text-muted-foreground', icon: Hand },
  ready: { label: 'Open Palm - Ready', color: 'text-yellow-400', icon: Hand },
  writing: { label: 'Writing...', color: 'text-green-400', icon: Pencil },
  predicting: { label: 'Thumbs Up - Predict', color: 'text-accent', icon: ThumbsUp }
};

const WebcamInterface = () => {
  const {
    videoRef,
    canvasRef,
    strokeCanvasRef,
    isTracking,
    isLoading,
    isLstmReady,
    strokes,
    currentStroke,
    predictedLetter,
    confidence,
    gestureState,
    startTracking,
    stopTracking,
    clearCanvas,
    predictLetter
  } = useHandTracking();

  const totalPoints = strokes.reduce((sum, s) => sum + s.points.length, 0) + currentStroke.length;
  const currentGesture = gestureInfo[gestureState];
  const GestureIcon = currentGesture.icon;

  return (
    <section id="app-section" className="min-h-screen py-20 px-4 neural-bg relative">
      <div className="absolute inset-0 grid-pattern opacity-20" />
      
      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Interactive</span> Interface
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Use gestures to control: <span className="text-yellow-400">Open Palm</span> = Ready, 
            <span className="text-green-400"> Point Index</span> = Write, 
            <span className="text-accent"> Thumbs Up</span> = Predict
          </p>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <div className="glass-strong rounded-3xl p-4 overflow-hidden">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-background">
                <video ref={videoRef} className="hidden" playsInline />
                
                <canvas
                  ref={canvasRef}
                  width={1280}
                  height={720}
                  className="w-full h-full object-cover"
                />

                {!isTracking && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm">
                    <div className="w-24 h-24 rounded-full glass flex items-center justify-center mb-6 animate-pulse-glow">
                      <Camera className="w-12 h-12 text-primary" />
                    </div>
                    <h3 className="text-2xl font-semibold mb-2">Camera Not Active</h3>
                    <p className="text-muted-foreground mb-6">Click Start Tracking to begin</p>
                  </div>
                )}

                {isLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm">
                    <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                    <p className="text-lg">Initializing MediaPipe...</p>
                  </div>
                )}

                {isTracking && (
                  <>
                    <div className="absolute top-4 left-4 glass px-4 py-2 rounded-xl">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${gestureState === 'writing' ? 'bg-green-500' : 'bg-primary'} animate-pulse`} />
                        <span className="text-sm font-medium">Live Tracking</span>
                      </div>
                    </div>

                    <div className="absolute top-4 left-1/2 -translate-x-1/2 glass px-6 py-3 rounded-xl">
                      <div className="flex items-center gap-3">
                        <GestureIcon className={`w-5 h-5 ${currentGesture.color}`} />
                        <span className={`font-semibold ${currentGesture.color}`}>
                          {currentGesture.label}
                        </span>
                      </div>
                    </div>

                    <div className="absolute top-4 right-4 glass px-4 py-2 rounded-xl">
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-xs text-muted-foreground">Strokes: </span>
                          <span className="text-primary font-mono">{strokes.length}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Points: </span>
                          <span className="text-primary font-mono">{totalPoints}</span>
                        </div>
                      </div>
                    </div>

                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 glass px-6 py-3 rounded-xl max-w-md">
                      <p className="text-sm text-center">
                        {gestureState === 'idle' && 'Show your hand to the camera'}
                        {gestureState === 'ready' && 'Point with index finger to start writing'}
                        {gestureState === 'writing' && 'Move your finger to draw - strokes appear in GREEN'}
                        {gestureState === 'predicting' && 'Processing your input...'}
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
                {!isTracking ? (
                  <button
                    onClick={startTracking}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed glow-primary"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5" />
                    )}
                    Start Tracking
                  </button>
                ) : (
                  <>
                    <button
                      onClick={stopTracking}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-destructive text-destructive-foreground font-semibold transition-all hover:scale-105"
                    >
                      <CameraOff className="w-5 h-5" />
                      Stop
                    </button>
                    
                    <button
                      onClick={clearCanvas}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl glass hover:bg-secondary transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                      Clear
                    </button>
                    
                    <button
                      onClick={predictLetter}
                      disabled={totalPoints < 10}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-foreground font-semibold transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed glow-accent"
                    >
                      <Sparkles className="w-5 h-5" />
                      Predict
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
            {/* Stroke Preview */}
            <div className="glass-strong rounded-3xl p-6">
              <h3 className="text-lg font-semibold mb-4 text-center">Your Stroke</h3>
              <div className="aspect-square rounded-2xl bg-background border border-border overflow-hidden">
                <canvas
                  ref={strokeCanvasRef}
                  width={200}
                  height={200}
                  className="w-full h-full"
                />
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Normalized preview of your drawing
              </p>
            </div>

            {/* Prediction display */}
            <div className="glass-strong rounded-3xl p-6">
              <h3 className="text-lg font-semibold mb-4 text-center">Prediction</h3>
              <div className="aspect-square rounded-2xl bg-background flex flex-col items-center justify-center border border-border">
                {predictedLetter ? (
                  <>
                    <span className="text-7xl font-bold gradient-text text-glow">
                      {predictedLetter}
                    </span>
                    <div className="mt-4 flex items-center gap-2">
                      <div className="h-2 w-20 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                          style={{ width: `${confidence}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground">{confidence}%</span>
                    </div>
                  </>
                ) : (
                  <span className="text-4xl text-muted-foreground/50">?</span>
                )}
              </div>
              
              {/* LSTM Status */}
              <div className="mt-4 flex items-center justify-center gap-2">
                <Brain className={`w-4 h-4 ${isLstmReady ? 'text-green-400' : 'text-yellow-400 animate-pulse'}`} />
                <span className="text-xs text-muted-foreground">
                  {isLstmReady ? 'LSTM Model Ready' : 'Training LSTM...'}
                </span>
              </div>
            </div>

            {/* Gesture guide */}
            <div className="glass-strong rounded-3xl p-6">
              <h3 className="text-lg font-semibold mb-4">Gesture Guide</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-yellow-400/20 flex items-center justify-center shrink-0">
                    <Hand className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Open Palm</p>
                    <p className="text-xs text-muted-foreground">Ready state</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-400/20 flex items-center justify-center shrink-0">
                    <Pencil className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Point Index Only</p>
                    <p className="text-xs text-muted-foreground">Draw letter/number</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                    <ThumbsUp className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Thumbs Up</p>
                    <p className="text-xs text-muted-foreground">Predict</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WebcamInterface;
