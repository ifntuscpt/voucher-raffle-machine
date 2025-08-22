import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Upload, Download, Copy, FileText, Gift, Zap } from 'lucide-react';
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
  const [fileInfo, setFileInfo] = useState({ name: '', size: 0 });
  const [ballsKey, setBallsKey] = useState(0);
  
  const fileInputRef = useRef(null);
  const voucherListRef = useRef([]);
  const workerRef = useRef(null);

  // Simple text processing function - NO REGEX
  const processVoucherText = useCallback((text) => {
    if (!text || text.trim() === '') return [];
    
    // Replace different line endings with standard newline
    let normalizedText = text;
    if (normalizedText.includes('\r\n')) {
      normalizedText = normalizedText.split('\r\n').join('\n');
    }
    if (normalizedText.includes('\r')) {
      normalizedText = normalizedText.split('\r').join('\n');
    }
    
    // Split by newlines first
    const lines = normalizedText.split('\n');
    const vouchers = [];
    
    // Process each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') continue;
      
      // Check if line contains comma
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

  // Memoized voucher processing - COMPLETELY SAFE
  const voucherStats = useMemo(() => {
    const vouchers = processVoucherText(voucherData);
    voucherListRef.current = vouchers;
    return {
      count: vouchers.length,
      hasData: vouchers.length > 0
    };
  }, [voucherData, processVoucherText]);

  // Enhanced Web Worker - NO REGEX AT ALL
  useEffect(() => {
    const workerCode = `
      // Safe text processing function inside worker
      function processText(text) {
        if (!text || text.trim() === '') return [];
        
        // Replace line endings safely
        var normalizedText = text;
        while (normalizedText.indexOf('\\r\\n') > -1) {
          normalizedText = normalizedText.replace('\\r\\n', '\\n');
        }
        while (normalizedText.indexOf('\\r') > -1) {
          normalizedText = normalizedText.replace('\\r', '\\n');
        }
        
        // Split by newlines
        var lines = normalizedText.split('\\n');
        var vouchers = [];
        
        // Process each line
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (line) {
            line = line.trim();
            if (line === '') continue;
            
            // Check for comma
            if (line.indexOf(',') > -1) {
              var parts = line.split(',');
              for (var j = 0; j < parts.length; j++) {
                var voucher = parts[j].trim();
                if (voucher !== '') {
                  vouchers.push(voucher);
                }
              }
            } else {
              vouchers.push(line);
            }
          }
          
          // Progress update every 50k lines
          if (i > 0 && i % 50000 === 0) {
            self.postMessage({
              type: 'PROGRESS',
              processed: i,
              total: lines.length
            });
          }
        }
        
        return vouchers;
      }
      
      self.onmessage = function(e) {
        var data = e.data;
        var text = data.text;
        var type = data.type;
        
        if (type === 'PROCESS_VOUCHERS') {
          try {
            var vouchers = processText(text);
            
            self.postMessage({
              type: 'VOUCHERS_PROCESSED',
              vouchers: vouchers
            });
          } catch (error) {
            self.postMessage({
              type: 'ERROR',
              error: error.message
            });
          }
        }
        
        if (type === 'SELECT_WINNER') {
          try {
            var vouchers = data.vouchers;
            if (vouchers.length === 0) {
              throw new Error('No vouchers available');
            }
            
            // Safe random selection
            var randomIndex = Math.floor(Math.random() * vouchers.length);
            var winner = vouchers[randomIndex];
            
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
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    workerRef.current = new Worker(URL.createObjectURL(blob));

    workerRef.current.onmessage = (e) => {
      const { type, vouchers, winner, error, processed, total } = e.data;
      
      if (type === 'PROGRESS') {
        console.log(`Processing: ${processed}/${total} lines`);
      }
      
      if (type === 'VOUCHERS_PROCESSED') {
        voucherListRef.current = vouchers;
        setIsProcessing(false);
        setBallsKey(prev => prev + 1);
        console.log(`Successfully processed ${vouchers.length} vouchers`);
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
        alert('Terjadi kesalahan saat memproses data: ' + error);
      }
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  // Lottery balls generation
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

  // Simple file upload - NO COMPLEX STREAMING
  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    setFileInfo({ name: file.name, size: file.size });

    // 200MB limit
    const maxSize = 200 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('File terlalu besar! Maximum 200MB.');
      setIsProcessing(false);
      return;
    }

    const reader = new FileReader();
    
    reader.onload = (e) => {
      const text = e.target.result;
      setVoucherData(text);
      
      // Process with Web Worker
      workerRef.current.postMessage({
        type: 'PROCESS_VOUCHERS',
        text: text
      });
    };
    
    reader.onerror = () => {
      alert('Gagal membaca file!');
      setIsProcessing(false);
    };

    reader.readAsText(file, 'UTF-8');
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

  // Text change handler
  const handleTextChange = useCallback((e) => {
    const value = e.target.value;
    setVoucherData(value);
    if (value.trim()) {
      setBallsKey(prev => prev + 1);
    }
  }, []);

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
                  📁 Format: CSV/TXT | Max: 200MB | Ultra-Optimized: 5M+ vouchers
                  {fileInfo.name && (
                    <>
                      <br />
                      File: {fileInfo.name} ({(fileInfo.size / 1024 / 1024).toFixed(2)} MB)
                    </>
                  )}
                </p>
              </div>
              
              <textarea
                value={voucherData}
                onChange={handleTextChange}
                placeholder="Masukkan kode voucher (satu per baris atau pisahkan dengan koma)&#10;Atau upload file CSV/TXT untuk 1M+ voucher&#10;&#10;Tips: Untuk performa optimal dengan data besar, gunakan upload file&#10;&#10;Contoh:&#10;UGP00025-20241007-038563&#10;UGP00025-20241007-038564,UGP00025-20241007-038565"
                className="enhanced-textarea"
                disabled={isSpinning || isProcessing}
              />
              
              <div className="textarea-buttons">
                <button
                  onClick={() => {
                    setVoucherData(sampleVouchers);
                    setBallsKey(prev => prev + 1);
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
                    setFileInfo({ name: '', size: 0 });
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
                </div>
                <button
                  onClick={() => {
                    const result = `HASIL UNDIAN VOUCHER ULTRA\n\nVoucher Pemenang: ${winner}\nTanggal: ${new Date().toLocaleDateString('id-ID')}\nWaktu: ${new Date().toLocaleTimeString('id-ID')}\nTotal Peserta: ${formatNumber(voucherStats.count)}\n\nSelamat kepada pemenang! 🎉`;
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
    </div>
  );
};

export default VoucherLotteryMachine;