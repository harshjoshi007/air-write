import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, CameraOff, Save, Trash2, Loader2, Hand, Pencil, CheckCircle, Download, Upload } from 'lucide-react';
import { saveTrainedTemplate, getTrainedLetterCounts, clearTrainedTemplates, exportTemplates, importTemplates, TrainedTemplate } from '@/lib/trainingStore';
import TrainedTemplatesViewer from './TrainedTemplatesViewer';

interface Point {
  x: number;
  y: number;
  timestamp: number;
}

interface Stroke {
  points: Point[];
}

type GestureState = 'idle' | 'ready' | 'writing' | 'predicting';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const NUMBERS = '0123456789'.split('');

// Normalize points to a fixed-size representation
const normalizePoints = (points: Point[], targetSize: number = 32): { x: number; y: number }[] => {
  if (points.length < 2) return [];

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const scale = Math.max(width, height);

  const normalized = points.map(p => ({
    x: (p.x - minX) / scale,
    y: (p.y - minY) / scale
  }));

  const result: { x: number; y: number }[] = [];
  const totalLength = calculatePathLength(normalized);
  const segmentLength = totalLength / (targetSize - 1);
  
  let currentDist = 0;
  result.push(normalized[0]);
  
  for (let i = 1; i < normalized.length && result.length < targetSize; i++) {
    const dx = normalized[i].x - normalized[i - 1].x;
    const dy = normalized[i].y - normalized[i - 1].y;
    const d = Math.sqrt(dx * dx + dy * dy);
    
    if (currentDist + d >= segmentLength) {
      const t = (segmentLength - currentDist) / d;
      const newPoint = {
        x: normalized[i - 1].x + t * dx,
        y: normalized[i - 1].y + t * dy
      };
      result.push(newPoint);
      currentDist = 0;
    } else {
      currentDist += d;
    }
  }

  while (result.length < targetSize) {
    result.push(normalized[normalized.length - 1]);
  }

  return result.slice(0, targetSize);
};

const calculatePathLength = (points: { x: number; y: number }[]): number => {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
};

// Detect gesture from hand landmarks
const detectGesture = (landmarks: any[]): GestureState => {
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  const ringTip = landmarks[16];
  const pinkyTip = landmarks[20];
  
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const ringMcp = landmarks[13];
  const pinkyMcp = landmarks[17];
  const wrist = landmarks[0];
  
  const indexExtended = indexTip.y < indexMcp.y;
  const middleExtended = middleTip.y < middleMcp.y;
  const ringExtended = ringTip.y < ringMcp.y;
  const pinkyExtended = pinkyTip.y < pinkyMcp.y;
  
  if (indexExtended && middleExtended && ringExtended && pinkyExtended) {
    return 'ready';
  }
  
  if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return 'writing';
  }
  
  const thumbExtended = thumbTip.x < wrist.x;
  if (thumbExtended && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return 'predicting';
  }
  
  return 'idle';
};

// Load MediaPipe scripts
const loadMediaPipeScripts = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if ((window as any).Hands) {
      resolve();
      return;
    }

    const handsScript = document.createElement('script');
    handsScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
    handsScript.crossOrigin = 'anonymous';
    
    handsScript.onload = () => resolve();
    handsScript.onerror = () => reject(new Error('Failed to load MediaPipe Hands'));
    
    document.head.appendChild(handsScript);
  });
};

