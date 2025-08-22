import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Upload, Download, Copy, FileText, Gift, Zap, AlertCircle } from 'lucide-react';
import '../styles/VoucherLotteryMachine.css';
import mascotImage from '../assets/mascot_uv.svg';

const VoucherLotteryMachine = () => {
  const [voucherData, setVoucherData] = useState('');
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState('');
  const [showWinner, setShowWinner] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [selectedBallIndex, setSelectedBallIndex] = useState(-1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ 
    lines: 0, 
    vouchers: 0, 
    percentage: 0,
    chunksProcessed: 0,
    totalChunks: 0
  });
  const [fileInfo, setFileInfo] = useState({ name: '', size: 0 });
  const [ballsKey, setBallsKey] = useState(0);
  const [voucherCount, setVoucherCount] = useState(0);
  const [isLargeDataset, setIsLargeDataset] = useState(false);
  
  const fileInputRef = useRef(null);
  const voucherListRef = useRef([]);
  const workerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Quick text processing for small datasets (< 10K lines)
  const processVoucherTextQuick = useCallback((text) => {
    if (!text || text.trim() === '') return [];
    
    // Count lines first to determine processing method
    const lineCount = (text.match(/\n/g) || []).length + 1;
    if (lineCount > 10000) {
      return null; // Use worker for large datasets
    }
    
    // Fast processing for small datasets
    let normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedText.split('\n');
    const vouchers = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') continue;
      
      if (line.includes(',')) {
        const parts = line.split(',');
        for (let j = 0; j < parts.length; j++) {
          const voucher = parts[j].trim();
          if (voucher !== '') {
            vouchers.push(voucher);
          }
        }
      } else {
        vouchers.push(line);
      }
    }
    
    return vouchers;
  }, []);

  // Enhanced Web Worker with streaming and chunked processing
  useEffect(() => {
    const workerCode = `
      // Enhanced streaming processor with better progress tracking
      class StreamProcessor {
        constructor() {
          this.vouchers = [];
          this.buffer = '';
          this.processedLines = 0;
          this.processedChunks = 0;
          this.totalEstimatedLines = 0;
          this.chunkSize = 10000;
          this.lastProgressReport = 0;
        }
        
        setTotalEstimatedLines(estimate) {
          this.totalEstimatedLines = estimate;
        }
        
        processChunk(text, isLast = false, chunkIndex = 0, totalChunks = 0) {
          this.processedChunks++;
          
          // Add to buffer
          this.buffer += text;
          
          // Process complete lines only
          const lines = this.buffer.split('\\n');
          
          // Keep incomplete line in buffer (unless it's the last chunk)
          if (!isLast && lines.length > 0) {
            this.buffer = lines.pop();
          } else {
            this.buffer = '';
          }
          
          // Process complete lines in this chunk
          let vouchersInChunk = 0;
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '') continue;
            
            if (line.indexOf(',') > -1) {
              const parts = line.split(',');
              for (let j = 0; j < parts.length; j++) {
                const voucher = parts[j].trim();
                if (voucher !== '') {
                  this.vouchers.push(voucher);
                  vouchersInChunk++;
                }
              }
            } else {
              this.vouchers.push(line);
              vouchersInChunk++;
            }
            
            this.processedLines++;
          }
          
          // Report progress more frequently for better UX
          const now = Date.now();
          if (now - this.lastProgressReport > 500 || isLast) { // Every 500ms or final
            const progressPercentage = totalChunks > 0 ? (chunkIndex + 1) / totalChunks * 100 : 0;
            
            self.postMessage({
              type: 'PROGRESS',
              processed: this.processedLines,
              voucherCount: this.vouchers.length,
              chunkIndex: chunkIndex + 1,
              totalChunks: totalChunks,
              progressPercentage: Math.min(progressPercentage, 100),
              vouchersInLastChunk: vouchersInChunk
            });
            
            this.lastProgressReport = now;
          }
        }
        
        getResult() {
          return this.vouchers;
        }
      }
      
      let processor = null;
      
      self.onmessage = function(e) {
        const data = e.data;
        
        if (data.type === 'START_PROCESSING') {
          processor = new StreamProcessor();
          self.postMessage({ type: 'PROCESSING_STARTED' });
        }
        
        if (data.type === 'PROCESS_CHUNK') {
          if (processor) {
            processor.processChunk(
              data.chunk, 
              data.isLast, 
              data.chunkIndex || 0, 
              data.totalChunks || 0
            );
            
            if (data.isLast) {
              const vouchers = processor.getResult();
              self.postMessage({
                type: 'PROCESSING_COMPLETE',
                vouchers: vouchers,
                totalVouchers: vouchers.length
              });
              processor = null;
            }
          }
        }
        
        if (data.type === 'PROCESS_SMALL') {
          // For small datasets, process normally
          try {
            const text = data.text;
            let normalizedText = text;
            
            while (normalizedText.indexOf('\\r\\n') > -1) {
              normalizedText = normalizedText.replace('\\r\\n', '\\n');
            }
            while (normalizedText.indexOf('\\r') > -1) {
              normalizedText = normalizedText.replace('\\r', '\\n');
            }
            
            const lines = normalizedText.split('\\n');
            const vouchers = [];
            
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              if (line === '') continue;
              
              if (line.indexOf(',') > -1) {
                const parts = line.split(',');
                for (let j = 0; j < parts.length; j++) {
                  const voucher = parts[j].trim();
                  if (voucher !== '') {
                    vouchers.push(voucher);
                  }
                }
              } else {
                vouchers.push(line);
              }
            }
            
            self.postMessage({
              type: 'PROCESSING_COMPLETE',
              vouchers: vouchers,
              totalVouchers: vouchers.length
            });
          } catch (error) {
            self.postMessage({
              type: 'ERROR',
              error: error.message
            });
          }
        }
        
        if (data.type === 'SELECT_WINNER') {
          try {
            const vouchers = data.vouchers;
            if (vouchers.length === 0) {
              throw new Error('No vouchers available');
            }
            
            const randomIndex = Math.floor(Math.random() * vouchers.length);
            const winner = vouchers[randomIndex];
            
            self.postMessage({
              type: 'WINNER_SELECTED',
              winner: winner,
              index: randomIndex
            });
          } catch (error) {
            self.postMessage({
              type: 'ERROR',
              error: error.message
            });
          }
        }
        
        if (data.type === 'ABORT') {
          processor = null;
          self.postMessage({ type: 'ABORTED' });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    workerRef.current = new Worker(URL.createObjectURL(blob));

    workerRef.current.onmessage = (e) => {
      const { 
        type, 
        vouchers, 
        processed, 
        voucherCount, 
        winner, 
        error, 
        totalVouchers,
        chunkIndex,
        totalChunks,
        progressPercentage
      } = e.data;
      
      if (type === 'PROCESSING_STARTED') {
        setProcessingProgress({ 
          lines: 0, 
          vouchers: 0, 
          percentage: 0,
          chunksProcessed: 0,
          totalChunks: 0
        });
      }
      
      if (type === 'PROGRESS') {
        setProcessingProgress({
          lines: processed || 0,
          vouchers: voucherCount || 0,
          percentage: progressPercentage || 0,
          chunksProcessed: chunkIndex || 0,
          totalChunks: totalChunks || 0
        });
        setVoucherCount(voucherCount || 0);
      }
      
      if (type === 'PROCESSING_COMPLETE') {
        voucherListRef.current = vouchers;
        setVoucherCount(totalVouchers);
        setIsProcessing(false);
        setProcessingProgress({ 
          lines: 0, 
          vouchers: 0, 
          percentage: 100,
          chunksProcessed: 0,
          totalChunks: 0
        });
        setBallsKey(prev => prev + 1);
        
        console.log(`✅ Successfully processed ${totalVouchers} vouchers`);
        
        // Show completion notification for large datasets
        if (totalVouchers > 50000) {
          alert(`🎉 Berhasil memproses ${totalVouchers.toLocaleString()} voucher! Siap untuk undian.`);
        }
      }
      
      if (type === 'WINNER_SELECTED') {
        setWinner(winner);
        setSelectedBallIndex(Math.floor(Math.random() * 6));
        setIsSpinning(false);
        
        setTimeout(() => {
          setShowWinner(true);
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 5000);
        }, 1000);
      }
      
      if (type === 'ERROR') {
        console.error('Worker error:', error);
        setIsSpinning(false);
        setIsProcessing(false);
        setProcessingProgress({ 
          lines: 0, 
          vouchers: 0, 
          percentage: 0,
          chunksProcessed: 0,
          totalChunks: 0
        });
        alert('❌ Terjadi kesalahan saat memproses data: ' + error);
      }
      
      if (type === 'ABORTED') {
        setIsProcessing(false);
        setProcessingProgress({ 
          lines: 0, 
          vouchers: 0, 
          percentage: 0,
          chunksProcessed: 0,
          totalChunks: 0
        });
        console.log('🛑 Processing aborted by user');
      }
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  // Enhanced file processing with better progress tracking
  const processFileStreaming = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const chunkSize = 1024 * 1024; // 1MB chunks
      const totalChunks = Math.ceil(file.size / chunkSize);
      let chunkIndex = 0;
      
      // Start processing
      workerRef.current.postMessage({ type: 'START_PROCESSING' });
      
      const readNextChunk = () => {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const slice = file.slice(start, end);
        const reader = new FileReader();
        
        reader.onload = (e) => {
          const chunk = e.target.result;
          const isLast = end >= file.size;
          
          workerRef.current.postMessage({
            type: 'PROCESS_CHUNK',
            chunk: chunk,
            isLast: isLast,
            chunkIndex: chunkIndex,
            totalChunks: totalChunks
          });
          
          if (!isLast) {
            chunkIndex++;
            // Use setTimeout to prevent blocking and allow progress updates
            setTimeout(readNextChunk, 50);
          } else {
            resolve();
          }
        };
        
        reader.onerror = reject;
        reader.readAsText(slice, 'UTF-8');
      };
      
      readNextChunk();
    });
  }, []);

  // Memoized voucher stats
  const voucherStats = useMemo(() => {
    return {
      count: voucherCount,
      hasData: voucherCount > 0
    };
  }, [voucherCount]);

  // Lottery balls generation (optimized)
  const lotteryBalls = useMemo(() => {
    const ballColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', 
      '#96CEB4', '#FFEAA7', '#DDA0DD'
    ];
    
    const balls = [];
    const vouchers = voucherListRef.current;
    
    for (let i = 0; i < 6; i++) {
      let sampleVoucher;
      if (vouchers.length > 0) {
        // Sample from first 100 vouchers for better performance
        const sampleSize = Math.min(vouchers.length, 100);
        const randomIndex = Math.floor(Math.random() * sampleSize);
        sampleVoucher = vouchers[randomIndex];
      } else {
        sampleVoucher = `UGP00025-20241007-${String(Math.floor(Math.random() * 1000) + 38563).padStart(6, '0')}`;
      }
      
      balls.push({
        id: i,
        voucher: sampleVoucher,
        color: ballColors[i],
        glowColor: ballColors[i] + '80'
      });
    }
    return balls;
  }, [ballsKey, voucherStats.hasData]);

  // Memoized 3D Ball Component
  const LotteryBall = React.memo(({ ball, index, isSelected, isSpinning }) => (
    <div 
      className={`lottery-ball ${isSpinning ? 'spinning' : ''} ${isSelected ? 'selected' : ''}`}
      style={{
        '--ball-color': ball.color,
        '--glow-color': ball.glowColor,
        '--delay': `${index * 0.2}s`
      }}
    >
      <div className="ball-inner">
        <div className="ball-surface">
          <div className="ball-highlight"></div>
          <div className="ball-content">
            <div className="voucher-text">
              {ball.voucher.length > 12 ? ball.voucher.substring(0, 12) + '...' : ball.voucher}
            </div>
          </div>
        </div>
      </div>
    </div>
  ));

  // Optimized confetti creation
  const confettiArray = useMemo(() => {
    const confetti = [];
    for (let i = 0; i < 40; i++) {
      confetti.push({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 3,
        color: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][Math.floor(Math.random() * 6)]
      });
    }
    return confetti;
  }, []);

  // Spin handler
  const handleSpin = useCallback(() => {
    if (voucherStats.count === 0) {
      alert('Yuk masukkan kode voucher dulu biar bisa ikutan undian!');
      return;
    }

    setIsSpinning(true);
    setShowWinner(false);
    setWinner('');
    setShowConfetti(false);
    setSelectedBallIndex(-1);

    setTimeout(() => {
      workerRef.current.postMessage({
        type: 'SELECT_WINNER',
        vouchers: voucherListRef.current
      });
    }, 4000);
  }, [voucherStats.count]);

  // Enhanced file upload with streaming for large files
  const handleFileUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Reset states
    setIsProcessing(true);
    setProcessingProgress({ 
      lines: 0, 
      vouchers: 0, 
      percentage: 0,
      chunksProcessed: 0,
      totalChunks: 0
    });
    setVoucherCount(0);
    setFileInfo({ name: file.name, size: file.size });

    // 500MB limit (increased for large datasets)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('❌ File terlalu besar! Maximum 500MB.');
      setIsProcessing(false);
      setProcessingProgress({ 
        lines: 0, 
        vouchers: 0, 
        percentage: 0,
        chunksProcessed: 0,
        totalChunks: 0
      });
      return;
    }

    // Check if it's a large dataset
    const isLarge = file.size > 10 * 1024 * 1024; // > 10MB
    setIsLargeDataset(isLarge);

    try {
      if (isLarge) {
        console.log(`🚀 Processing large file (${(file.size / 1024 / 1024).toFixed(2)}MB) with streaming...`);
        await processFileStreaming(file);
      } else {
        console.log('🔄 Processing small file with standard method...');
        const text = await file.text();
        
        const quickResult = processVoucherTextQuick(text);
        if (quickResult) {
          // Small dataset, process immediately
          voucherListRef.current = quickResult;
          setVoucherCount(quickResult.length);
          setIsProcessing(false);
          setBallsKey(prev => prev + 1);
        } else {
          // Use worker even for medium datasets
          workerRef.current.postMessage({
            type: 'PROCESS_SMALL',
            text: text
          });
        }
      }
    } catch (error) {
      console.error('File processing error:', error);
      alert('❌ Gagal memproses file: ' + error.message);
      setIsProcessing(false);
      setProcessingProgress({ 
        lines: 0, 
        vouchers: 0, 
        percentage: 0,
        chunksProcessed: 0,
        totalChunks: 0
      });
    }
  }, [processVoucherTextQuick, processFileStreaming]);

  // Abort processing function
  const abortProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'ABORT' });
    }
    setIsProcessing(false);
    setProcessingProgress({ 
      lines: 0, 
      vouchers: 0, 
      percentage: 0,
      chunksProcessed: 0,
      totalChunks: 0
    });
  }, []);

  // Template download
  const downloadTemplate = useCallback(() => {
    const template = `UGP00025-20241007-038563,UGP00025-20241007-038564,UGP00025-20241007-038565
UGP00025-20241007-038566,UGP00025-20241007-038567,UGP00025-20241007-038568
UGP00025-20241007-038569,UGP00025-20241007-038570,UGP00025-20241007-038571`;
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voucher_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Sample vouchers
  const sampleVouchers = useMemo(() => `UGP00025-20241007-038563
UGP00025-20241007-038564
UGP00025-20241007-038565
UGP00025-20241007-038566
UGP00025-20241007-038567
UGP00025-20241007-038568
UGP00025-20241007-038569
UGP00025-20241007-038570
UGP00025-20241007-038571
UGP00025-20241007-038572
UGP00025-20241007-038573
UGP00025-20241007-038574
UGP00025-20241007-038575
UGP00025-20241007-038576
UGP00025-20241007-038577
UGP00025-20241007-038578
UGP00025-20241007-038579
UGP00025-20241007-038580
UGP00025-20241007-038581
UGP00025-20241007-038582
UGP00025-20241007-038583
UGP00025-20241007-038584
UGP00025-20241007-038585
UGP00025-20241007-038586
UGP00025-20241007-038587
UGP00025-20241007-038588
UGP00025-20241007-038589
UGP00025-20241007-038590
UGP00025-20241007-038591
UGP00025-20241007-038592`, []);

  // Optimized text change handler
  const handleTextChange = useCallback((e) => {
    const value = e.target.value;
    setVoucherData(value);
    
    // Quick processing for small text input
    const quickResult = processVoucherTextQuick(value);
    if (quickResult) {
      voucherListRef.current = quickResult;
      setVoucherCount(quickResult.length);
      if (value.trim()) {
        setBallsKey(prev => prev + 1);
      }
    }
  }, [processVoucherTextQuick]);

  // Format number for display
  const formatNumber = useCallback((num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
  }, []);

  return (
    <div className="lottery-container">
      <div className="city-background"></div>
      
      {showConfetti && (
        <div className="confetti-container">
          {confettiArray.map((conf) => (
            <div
              key={conf.id}
              className="confetti-piece"
              style={{
                left: `${conf.left}%`,
                animationDelay: `${conf.delay}s`,
                backgroundColor: conf.color
              }}
            />
          ))}
        </div>
      )}

      {/* Processing Progress Modal */}
      {isProcessing && (
        <div className="processing-modal">
          <div className="processing-content">
            <div className="processing-header">
              <Zap className="processing-icon" size={32} />
              <h3>Memproses Data Voucher</h3>
            </div>
            
            <div className="processing-stats">
              <div className="stat-item">
                <span className="stat-label">File:</span>
                <span className="stat-value">{fileInfo.name}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Ukuran:</span>
                <span className="stat-value">{(fileInfo.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Voucher Diproses:</span>
                <span className="stat-value">{formatNumber(processingProgress.vouchers)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Baris Diproses:</span>
                <span className="stat-value">{formatNumber(processingProgress.lines)}</span>
              </div>
              {processingProgress.totalChunks > 0 && (
                <div className="stat-item">
                  <span className="stat-label">Chunk Progress:</span>
                  <span className="stat-value">
                    {processingProgress.chunksProcessed}/{processingProgress.totalChunks}
                  </span>
                </div>
              )}
            </div>
            
            <div className="processing-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ 
                    width: `${Math.max(processingProgress.percentage, 10)}%`,
                    animation: processingProgress.percentage > 0 ? 'pulse 2s infinite' : 'none'
                  }}
                ></div>
              </div>
              <div className="progress-text">
                {processingProgress.percentage > 0 
                  ? `${Math.round(processingProgress.percentage)}% - ${formatNumber(processingProgress.vouchers)} vouchers processed`
                  : isLargeDataset 
                    ? '🚀 Streaming processor aktif untuk dataset besar...' 
                    : '⚡ Memproses data...'
                }
              </div>
            </div>
            
            <div className="processing-tips">
              <AlertCircle size={16} />
              <span>
                {isLargeDataset 
                  ? 'Dataset besar terdeteksi. Menggunakan teknologi streaming untuk performa optimal.'
                  : 'Harap tunggu, data sedang diproses...'}
              </span>
            </div>
            
            <button 
              onClick={abortProcessing}
              className="abort-button"
            >
              Batalkan
            </button>
          </div>
        </div>
      )}

      {showWinner && (
        <div className="winner-display">
          <div className="winner-text">🎉 SELAMAT! VOUCHER BERUNTUNG! 🎉</div>
          <div className="winner-voucher">{winner}</div>
          <div className="winner-buttons">
            <button
              onClick={() => navigator.clipboard.writeText(winner)}
              className="copy-button"
            >
              <Copy size={16} />
              Salin Kode
            </button>
            <button
              onClick={() => setShowWinner(false)}
              className="close-button"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      <div className="main-container">
        <div className="header">
          <h1 className="main-title">
            GIFT CARDNYA MILIARDER
          </h1>
          <p className="subtitle">✨ Undian Voucher Berhadiah Spektakuler ✨</p>
        </div>

        <div className="content-grid">
          <div className="mascot-section">
            <div className="mascot-container">
              <div className="mascot-image-container">
                <img 
                  src={mascotImage} 
                  alt="Ultra Voucher Mascot" 
                  className="mascot-image"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
                <div className="mascot-image-placeholder" style={{display: 'none'}}>
                  <div className="mascot-instruction">
                    <div className="mascot-hero">🦸‍♂️</div>
                    <div className="mascot-title">ULTRA VOUCHER</div>
                    <div className="mascot-subtitle">HERO</div>
                  </div>
                </div>
              </div>
              
              <div className="speech-bubble">
                <div className="speech-arrow"></div>
                <div className="speech-content">
                  <div className="speech-title">Ikuti UVGC Raffle & Menangkan Total Hadiah Hingga Rp 1,6 Miliar</div>
                  <div className="speech-text">Cukup Beli Ultra Voucher Gift Card (UVGC) Fisik, Setiap Kartu Otomatis Jadi Nomor Undian</div>
                </div>
              </div>
            </div>
          </div>

          <div className="machine-section">
            <div className="lottery-machine-premium">
              <div className="machine-frame">
                <div className="machine-crown">
                  <div className="crown-gem"></div>
                  <div className="crown-text">ULTRA PRIZE</div>
                  <div className="crown-gem"></div>
                </div>
                
                <div className="premium-machine-body">
                  <div className="premium-chamber">
                    <div className="chamber-frame">
                      <div className="frame-corner top-left"></div>
                      <div className="frame-corner top-right"></div>
                      <div className="frame-corner bottom-left"></div>
                      <div className="frame-corner bottom-right"></div>
                    </div>
                    
                    <div className="chamber-glass">
                      <div className="balls-container">
                        {lotteryBalls.map((ball, index) => (
                          <LotteryBall
                            key={ball.id}
                            ball={ball}
                            index={index}
                            isSelected={selectedBallIndex === index && !isSpinning}
                            isSpinning={isSpinning}
                          />
                        ))}
                      </div>
                      
                      {isSpinning && (
                        <div className="spinning-overlay">
                          <div className="spinning-text">
                            <div className="spinning-title">🎲 SEDANG MENGACAK VOUCHER...</div>
                            <div className="spinning-subtitle">Menentukan pemenang beruntung...</div>
                            <div className="spinning-dots">
                              {[...Array(3)].map((_, i) => (
                                <div
                                  key={i}
                                  className="spinning-dot"
                                  style={{ animationDelay: `${i * 0.2}s` }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {!isSpinning && !winner && (
                        <div className="waiting-overlay">
                          <div className="waiting-content">
                            <div className="waiting-icon">🎫</div>
                            <p className="waiting-title">Siap untuk menemukan voucher beruntung?</p>
                            <p className="waiting-subtitle">Tekan tombol SPIN untuk memulai keseruan!</p>
                          </div>
                        </div>
                      )}

                      {winner && showWinner && (
                        <div className="winner-overlay">
                          <div className="winner-content">
                            <div className="winner-icon">🏆</div>
                            <div className="winner-label">VOUCHER PEMENANG!</div>
                            <div className="winner-card">
                              <div className="winner-voucher-display">{winner}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="premium-status">
                    <div className="status-light active"></div>
                    <div className="status-text">
                      {isProcessing ? 'PROCESSING...' : 'READY TO DRAW'}
                    </div>
                    <div className="status-light active"></div>
                  </div>
                </div>
                
                <button
                  onClick={handleSpin}
                  disabled={isSpinning || !voucherStats.hasData || isProcessing}
                  className={`premium-spin-button ${
                    isSpinning || !voucherStats.hasData || isProcessing ? 'disabled' : ''
                  }`}
                >
                  <div className="spin-button-glow"></div>
                  <div className="spin-text">
                    {isSpinning ? (
                      <>
                        <Zap size={28} />
                        SPINNING...
                        <Zap size={28} />
                      </>
                    ) : isProcessing ? (
                      <>
                        <Zap size={28} />
                        PROCESSING...
                        <Zap size={28} />
                      </>
                    ) : (
                      <>
                        <Gift size={28} />
                        SPIN UNDIAN!
                        <Gift size={28} />
                      </>
                    )}
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div className="control-section">
            <div className="enhanced-input-panel">
              <div className="panel-header">
                <FileText className="panel-icon" size={24} />
                <h3 className="panel-title">🎫 Input Kode Voucher</h3>
              </div>
              
              <div className="enhanced-upload-section">
                <div className="upload-buttons">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".csv,.txt"
                    className="file-input"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="enhanced-upload-button"
                    disabled={isSpinning || isProcessing}
                  >
                    <Upload size={16} />
                    {isProcessing ? 'Processing...' : 'Upload CSV'}
                  </button>
                  <button
                    onClick={downloadTemplate}
                    className="enhanced-template-button"
                  >
                    <Download size={16} />
                    Template CSV
                  </button>
                </div>
                <p className="upload-note">
                  📁 Format: CSV/TXT | Max: 500MB | Ultra-Optimized: 10M+ vouchers ⚡
                  {fileInfo.name && (
                    <>
                      <br />
                      📄 File: {fileInfo.name} ({(fileInfo.size / 1024 / 1024).toFixed(2)} MB)
                      {isLargeDataset && <span className="large-dataset-badge">🚀 LARGE DATASET</span>}
                    </>
                  )}
                </p>
              </div>
              
              <textarea
                value={voucherData}
                onChange={handleTextChange}
                placeholder="Masukkan kode voucher (satu per baris atau pisahkan dengan koma)&#10;Atau upload file CSV/TXT untuk 10M+ voucher dengan streaming processor&#10;&#10;🚀 Tips: Untuk dataset mega (1M+), gunakan upload file untuk performa optimal&#10;⚡ Streaming technology: Real-time processing tanpa freeze browser&#10;&#10;Contoh:&#10;UGP00025-20241007-038563&#10;UGP00025-20241007-038564,UGP00025-20241007-038565"
                className="enhanced-textarea"
                disabled={isSpinning || isProcessing}
              />
              
              <div className="textarea-buttons">
                <button
                  onClick={() => {
                    setVoucherData(sampleVouchers);
                    const quickResult = processVoucherTextQuick(sampleVouchers);
                    if (quickResult) {
                      voucherListRef.current = quickResult;
                      setVoucherCount(quickResult.length);
                      setBallsKey(prev => prev + 1);
                    }
                  }}
                  className="enhanced-sample-button"
                  disabled={isSpinning || isProcessing}
                >
                  🎲 Contoh Data
                </button>
                <button
                  onClick={() => {
                    setVoucherData('');
                    voucherListRef.current = [];
                    setVoucherCount(0);
                    setFileInfo({ name: '', size: 0 });
                    setIsLargeDataset(false);
                    setBallsKey(prev => prev + 1);
                  }}
                  className="enhanced-clear-button"
                  disabled={isSpinning || isProcessing}
                >
                  🗑️ Hapus Semua
                </button>
              </div>
            </div>

            <div className="enhanced-stats-panel">
              <h3 className="panel-title">📊 Info Undian</h3>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon">🎫</div>
                  <div className="stat-info">
                    <div className="stat-value">
                      {formatNumber(voucherStats.count)}
                    </div>
                    <div className="stat-label">Total Voucher</div>
                  </div>
                </div>
                
                <div className="stat-card">
                  <div className="stat-icon">🏆</div>
                  <div className="stat-info">
                    <div className="stat-value winner-count">{winner ? '1' : '0'}</div>
                    <div className="stat-label">Pemenang</div>
                  </div>
                </div>
                
                <div className="stat-card">
                  <div className="stat-icon">⚡</div>
                  <div className="stat-info">
                    <div className={`stat-value ${
                      isProcessing ? 'spinning' : 
                      isSpinning ? 'spinning' : 
                      voucherStats.hasData ? 'ready' : 'waiting'
                    }`}>
                      {isProcessing ? 'PROCESSING' :
                       isSpinning ? 'SPINNING' : 
                       voucherStats.hasData ? 'READY' : 'WAITING'}
                    </div>
                    <div className="stat-label">Status</div>
                  </div>
                </div>
              </div>
              
              {/* Performance indicator for large datasets */}
              {voucherStats.count > 100000 && (
                <div className="performance-indicator">
                  <div className="performance-badge">
                    🚀 MEGA DATASET DETECTED
                  </div>
                  <div className="performance-text">
                    Ultra-optimized for {formatNumber(voucherStats.count)} vouchers
                  </div>
                </div>
              )}
            </div>

            {winner && (
              <div className="enhanced-winner-panel">
                <h3 className="panel-title">🎉 Voucher Beruntung!</h3>
                <div className="winner-display-card">
                  <div className="winner-badge">PEMENANG</div>
                  <div className="winner-code">
                    {winner}
                  </div>
                  <div className="winner-date">
                    {new Date().toLocaleDateString('id-ID', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </div>
                  <div className="winner-stats">
                    Dipilih dari {formatNumber(voucherStats.count)} voucher
                  </div>
                </div>
                <button
                  onClick={() => {
                    const result = `HASIL UNDIAN VOUCHER ULTRA\n\nVoucher Pemenang: ${winner}\nTanggal: ${new Date().toLocaleDateString('id-ID')}\nWaktu: ${new Date().toLocaleTimeString('id-ID')}\nTotal Peserta: ${formatNumber(voucherStats.count)}\n\nSelamat kepada pemenang! 🎉\n\n---\nPowered by Ultra Voucher Lottery Machine\nOptimized for ${formatNumber(voucherStats.count)} vouchers`;
                    const blob = new Blob([result], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `winner_voucher_${new Date().getTime()}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="enhanced-download-button"
                >
                  <Download size={16} />
                  Download Hasil Undian
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add required CSS styles */}
      <style jsx>{`
        .processing-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          backdrop-filter: blur(5px);
        }

        .processing-content {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 20px;
          padding: 30px;
          max-width: 500px;
          width: 90%;
          color: white;
          text-align: center;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          border: 2px solid rgba(255, 255, 255, 0.1);
        }

        .processing-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 15px;
          margin-bottom: 25px;
        }

        .processing-header h3 {
          margin: 0;
          font-size: 24px;
          font-weight: bold;
        }

        .processing-icon {
          animation: rotate 2s linear infinite;
        }

        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .processing-stats {
          display: grid;
          gap: 10px;
          margin-bottom: 25px;
          text-align: left;
        }

        .stat-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 15px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          backdrop-filter: blur(10px);
        }

        .stat-label {
          font-weight: 500;
          opacity: 0.9;
        }

        .stat-value {
          font-weight: bold;
          color: #FFD700;
        }

        .processing-progress {
          margin-bottom: 20px;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 10px;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #FFD700, #FFA500);
          transition: width 0.3s ease;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .progress-text {
          font-size: 14px;
          opacity: 0.9;
          margin-bottom: 15px;
        }

        .processing-tips {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.1);
          padding: 12px;
          border-radius: 10px;
          font-size: 14px;
          margin-bottom: 20px;
        }

        .abort-button {
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: bold;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
        }

        .abort-button:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: translateY(-2px);
        }

        .large-dataset-badge {
          background: linear-gradient(45deg, #FF6B6B, #4ECDC4);
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: bold;
          margin-left: 8px;
        }

        .performance-indicator {
          margin-top: 15px;
          padding: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          text-align: center;
          color: white;
        }

        .performance-badge {
          font-weight: bold;
          font-size: 12px;
          margin-bottom: 5px;
        }

        .performance-text {
          font-size: 11px;
          opacity: 0.9;
        }

        .winner-stats {
          font-size: 12px;
          opacity: 0.7;
          margin-top: 8px;
        }
      `}</style>
    </div>
  );
};

export default VoucherLotteryMachine;