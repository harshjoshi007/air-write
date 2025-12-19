import { useRef, useEffect, useState, useCallback } from 'react';
import { getTrainedTemplates } from '@/lib/trainingStore';
import { lstmRecognizer } from '@/lib/lstmModel';
import defaultTemplatesData from '@/data/defaultTemplates.json';

interface Point {
  x: number;
  y: number;
  timestamp: number;
}

interface Stroke {
  points: Point[];
}

type GestureState = 'idle' | 'ready' | 'writing' | 'predicting';

interface UseHandTrackingReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  strokeCanvasRef: React.RefObject<HTMLCanvasElement>;
  isTracking: boolean;
  isLoading: boolean;
  isLstmReady: boolean;
  strokes: Stroke[];
  currentStroke: Point[];
  predictedLetter: string | null;
  confidence: number;
  gestureState: GestureState;
  startTracking: () => void;
  stopTracking: () => void;
  clearCanvas: () => void;
  predictLetter: () => void;
}

interface StrokeFeatures {
  aspectRatio: number;
  numDirectionChanges: number;
  totalAngle: number;
  startQuadrant: number;
  endQuadrant: number;
  hasLoop: boolean;
  strokeCount: number;
  verticalBias: number;
  horizontalBias: number;
  diagonalBias: number;
  centerOfMassX: number;
  centerOfMassY: number;
}

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

  // Normalize to 0-1 range maintaining aspect ratio
  const normalized = points.map(p => ({
    x: (p.x - minX) / scale,
    y: (p.y - minY) / scale
  }));

  // Resample to fixed number of points
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

  // Fill remaining points if needed
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

// Calculate distance between two normalized point sequences
const calculateDistance = (a: { x: number; y: number }[], b: { x: number; y: number }[]): number => {
  if (a.length !== b.length || a.length === 0) return Infinity;
  
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const dx = a[i].x - b[i].x;
    const dy = a[i].y - b[i].y;
    sum += Math.sqrt(dx * dx + dy * dy);
  }
  return sum / a.length;
};

// Lazy-loaded normalized templates
let normalizedTemplates: Record<string, { x: number; y: number }[][]> | null = null;

const getNormalizedTemplates = (): Record<string, { x: number; y: number }[][]> => {
  if (normalizedTemplates) return normalizedTemplates;
  
  // Transform array format to record format
  const LETTER_TEMPLATES: Record<string, { x: number; y: number }[][]> = {};
  const templates = defaultTemplatesData as { letter: string; points: { x: number; y: number }[] }[];
  
  console.log('Loading templates from JSON, count:', templates.length);
  
  templates.forEach(template => {
    const letter = template.letter.toUpperCase();
    if (!LETTER_TEMPLATES[letter]) {
      LETTER_TEMPLATES[letter] = [];
    }
    LETTER_TEMPLATES[letter].push(template.points);
  });

  // Normalize templates
  normalizedTemplates = {};
  for (const [letter, letterTemplates] of Object.entries(LETTER_TEMPLATES)) {
    normalizedTemplates[letter] = letterTemplates.map(t => {
      const points = t.map((p, i) => ({ ...p, timestamp: i }));
      return normalizePoints(points as Point[], 32);
    });
  }
  
  console.log('Normalized templates for letters:', Object.keys(normalizedTemplates));
  return normalizedTemplates;
};

// Initialize LSTM model with templates
let lstmInitialized = false;
const initializeLSTM = () => {
  if (lstmInitialized) return;
  lstmInitialized = true;
  
  const templates = defaultTemplatesData as { letter: string; points: { x: number; y: number }[] }[];
  const trainedTemplates = getTrainedTemplates();
  const allTemplates = [
    ...templates,
    ...trainedTemplates.map(t => ({ letter: t.letter, points: t.points }))
  ];
  
  lstmRecognizer.initialize(allTemplates);
};