const TrainingMode = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeCanvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isTracking, setIsTracking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [gestureState, setGestureState] = useState<GestureState>('idle');
  const [selectedLetter, setSelectedLetter] = useState<string>('A');
  const [letterCounts, setLetterCounts] = useState<Record<string, number>>({});
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  
  const wasWritingRef = useRef(false);
  const hasSavedRef = useRef(false);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Point[]>([]);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    currentStrokeRef.current = currentStroke;
  }, [currentStroke]);

  useEffect(() => {
    setLetterCounts(getTrainedLetterCounts());
  }, []);

  const drawStrokePreview = useCallback(() => {
    const canvas = strokeCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const allStrokes = [...strokesRef.current, { points: currentStrokeRef.current }];
    
    allStrokes.forEach((stroke, idx) => {
      if (stroke.points.length < 2) return;
      
      const xs = stroke.points.map(p => p.x);
      const ys = stroke.points.map(p => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      
      const width = maxX - minX || 0.01;
      const height = maxY - minY || 0.01;
      const scale = Math.max(width, height);
      const padding = 10;
      const drawWidth = canvas.width - padding * 2;
      const drawHeight = canvas.height - padding * 2;
      const drawScale = Math.min(drawWidth, drawHeight) / scale;
      
      ctx.beginPath();
      ctx.strokeStyle = idx === allStrokes.length - 1 ? '#00fff7' : 'rgba(0, 255, 247, 0.5)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      const offsetX = padding + (drawWidth - width * drawScale) / 2;
      const offsetY = padding + (drawHeight - height * drawScale) / 2;
      
      ctx.moveTo(
        offsetX + (stroke.points[0].x - minX) * drawScale,
        offsetY + (stroke.points[0].y - minY) * drawScale
      );
      
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(
          offsetX + (stroke.points[i].x - minX) * drawScale,
          offsetY + (stroke.points[i].y - minY) * drawScale
        );
      }
      ctx.stroke();
    });
  }, []);

  const saveCurrentStroke = useCallback(() => {
    const allPoints = [...strokesRef.current.flatMap(s => s.points), ...currentStrokeRef.current];
    
    if (allPoints.length < 10) {
      setSavedMessage('Draw more points first!');
      setTimeout(() => setSavedMessage(null), 2000);
      return;
    }

    const normalized = normalizePoints(allPoints as Point[], 32);
    
    const template: TrainedTemplate = {
      letter: selectedLetter,
      points: normalized,
      createdAt: Date.now()
    };
    
    saveTrainedTemplate(template);
    setLetterCounts(getTrainedLetterCounts());
    
    // Clear strokes after saving
    setStrokes([]);
    setCurrentStroke([]);
    
    const strokeCanvas = strokeCanvasRef.current;
    if (strokeCanvas) {
      const ctx = strokeCanvas.getContext('2d');
      ctx?.clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
    }
    
    setSavedMessage(`Saved "${selectedLetter}" template!`);
    setTimeout(() => setSavedMessage(null), 2000);
  }, [selectedLetter]);

  const drawFrame = useCallback((results: any) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !video) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Draw grid
    ctx.strokeStyle = 'rgba(0, 255, 247, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 50) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i);
      ctx.stroke();
    }

    // Draw previous strokes
    strokesRef.current.forEach((stroke, strokeIndex) => {
      if (stroke.points.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(0, 255, 247, ${Math.max(0.3, 0.8 - strokeIndex * 0.1)})`;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#00fff7';
        ctx.shadowBlur = 15;
        
        ctx.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x * canvas.width, stroke.points[i].y * canvas.height);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    });

    // Draw current stroke
    if (currentStrokeRef.current.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = '#00ff00';
      ctx.shadowBlur = 20;
      
      ctx.moveTo(currentStrokeRef.current[0].x * canvas.width, currentStrokeRef.current[0].y * canvas.height);
      for (let i = 1; i < currentStrokeRef.current.length; i++) {
        ctx.lineTo(currentStrokeRef.current[i].x * canvas.width, currentStrokeRef.current[i].y * canvas.height);
      }
      ctx.stroke();
      
      const lastPoint = currentStrokeRef.current[currentStrokeRef.current.length - 1];
      ctx.beginPath();
      ctx.arc(lastPoint.x * canvas.width, lastPoint.y * canvas.height, 10, 0, 2 * Math.PI);
      ctx.fillStyle = '#00ff00';
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      const gesture = detectGesture(landmarks);
      setGestureState(gesture);
      
      // Draw hand skeleton
      ctx.strokeStyle = 'rgba(0, 255, 247, 0.3)';
      ctx.lineWidth = 2;
      
      const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [0, 9], [9, 10], [10, 11], [11, 12],
        [0, 13], [13, 14], [14, 15], [15, 16],
        [0, 17], [17, 18], [18, 19], [19, 20],
        [5, 9], [9, 13], [13, 17]
      ];

      connections.forEach(([start, end]) => {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];
        ctx.beginPath();
        ctx.moveTo((1 - startPoint.x) * canvas.width, startPoint.y * canvas.height);
        ctx.lineTo((1 - endPoint.x) * canvas.width, endPoint.y * canvas.height);
        ctx.stroke();
      });

      // Draw landmarks
      landmarks.forEach((landmark: any, index: number) => {
        const x = (1 - landmark.x) * canvas.width;
        const y = landmark.y * canvas.height;
        
        const isFingerTip = [4, 8, 12, 16, 20].includes(index);
        const isIndexTip = index === 8;
        
        ctx.beginPath();
        ctx.arc(x, y, isIndexTip ? 14 : isFingerTip ? 8 : 4, 0, 2 * Math.PI);
        
        if (isIndexTip) {
          ctx.fillStyle = gesture === 'writing' ? '#00ff00' : '#00fff7';
          ctx.fill();
          
          ctx.beginPath();
          ctx.arc(x, y, 25, 0, 2 * Math.PI);
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, 25);
          gradient.addColorStop(0, gesture === 'writing' ? 'rgba(0, 255, 0, 0.5)' : 'rgba(0, 255, 247, 0.4)');
          gradient.addColorStop(1, 'rgba(0, 255, 247, 0)');
          ctx.fillStyle = gradient;
          ctx.fill();
        } else {
          ctx.fillStyle = isFingerTip ? 'rgba(0, 255, 247, 0.7)' : 'rgba(0, 255, 247, 0.4)';
          ctx.fill();
        }
      });

      // Handle writing
      const indexTip = landmarks[8];
      const isWriting = gesture === 'writing';
      
      if (isWriting) {
        const newPoint: Point = {
          x: 1 - indexTip.x,
          y: indexTip.y,
          timestamp: Date.now()
        };
        setCurrentStroke(prev => [...prev, newPoint]);
        wasWritingRef.current = true;
        hasSavedRef.current = false;
      } else if (wasWritingRef.current && !isWriting) {
        if (currentStrokeRef.current.length > 5) {
          setStrokes(prev => [...prev, { points: currentStrokeRef.current }]);
        }
        setCurrentStroke([]);
        wasWritingRef.current = false;
      }
      
      // Auto-save on thumbs up gesture
      if (gesture === 'predicting' && !hasSavedRef.current) {
        const allPoints = [...strokesRef.current.flatMap(s => s.points), ...currentStrokeRef.current];
        if (allPoints.length >= 10) {
          saveCurrentStroke();
          hasSavedRef.current = true;
        }
      }
    } else {
      setGestureState('idle');
    }
    
    drawStrokePreview();
  }, [drawStrokePreview, saveCurrentStroke]);

  const startTracking = useCallback(async () => {
    setIsLoading(true);
    
    try {
      await loadMediaPipeScripts();
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' }
      });
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const Hands = (window as any).Hands;
      const hands = new Hands({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
      });

      hands.onResults((results: any) => {
        drawFrame(results);
      });

      handsRef.current = hands;
      
      const detectHands = async () => {
        if (videoRef.current && handsRef.current && videoRef.current.readyState >= 2) {
          await handsRef.current.send({ image: videoRef.current });
        }
        animationRef.current = requestAnimationFrame(detectHands);
      };
      
      detectHands();
      setIsTracking(true);
      
    } catch (error) {
      console.error('Error starting hand tracking:', error);
    } finally {
      setIsLoading(false);
    }
  }, [drawFrame]);

  const stopTracking = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (handsRef.current) {
      handsRef.current.close();
      handsRef.current = null;
    }
    
    setIsTracking(false);
    setStrokes([]);
    setCurrentStroke([]);
    setGestureState('idle');
  }, []);

  const clearCanvas = useCallback(() => {
    setStrokes([]);
    setCurrentStroke([]);
    
    const canvas = strokeCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const handleClearAllTemplates = () => {
    if (confirm('Are you sure you want to delete all trained templates?')) {
      clearTrainedTemplates();
      setLetterCounts({});
    }
  };

  const handleExportTemplates = () => {
    const json = exportTemplates();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `airwrite-templates-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSavedMessage('Templates exported!');
    setTimeout(() => setSavedMessage(null), 2000);
  };

  const handleImportTemplates = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = importTemplates(event.target?.result as string, true);
        if (result.success) {
          setLetterCounts(getTrainedLetterCounts());
          setSavedMessage(`Imported ${result.count} templates!`);
        } else {
          setSavedMessage(result.error || 'Import failed');
        }
        setTimeout(() => setSavedMessage(null), 2000);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  const totalPoints = strokes.reduce((sum, s) => sum + s.points.length, 0) + currentStroke.length;
  const totalTemplates = Object.values(letterCounts).reduce((a, b) => a + b, 0);

  return (
    <section className="min-h-screen py-20 px-4 neural-bg relative">
      <div className="absolute inset-0 grid-pattern opacity-20" />
      
      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Training</span> Mode
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Draw letters (A-Z) or numbers (0-9) and label them to train the recognizer. 
            <span className="text-green-400"> Point Index</span> = Draw, 
            <span className="text-accent"> Thumbs Up</span> = Save Template
          </p>
        </div>

        {/* Letter & Number Selector */}
        <div className="glass-strong rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Select Character to Train</h3>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                Total: <span className="text-primary font-mono">{totalTemplates}</span>
              </span>
              {totalTemplates > 0 && (
                <>
                  <button
                    onClick={handleExportTemplates}
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                    title="Export templates as JSON"
                  >
                    <Download className="w-4 h-4" />
                    Export
                  </button>
                  <button
                    onClick={handleClearAllTemplates}
                    className="text-sm text-destructive hover:underline"
                  >
                    Clear All
                  </button>
                </>
              )}
              <button
                onClick={handleImportTemplates}
                className="flex items-center gap-1 text-sm text-accent hover:underline"
                title="Import templates from JSON"
              >
                <Upload className="w-4 h-4" />
                Import
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {ALPHABET.map(letter => (
              <button
                key={letter}
                onClick={() => setSelectedLetter(letter)}
                className={`w-10 h-10 rounded-lg font-bold transition-all relative ${
                  selectedLetter === letter 
                    ? 'bg-primary text-primary-foreground scale-110' 
                    : 'glass hover:bg-secondary'
                }`}
              >
                {letter}
                {letterCounts[letter] && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-accent-foreground text-xs rounded-full flex items-center justify-center">
                    {letterCounts[letter]}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {NUMBERS.map(num => (
              <button
                key={num}
                onClick={() => setSelectedLetter(num)}
                className={`w-10 h-10 rounded-lg font-bold transition-all relative ${
                  selectedLetter === num 
                    ? 'bg-primary text-primary-foreground scale-110' 
                    : 'glass hover:bg-secondary'
                }`}
              >
                {num}
                {letterCounts[num] && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-accent-foreground text-xs rounded-full flex items-center justify-center">
                    {letterCounts[num]}
                  </span>
                )}
              </button>
            ))}
          </div>
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
                    <h3 className="text-2xl font-semibold mb-2">Training Mode</h3>
                    <p className="text-muted-foreground mb-6">Click Start to begin training</p>
                  </div>
                )}

                {isLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm">
                    <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                    <p className="text-lg">Initializing...</p>
                  </div>
                )}

                {isTracking && (
                  <>
                    <div className="absolute top-4 left-4 glass px-4 py-2 rounded-xl">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${gestureState === 'writing' ? 'bg-green-500' : 'bg-primary'} animate-pulse`} />
                        <span className="text-sm font-medium">Training: {selectedLetter}</span>
                      </div>
                    </div>

                    <div className="absolute top-4 right-4 glass px-4 py-2 rounded-xl">
                      <span className="text-xs text-muted-foreground">Points: </span>
                      <span className="text-primary font-mono">{totalPoints}</span>
                    </div>

                    {savedMessage && (
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 glass-strong px-6 py-4 rounded-xl flex items-center gap-3 animate-pulse">
                        <CheckCircle className="w-6 h-6 text-green-400" />
                        <span className="text-lg font-semibold">{savedMessage}</span>
                      </div>
                    )}
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
                    Start Training
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
                      onClick={saveCurrentStroke}
                      disabled={totalPoints < 10}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-foreground font-semibold transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed glow-accent"
                    >
                      <Save className="w-5 h-5" />
                      Save as "{selectedLetter}"
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
                Normalized preview
              </p>
            </div>

            {/* Current Letter */}
            <div className="glass-strong rounded-3xl p-6">
              <h3 className="text-lg font-semibold mb-4 text-center">Training Letter</h3>
              <div className="aspect-square rounded-2xl bg-background flex flex-col items-center justify-center border border-border">
                <span className="text-7xl font-bold gradient-text text-glow">
                  {selectedLetter}
                </span>
                <span className="text-sm text-muted-foreground mt-2">
                  {letterCounts[selectedLetter] || 0} samples
                </span>
              </div>
            </div>

            {/* Saved Templates Viewer */}
            <TrainedTemplatesViewer 
              selectedLetter={selectedLetter} 
              onTemplatesChange={() => setLetterCounts(getTrainedLetterCounts())}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default TrainingMode;
