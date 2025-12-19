import * as tf from '@tensorflow/tfjs';

interface TrainingTemplate {
  letter: string;
  points: { x: number; y: number }[];
}

// LSTM Model for handwriting recognition
class LSTMRecognizer {
  private model: tf.LayersModel | null = null;
  private labelEncoder: Map<string, number> = new Map();
  private labelDecoder: Map<number, string> = new Map();
  private isTraining = false;
  private isTrained = false;
  private sequenceLength = 32;

  async initialize(templates: TrainingTemplate[]): Promise<void> {
    if (this.isTraining || this.isTrained) return;
    
    this.isTraining = true;
    console.log('LSTM: Starting training with', templates.length, 'templates');

    // Delay training to let MediaPipe initialize first
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      // Set TensorFlow.js to use CPU to avoid GPU contention with MediaPipe
      await tf.setBackend('cpu');
      
      // Build label encodings
      const uniqueLabels = [...new Set(templates.map(t => t.letter.toUpperCase()))].sort();
      uniqueLabels.forEach((label, idx) => {
        this.labelEncoder.set(label, idx);
        this.labelDecoder.set(idx, label);
      });

      const numClasses = uniqueLabels.length;
      console.log('LSTM: Found', numClasses, 'unique classes');

      // Prepare training data
      const { xs, ys } = this.prepareData(templates, numClasses);

      // Build model
      this.model = this.buildModel(numClasses);
      
      // Train with fewer epochs and yielding to main thread
      await this.model.fit(xs, ys, {
        epochs: 15,
        batchSize: 16,
        validationSplit: 0.1,
        shuffle: true,
        yieldEvery: 'batch', // Yield to main thread between batches
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            console.log(`LSTM: Epoch ${epoch + 1}/15, acc: ${(logs?.acc ?? 0 * 100).toFixed(1)}%`);
          }
        }
      });

      // Cleanup tensors
      xs.dispose();
      ys.dispose();

      this.isTrained = true;
      console.log('LSTM: Training complete');
    } catch (error) {
      console.error('LSTM: Training failed', error);
    } finally {
      this.isTraining = false;
    }
  }

  private buildModel(numClasses: number): tf.LayersModel {
    const model = tf.sequential();

    // Smaller model for faster training and inference
    model.add(tf.layers.lstm({
      units: 32,
      inputShape: [this.sequenceLength, 2],
      returnSequences: false,
      dropout: 0.1,
      // Avoid heavy orthogonal initializer that can stall the main thread
      kernelInitializer: 'glorotUniform',
      recurrentInitializer: 'glorotUniform'
    }));

    model.add(tf.layers.dense({
      units: 32,
      activation: 'relu'
    }));

    model.add(tf.layers.dropout({ rate: 0.2 }));

    model.add(tf.layers.dense({
      units: numClasses,
      activation: 'softmax'
    }));

    model.compile({
      optimizer: tf.train.adam(0.002),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    return model;
  }

  private prepareData(templates: TrainingTemplate[], numClasses: number): { xs: tf.Tensor; ys: tf.Tensor } {
    const sequences: number[][][] = [];
    const labels: number[] = [];

    for (const template of templates) {
      const normalized = this.normalizeSequence(template.points);
      if (normalized.length === this.sequenceLength) {
        sequences.push(normalized.map(p => [p.x, p.y]));
        labels.push(this.labelEncoder.get(template.letter.toUpperCase()) || 0);
        
        // Data augmentation: add variations
        const augmented = this.augmentData(normalized);
        for (const aug of augmented) {
          sequences.push(aug.map(p => [p.x, p.y]));
          labels.push(this.labelEncoder.get(template.letter.toUpperCase()) || 0);
        }
      }
    }

    const xs = tf.tensor3d(sequences);
    const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), numClasses);

    return { xs, ys: ys as tf.Tensor };
  }

  private normalizeSequence(points: { x: number; y: number }[]): { x: number; y: number }[] {
    if (points.length < 2) return [];

    // Find bounds
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    const width = maxX - minX || 1;
    const height = maxY - minY || 1;
    const scale = Math.max(width, height);

    // Normalize to 0-1
    const normalized = points.map(p => ({
      x: (p.x - minX) / scale,
      y: (p.y - minY) / scale
    }));

    // Resample to fixed length
    return this.resamplePoints(normalized, this.sequenceLength);
  }

  private resamplePoints(points: { x: number; y: number }[], targetLength: number): { x: number; y: number }[] {
    if (points.length === 0) return [];
    if (points.length === 1) return Array(targetLength).fill(points[0]);

    const result: { x: number; y: number }[] = [];
    const totalLength = this.calculatePathLength(points);
    const segmentLength = totalLength / (targetLength - 1);

    let currentDist = 0;
    result.push({ ...points[0] });

    for (let i = 1; i < points.length && result.length < targetLength; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const d = Math.sqrt(dx * dx + dy * dy);

      if (currentDist + d >= segmentLength) {
        const t = (segmentLength - currentDist) / d;
        result.push({
          x: points[i - 1].x + t * dx,
          y: points[i - 1].y + t * dy
        });
        currentDist = 0;
      } else {
        currentDist += d;
      }
    }

    while (result.length < targetLength) {
      result.push({ ...points[points.length - 1] });
    }

    return result.slice(0, targetLength);
  }

  private calculatePathLength(points: { x: number; y: number }[]): number {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    return length || 0.001;
  }

  private augmentData(points: { x: number; y: number }[]): { x: number; y: number }[][] {
    // Minimal augmentation - only horizontal mirror (for left/right hand)
    return [
      points.map(p => ({ x: 1 - p.x, y: p.y }))
    ];
  }

  predict(points: { x: number; y: number }[]): { letter: string; confidence: number } | null {
    if (!this.model || !this.isTrained || points.length < 5) {
      return null;
    }

    try {
      const normalized = this.normalizeSequence(points);
      if (normalized.length !== this.sequenceLength) {
        return null;
      }

      const inputData = normalized.map(p => [p.x, p.y]);
      const input = tf.tensor3d([inputData], [1, this.sequenceLength, 2]);
      const prediction = this.model.predict(input) as tf.Tensor;
      const probabilities = prediction.dataSync();
      
      let maxProb = 0;
      let maxIdx = 0;
      for (let i = 0; i < probabilities.length; i++) {
        if (probabilities[i] > maxProb) {
          maxProb = probabilities[i];
          maxIdx = i;
        }
      }

      input.dispose();
      prediction.dispose();

      const letter = this.labelDecoder.get(maxIdx) || '?';
      const confidence = Math.round(maxProb * 100);

      return { letter, confidence };
    } catch (error) {
      console.error('LSTM: Prediction failed', error);
      return null;
    }
  }

  isReady(): boolean {
    return this.isTrained;
  }

  isInitializing(): boolean {
    return this.isTraining;
  }
}

// Singleton instance
export const lstmRecognizer = new LSTMRecognizer();