// Letter recognition using LSTM + template matching hybrid
const recognizeLetter = (allPoints: Point[]): { letter: string; confidence: number } => {
  if (allPoints.length < 5) {
    return { letter: '?', confidence: 0 };
  }

  // Try LSTM first if available
  const lstmResult = lstmRecognizer.predict(allPoints.map(p => ({ x: p.x, y: p.y })));
  
  // Template matching as fallback/comparison
  const inputNormalized = normalizePoints(allPoints, 32);
  if (inputNormalized.length === 0) {
    return lstmResult || { letter: '?', confidence: 0 };
  }

  // Also try mirrored version (for left-handed or camera mirroring)
  const inputMirrored = inputNormalized.map(p => ({ x: 1 - p.x, y: p.y }));
  
  // Also try flipped Y (sometimes webcam inverts)
  const inputFlippedY = inputNormalized.map(p => ({ x: p.x, y: 1 - p.y }));
  const inputMirroredFlippedY = inputNormalized.map(p => ({ x: 1 - p.x, y: 1 - p.y }));

  const candidates = [inputNormalized, inputMirrored, inputFlippedY, inputMirroredFlippedY];

  let bestLetter = '?';
  let bestDistance = Infinity;

  // First, check trained templates (higher priority)
  const trainedTemplates = getTrainedTemplates();
  for (const trained of trainedTemplates) {
    for (const candidate of candidates) {
      const dist = calculateDistance(candidate, trained.points);
      // Trained templates get a slight boost (multiply distance by 0.9)
      const adjustedDist = dist * 0.9;
      if (adjustedDist < bestDistance) {
        bestDistance = adjustedDist;
        bestLetter = trained.letter;
      }
    }
  }

  // Then check default templates (lazy loaded)
  const defaultNormalized = getNormalizedTemplates();
  for (const [letter, templates] of Object.entries(defaultNormalized)) {
    for (const template of templates) {
      for (const candidate of candidates) {
        const dist = calculateDistance(candidate, template);
        if (dist < bestDistance) {
          bestDistance = dist;
          bestLetter = letter;
        }
      }
    }
  }

  // Convert distance to confidence for template matching
  const templateConfidence = Math.max(0, Math.min(100, Math.round((1 - bestDistance / 0.4) * 100)));
  
  // If LSTM is ready and confident, prefer it; otherwise use template
  if (lstmResult && lstmResult.confidence > 60) {
    // If both agree, boost confidence
    if (lstmResult.letter === bestLetter) {
      return { letter: lstmResult.letter, confidence: Math.min(100, Math.max(lstmResult.confidence, templateConfidence) + 10) };
    }
    // If LSTM is very confident, use it
    if (lstmResult.confidence > 75) {
      return lstmResult;
    }
  }
  
  // Default to template matching
  return { letter: bestLetter, confidence: templateConfidence };
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

// Load MediaPipe scripts dynamically
const loadMediaPipeScripts = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if ((window as any).Hands) {
      resolve();
      return;
    }

    const handsScript = document.createElement('script');
    handsScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
    handsScript.crossOrigin = 'anonymous';
    
    handsScript.onload = () => {
      console.log('MediaPipe Hands loaded');
      resolve();
    };
    
    handsScript.onerror = () => {
      reject(new Error('Failed to load MediaPipe Hands'));
    };
    
    document.head.appendChild(handsScript);
  });
};

export const useHandTracking = (): UseHandTrackingReturn => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeCanvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isTracking, setIsTracking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLstmReady, setIsLstmReady] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [predictedLetter, setPredictedLetter] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [gestureState, setGestureState] = useState<GestureState>('idle');
  const wasWritingRef = useRef(false);
  const hasPredictedRef = useRef(false);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Point[]>([]);

  // Check LSTM status periodically (training is triggered on startTracking)
  useEffect(() => {
    const checkLstm = setInterval(() => {
      if (lstmRecognizer.isReady()) {
        setIsLstmReady(true);
        clearInterval(checkLstm);
      }
    }, 500);
    
    return () => clearInterval(checkLstm);
  }, []);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    currentStrokeRef.current = currentStroke;
  }, [currentStroke]);

  // Draw stroke on separate canvas for preview
  const drawStrokePreview = useCallback(() => {
    const canvas = strokeCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw all strokes
    const allStrokes = [...strokesRef.current, { points: currentStrokeRef.current }];
    
    allStrokes.forEach((stroke, idx) => {
      if (stroke.points.length < 2) return;
      
      // Normalize to canvas
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

  const predictLetter = useCallback(() => {
    const allPoints = [...strokesRef.current.flatMap(s => s.points), ...currentStrokeRef.current];
    
    if (allPoints.length < 10) {
      setPredictedLetter(null);
      setConfidence(0);
      return;
    }
    
    const result = recognizeLetter(allPoints);
    console.log('Recognition result:', result);
    
    setPredictedLetter(result.letter);
    setConfidence(result.confidence);
    
    // Update stroke preview
    drawStrokePreview();
  }, [drawStrokePreview]);

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
        hasPredictedRef.current = false; // Reset prediction flag when writing
      } else if (wasWritingRef.current && !isWriting) {
        if (currentStrokeRef.current.length > 5) {
          setStrokes(prev => [...prev, { points: currentStrokeRef.current }]);
        }
        setCurrentStroke([]);
        wasWritingRef.current = false;
      }
      
      // Auto-predict on thumbs up gesture
      if (gesture === 'predicting' && !hasPredictedRef.current) {
        const allPoints = [...strokesRef.current.flatMap(s => s.points), ...currentStrokeRef.current];
        if (allPoints.length >= 10) {
          const result = recognizeLetter(allPoints);
          console.log('Auto-predict result:', result);
          setPredictedLetter(result.letter);
          setConfidence(result.confidence);
          hasPredictedRef.current = true;
        }
      }
    } else {
      setGestureState('idle');
    }
    
    // Update stroke preview
    drawStrokePreview();
  }, [drawStrokePreview]);

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
    setPredictedLetter(null);
    setConfidence(0);
    setGestureState('idle');

    // Train LSTM only after tracking stops (avoid camera lag)
    if (!lstmRecognizer.isReady()) {
      const idle = (window as any).requestIdleCallback as
        | ((cb: () => void, opts?: { timeout: number }) => number)
        | undefined;

      if (idle) {
        idle(() => initializeLSTM(), { timeout: 3000 });
      } else {
        setTimeout(() => initializeLSTM(), 0);
      }
    }
  }, []);

  const clearCanvas = useCallback(() => {
    setStrokes([]);
    setCurrentStroke([]);
    setPredictedLetter(null);
    setConfidence(0);
    
    const canvas = strokeCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  return {
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
  };
};
