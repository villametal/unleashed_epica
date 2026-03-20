class WebDAW {
    constructor() {
        this.audioContext = null;
        this.tracks = new Map();
        this.masterGainNode = null;
        this.isPlaying = false;
        this.startTime = 0;
        this.pauseTime = 0;
        this.currentTime = 0;
        this.duration = 0;
        this.soloedTracks = new Set();
        this.selectedTrack = null;
        this.playbackRate = 1;
        this.isMasterMuted = false;
        this.masterVolume = 0.7;
        this.isLooping = false;

        this.pdfDoc = null;
        this.pageNum = 1;
        this.pageRendering = false;
        this.pageNumPending = null;
        this.pdfScale = 1.5;

        this.trackConfigs = [
            { name: 'Vocals', file: 'audio/Vocals.mp3', color: 'rgb(255, 0, 0)' },
            { name: 'Guitar', file: 'audio/Guitar.mp3', color: 'rgb(60, 0, 95)' },
            { name: 'Bass', file: 'audio/Bass.mp3', color: 'rgb(2, 44, 68)' },
            { name: 'Drums', file: 'audio/Drums.mp3', color: 'rgb(133, 0, 82)' },
            { name: 'Other', file: 'audio/Other.mp3', color: 'rgb(255, 154, 154)' },
            { name: 'Piano', file: 'audio/Piano.mp3', color: 'rgb(227, 234, 255)' },            
        ];
        
        this.init();
    }
    
    async init() {
        console.log('Initializing WebDAW...');
        await this.initializeAudioContext();
        this.createTrackElements();
        this.setupEventListeners();
        await this.loadAllAudioFiles();
        this.drawAllWaveforms();
        console.log('WebDAW initialization complete');
    }

    async initializeAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.connect(this.audioContext.destination);
            this.masterGainNode.gain.value = this.masterVolume;
            
            console.log("Audio Context initialized successfully");
        } catch (error) {
            console.error("Failed to initialize Audio Context:", error);
            alert("Seu navegador não suporta Web Audio API. Por favor, use um navegador mais recente.");
        }
    }

    createTrackElements() {
        const tracksContainer = document.querySelector('.track-list');
        
        this.trackConfigs.forEach((config, index) => {
            const trackNumber = index + 1;
            

            const trackItem = document.createElement('div');
            trackItem.className = 'track-item';
            trackItem.dataset.track = trackNumber;
            trackItem.innerHTML = `
                <div class="track-info">
                    <h3>${config.name}</h3>
                    <div class="track-controls">
                        <button class="score-btn" data-track="${trackNumber}" title="Ver Partitura"><img class="fit-picture" src="partitura.png"/></button>
                        <button class="mute-btn" data-track="${trackNumber}" title="Mute">M</button>
                        <button class="solo-btn" data-track="${trackNumber}" title="Solo">S</button>
                    </div>
                </div>
                <div class="track-sliders">
                    <div class="slider-group">
                        <label>Vol</label>
                        <input type="range" class="volume-slider" data-track="${trackNumber}" min="0" max="100" value="70">
                        <span class="volume-value">70%</span>
                    </div>
                    <div class="slider-group">
                        <label>Pan</label>
                        <input type="range" class="pan-slider" data-track="${trackNumber}" min="-100" max="100" value="0">
                        <span class="pan-value">C</span>
                    </div>
                </div>
                <div class="waveform-container">
                    <canvas class="waveform" data-track="${trackNumber}"></canvas>
                    <div class="playhead" id="playhead"></div>
                </div>
                </div>
            `;
            
            tracksContainer.appendChild(trackItem);
            

            this.tracks.set(trackNumber, {
                name: config.name,
                file: config.file,
                color: config.color,
                audioBuffer: null,
                source: null,
                gainNode: null,
                panNode: null,
                isPlaying: false,
                isMuted: false,
                isSolo: false,
                volume: 0.7,
                pan: 0,
                element: trackItem,
                canvas: trackItem.querySelector('.waveform')
            });
            

            this.addTrackEventListeners(trackNumber);
        });
    }

    addTrackEventListeners(trackNumber) {
        const track = this.tracks.get(trackNumber);
        const element = track.element;
        

        const muteBtn = element.querySelector('.mute-btn');
        muteBtn.addEventListener('click', () => this.toggleMute(trackNumber));
        

        const soloBtn = element.querySelector('.solo-btn');
        soloBtn.addEventListener('click', () => this.toggleSolo(trackNumber));
        

        const scoreBtn = element.querySelector('.score-btn');
        scoreBtn.addEventListener('click', () => this.openScore(trackNumber));
        

        const volumeSlider = element.querySelector('.volume-slider');
        volumeSlider.addEventListener('input', (e) => {
            this.setTrackVolume(trackNumber, e.target.value / 100);
            element.querySelector('.volume-value').textContent = e.target.value + '%';
        });
        

        const panSlider = element.querySelector('.pan-slider');
        panSlider.addEventListener('input', (e) => {
            this.setTrackPan(trackNumber, e.target.value / 100);
            const value = parseInt(e.target.value);
            const display = value === 0 ? 'C' : (value > 0 ? `R${value}` : `L${Math.abs(value)}`);
            element.querySelector('.pan-value').textContent = display;
        });
        

        track.canvas.addEventListener('click', (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            this.seekTo(percentage * this.duration);
        });
    }

    async loadAllAudioFiles() {
        console.log('Loading audio files...');
        const loadPromises = [];
        
        for (const [trackNumber, track] of this.tracks) {
            loadPromises.push(this.loadAudioFile(trackNumber));
        }
        
        await Promise.all(loadPromises);
        this.calculateDuration();
        console.log('All audio files loaded');
    }

    async loadAudioFile(trackNumber) {
        const track = this.tracks.get(trackNumber);
        
        try {
            console.log(`Loading ${track.file}...`);
            const response = await fetch(track.file);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            track.audioBuffer = audioBuffer;
            

            track.gainNode = this.audioContext.createGain();
            track.panNode = this.audioContext.createStereoPanner();
            
            track.gainNode.connect(track.panNode);
            track.panNode.connect(this.masterGainNode);
            
            track.gainNode.gain.value = track.volume;
            track.panNode.pan.value = track.pan;
            
            console.log(`Loaded ${track.name} successfully`);
        } catch (error) {
            console.error(`Failed to load ${track.file}:`, error);
        }
    }

    calculateDuration() {
        let maxDuration = 0;
        for (const [trackNumber, track] of this.tracks) {
            if (track.audioBuffer) {
                maxDuration = Math.max(maxDuration, track.audioBuffer.duration);
            }
        }
        this.duration = maxDuration;
        document.getElementById('totalTime').textContent = this.formatTime(this.duration);
    }

    drawAllWaveforms() {
        console.log('Drawing waveforms...');
        for (const [trackNumber, track] of this.tracks) {
            if (track.audioBuffer) {
                this.drawWaveform(trackNumber);
            }
        }
    }

    drawWaveform(trackNumber) {
        const track = this.tracks.get(trackNumber);
        const canvas = track.canvas;
        
        if (!track.audioBuffer || !canvas) {
            console.log(`Cannot draw waveform for track ${trackNumber}: missing audioBuffer or canvas`);
            return;
        }
        

        setTimeout(() => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                console.log(`Canvas not ready for track ${trackNumber}, retrying...`);
                setTimeout(() => this.drawWaveform(trackNumber), 100);
                return;
            }
            
            const ctx = canvas.getContext('2d');
            

            canvas.width = rect.width * window.devicePixelRatio;
            canvas.height = rect.height * window.devicePixelRatio;
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
            
            const width = rect.width;
            const height = rect.height;
            
            const audioData = track.audioBuffer.getChannelData(0);
            const step = Math.ceil(audioData.length / width);
            const amp = height / 2;
            

            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, width, height);
            

            ctx.strokeStyle = track.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            
            for (let i = 0; i < width; i++) {
                let min = 1.0;
                let max = -1.0;
                
                for (let j = 0; j < step; j++) {
                    const datum = audioData[(i * step) + j];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }
                
                const y1 = (1 + min) * amp;
                const y2 = (1 + max) * amp;
                
                ctx.moveTo(i, y1);
                ctx.lineTo(i, y2);
            }
            
            ctx.stroke();
            console.log(`Waveform drawn for ${track.name}`);
        }, 50);
    }

    setupEventListeners() {

        document.getElementById('playBtn').addEventListener('click', () => {
            this.togglePlayback();
        });
        

        const masterVolumeSlider = document.getElementById('masterVolumeSlider');
        masterVolumeSlider.addEventListener('input', (e) => {
            this.setMasterVolume(e.target.value / 100);
            document.getElementById('masterVolumeValue').textContent = e.target.value + '%';
        });
        

        const volumeBtn = document.getElementById('volumeBtn');
        const masterVolumeControl = document.querySelector('.master-volume-control');
        
        volumeBtn.addEventListener('click', () => {
            this.toggleMasterMute();
        });
        

        volumeBtn.addEventListener('mouseenter', () => {
            masterVolumeControl.style.display = 'flex';
            masterVolumeControl.classList.add('active');
        });
        

        const hideVolumeSlider = () => {
            masterVolumeControl.style.display = 'none';
            masterVolumeControl.classList.remove('active');
        };
        
        volumeBtn.addEventListener('mouseleave', (e) => {

            setTimeout(() => {
                if (!masterVolumeControl.matches(':hover') && !volumeBtn.matches(':hover')) {
                    hideVolumeSlider();
                }
            }, 100);
        });
        
        masterVolumeControl.addEventListener('mouseleave', (e) => {

            setTimeout(() => {
                if (!masterVolumeControl.matches(':hover') && !volumeBtn.matches(':hover')) {
                    hideVolumeSlider();
                }
            }, 100);
        });
        
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const speed = parseFloat(e.target.textContent);
                this.setPlaybackRate(speed);
                
                document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
        
        document.getElementById('resetBtn').addEventListener('click', () => {
            this.reset();
        });
        
        document.getElementById('progressBar').addEventListener('click', (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            this.seekTo(percentage * this.duration);
        });

        document.getElementById('prevBtn').addEventListener('click', () => {
            this.seekTo(this.currentTime - 10);
        });

        document.getElementById('nextBtn').addEventListener('click', () => {
            this.seekTo(this.currentTime + 10);
        });

        document.getElementById('loopBtn').addEventListener('click', () => {
            this.toggleLoop();
        });

        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.togglePlayback();
            } else if (e.code === 'ArrowLeft') {
                this.seekTo(this.currentTime - 10);
            } else if (e.code === 'ArrowRight') {
                this.seekTo(this.currentTime + 10);
            } else if (e.code === 'KeyR') {
                this.reset();
            }
        });
    }

    togglePlayback() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    play() {
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        this.isPlaying = true;
        this.startTime = this.audioContext.currentTime - this.pauseTime;
        
        for (const [trackNumber, track] of this.tracks) {
            if (track.audioBuffer && !track.isMuted && (this.soloedTracks.size === 0 || track.isSolo)) {
                this.startTrack(trackNumber, this.pauseTime);
            }
        }
        
        document.getElementById('playBtn').textContent = '⏸';
        document.getElementById('playBtn').classList.add('playing');
        
        this.updateProgress();
        console.log('Playback started');
    }

    pause() {
        this.isPlaying = false;
        this.pauseTime = this.audioContext.currentTime - this.startTime;
        
        for (const [trackNumber, track] of this.tracks) {
            this.stopTrack(trackNumber);
        }
        
        document.getElementById('playBtn').textContent = '▶';
        document.getElementById('playBtn').classList.remove('playing');
        
        console.log('Playback paused');
    }

    startTrack(trackNumber, offset = 0) {
        const track = this.tracks.get(trackNumber);
        
        if (!track.audioBuffer) return;
        
        track.source = this.audioContext.createBufferSource();
        track.source.buffer = track.audioBuffer;
        track.source.playbackRate.value = this.playbackRate;
        
        track.source.connect(track.gainNode);
        
        track.source.onended = () => {
            if (!this.isSeeking) {
                track.isPlaying = false;
                track.source = null;
            }
        };

        const startTime = this.audioContext.currentTime;
        const duration = track.audioBuffer.duration - offset;
        
        if (duration > 0) {
            track.source.start(startTime, offset, duration);
            track.isPlaying = true;
        }
    }

    seekTo(time) {
        time = Math.max(0, Math.min(time, this.duration));
        
        const wasPlaying = this.isPlaying;
        
        this.pauseTime = time;
        this.currentTime = time;
        
        const percentage = (time / this.duration) * 100;
        document.getElementById("progressFill").style.width = percentage + "%";
        document.getElementById("currentTime").textContent = this.formatTime(time);
        this.updateAllPlayheads();

        if (wasPlaying) {
            this.isSeeking = true;
            for (const [trackNumber, track] of this.tracks) {
                if (track.source) {
                    this.stopTrack(trackNumber);
                }
            }
            this.startTime = this.audioContext.currentTime - this.pauseTime;
            for (const [trackNumber, track] of this.tracks) {
                if (track.audioBuffer && !track.isMuted && (this.soloedTracks.size === 0 || track.isSolo)) {
                    this.startTrack(trackNumber, this.pauseTime);
                }
            }
            setTimeout(() => {
                this.isSeeking = false;
            }, 50);
        }
        
        console.log(`Seeked to ${this.formatTime(time)}`);
    }

    updateProgress() {
        if (this.isPlaying) {
            this.currentTime = this.audioContext.currentTime - this.startTime;

            if (this.currentTime >= this.duration) {
                if (this.isLooping) {
                    this.pauseTime = 0;
                    this.play();
                } else {
                    this.pause();
                    this.seekTo(0);
                }
                return;
            }

            const percentage = (this.currentTime / this.duration) * 100;
            document.getElementById("progressFill").style.width = percentage + "%";
            document.getElementById("currentTime").textContent = this.formatTime(this.currentTime);
            
            this.updateAllPlayheads();
            
            requestAnimationFrame(() => this.updateProgress());
        }
    }

    updateAllPlayheads() {
        const percentage = (this.currentTime / this.duration) * 100;
        document.querySelectorAll('.playhead').forEach(playhead => {
            playhead.style.left = percentage + '%';
        });
    }

    stopTrack(trackNumber) {
        const track = this.tracks.get(trackNumber);
        if (track.source) {
            try {
                track.source.stop();
            } catch (e) {

            }
            track.source = null;
            track.isPlaying = false;
        }
    }

    setMasterVolume(volume) {
        this.masterVolume = volume;
        if (!this.isMasterMuted) {
            this.masterGainNode.gain.value = volume;
        }
    }

    toggleMasterMute() {
        this.isMasterMuted = !this.isMasterMuted;
        
        if (this.isMasterMuted) {
            this.masterGainNode.gain.value = 0;
            document.getElementById('volumeBtn').textContent = '🔇';
            document.getElementById('volumeBtn').classList.add('muted');
        } else {
            this.masterGainNode.gain.value = this.masterVolume;
            document.getElementById('volumeBtn').textContent = '🔊';
            document.getElementById('volumeBtn').classList.remove('muted');
        }
        
        console.log(`Master ${this.isMasterMuted ? 'muted' : 'unmuted'}`);
    }

    setTrackVolume(trackNumber, volume) {
        const track = this.tracks.get(trackNumber);
        track.volume = volume;
        
        if (track.gainNode && !track.isMuted) {
            track.gainNode.gain.value = volume;
        }
    }

    setTrackPan(trackNumber, pan) {
        const track = this.tracks.get(trackNumber);
        track.pan = pan;
        
        if (track.panNode) {
            track.panNode.pan.value = pan;
        }
    }

    toggleMute(trackNumber) {
        const track = this.tracks.get(trackNumber);
        track.isMuted = !track.isMuted;
        
        if (track.gainNode) {
            track.gainNode.gain.value = track.isMuted ? 0 : track.volume;
        }

        if (this.isPlaying && track.gainNode) {
            track.gainNode.gain.value = track.isMuted ? 0 : track.volume;
        }
        
        const muteBtn = track.element.querySelector('.mute-btn');
        muteBtn.classList.toggle('active', track.isMuted);
        
        console.log(`Track ${trackNumber} ${track.isMuted ? 'muted' : 'unmuted'}`);
    }

    toggleSolo(trackNumber) {
        const track = this.tracks.get(trackNumber);
        
        if (track.isSolo) {
            track.isSolo = false;
            this.soloedTracks.delete(trackNumber);
        } else {
            track.isSolo = true;
            this.soloedTracks.add(trackNumber);
        }
        
        const soloBtn = track.element.querySelector('.solo-btn');
        soloBtn.classList.toggle('active', track.isSolo);
        
        if (this.isPlaying) {
            for (const [tNum, t] of this.tracks) {
                if (t.gainNode) {
                    const shouldPlay = !t.isMuted && (this.soloedTracks.size === 0 || t.isSolo);
                    t.gainNode.gain.value = shouldPlay ? t.volume : 0;
                }
            }
        }
        
        console.log(`Track ${trackNumber} solo ${track.isSolo ? 'enabled' : 'disabled'}`);
    }

    setPlaybackRate(rate) {
        this.playbackRate = rate;
        
        for (const [trackNumber, track] of this.tracks) {
            if (track.source && track.isPlaying) {
                track.source.playbackRate.value = rate;
            }
        }
        
        console.log(`Playback rate set to ${rate}x`);
    }

    toggleLoop() {
        this.isLooping = !this.isLooping;
        
        const loopBtn = document.getElementById('loopBtn');
        loopBtn.classList.toggle('active', this.isLooping);
        
        console.log(`Loop ${this.isLooping ? 'enabled' : 'disabled'}`);
    }

     /**
     * Renderiza uma página específica do PDF.
     * @param {number} num - O número da página a ser renderizada.
     */
    renderPage(num) {
    this.pageRendering = true;
    const canvas = document.getElementById('pdf-canvas');
    const ctx = canvas.getContext('2d');
    const pageNumSpan = document.getElementById('pdf-page-num');

    this.pdfDoc.getPage(num).then((page) => {

        const viewport = page.getViewport({ scale: this.pdfScale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        const renderTask = page.render(renderContext);

        renderTask.promise.then(() => {
            this.pageRendering = false;
            if (this.pageNumPending !== null) {
                this.renderPage(this.pageNumPending);
                this.pageNumPending = null;
            }
        });
    });

    pageNumSpan.textContent = num;
}

    queueRenderPage(num) {
        if (this.pageRendering) {
            this.pageNumPending = num;
        } else {
            this.renderPage(num);
        }
    }

    onPrevPage() {
        if (this.pageNum <= 1) {
            return;
        }
        this.pageNum--;
        this.queueRenderPage(this.pageNum);
    }


    onNextPage() {
        if (this.pageNum >= this.pdfDoc.numPages) {
            return;
        }
        this.pageNum++;
        this.queueRenderPage(this.pageNum);
    }

    /**
     * Abre o modal da partitura e carrega o PDF usando PDF.js.
     * @param {number} trackNumber - O número da faixa.
     */
    openScore(trackNumber) {
        const track = this.tracks.get(trackNumber);
        if (!track) return;

        const modal = document.getElementById('scoreModal');
        const modalTitle = document.getElementById('scoreModalTitle');
        const scorePath = `partituras/${track.name}.pdf`;


        const loadingTaskEl = document.getElementById('pdf-loading');
        const errorEl = document.getElementById('pdf-error');
        const navigationEl = document.getElementById('pdf-navigation');
        const canvasContainer = document.getElementById('pdf-viewer-container');

        modalTitle.textContent = `Partitura - ${track.name}`;
        loadingTaskEl.style.display = 'block';
        errorEl.style.display = 'none';
        navigationEl.style.display = 'none';
        canvasContainer.style.display = 'none';
        modal.dataset.pdfPath = scorePath;

        modal.style.display = 'flex';

        const loadingTask = pdfjsLib.getDocument(scorePath);
        loadingTask.promise.then((pdfDoc_) => {
            loadingTaskEl.style.display = 'none';
            canvasContainer.style.display = 'block';
            
            this.pdfDoc = pdfDoc_;
            document.getElementById('pdf-page-count').textContent = this.pdfDoc.numPages;
            this.pageNum = 1;

            this.renderPage(this.pageNum);

            if (this.pdfDoc.numPages > 1) {
                navigationEl.style.display = 'flex';
            }

        }, (reason) => {
            console.error(reason);
            loadingTaskEl.style.display = 'none';
            errorEl.style.display = 'block';
            errorEl.querySelector('p').textContent = `Partitura não encontrada para ${track.name}`;
        });
    }

    closeScoreModal() {
        const modal = document.getElementById('scoreModal');
        modal.style.display = 'none';
        
        this.pdfDoc = null;
        this.pageNum = 1;
        
        const canvas = document.getElementById('pdf-canvas');
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
    }

    downloadScore() {
        const modal = document.getElementById('scoreModal');
        const pdfPath = modal.dataset.pdfPath;
        
        if (pdfPath) {

            const link = document.createElement('a');
            link.href = pdfPath;
            link.download = pdfPath.split('/').pop();
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    printScore() {
        const modal = document.getElementById('scoreModal');
        const pdfPath = modal.dataset.pdfPath;
        
        if (pdfPath) {

            const printWindow = window.open(pdfPath, '_blank');
            if (printWindow) {
                printWindow.onload = () => {
                    printWindow.print();
                };
            }
        }
    }

    toggleFullscreen() {
        const modal = document.getElementById('scoreModal');
        
        if (!document.fullscreenElement) {
            if (modal.requestFullscreen) {
                modal.requestFullscreen();
            } else if (modal.webkitRequestFullscreen) {
                modal.webkitRequestFullscreen();
            } else if (modal.msRequestFullscreen) {
                modal.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }

    reset() {
        console.log("Resetting track controls");
        for (const [trackNumber, track] of this.tracks) {

            if (track.isMuted) {
                this.toggleMute(trackNumber);
            }

            if (track.isSolo) {
                this.toggleSolo(trackNumber);
            }

            this.setTrackVolume(trackNumber, 0.7);
            track.element.querySelector(".volume-slider").value = 70;
            track.element.querySelector(".volume-value").textContent = "70%";

            this.setTrackPan(trackNumber, 0);
            track.element.querySelector(".pan-slider").value = 0;
            track.element.querySelector(".pan-value").textContent = "C";
        }

        if (this.isMasterMuted) {
            this.toggleMasterMute();
        }
        this.setMasterVolume(0.7);
        document.getElementById("masterVolumeSlider").value = 70;
        document.getElementById("masterVolumeValue").textContent = "70%";

        this.setPlaybackRate(1);
        document.querySelectorAll(".speed-btn").forEach(btn => btn.classList.remove("active"));
        document.querySelector(".speed-btn[data-speed='1']").classList.add("active");

        if (this.isLooping) {
            this.toggleLoop();
        }
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

zoomIn() {
    if (this.pdfScale >= 3.0) {
        return;
    }
    this.pdfScale += 0.25;
    this.queueRenderPage(this.pageNum);
}

zoomOut() {
    if (this.pdfScale <= 0.5) {
        return;
    }
    this.pdfScale -= 0.25;
    this.queueRenderPage(this.pageNum);
}

fitToWidth() {
    if (!this.pdfDoc) return;

    const container = document.getElementById('pdf-viewer-container');
    const containerWidth = container.clientWidth;

    this.pdfDoc.getPage(this.pageNum).then(page => {
        const pageWidth = page.getViewport({ scale: 1.0 }).width;
        this.pdfScale = (containerWidth / pageWidth) * 0.98;
        this.queueRenderPage(this.pageNum);
    });
}
}

    document.addEventListener('DOMContentLoaded', () => {
        window.webDAW = new WebDAW();
        
        const modal = document.getElementById('scoreModal');
        const closeBtn = document.getElementById('closeScoreModal');
        const downloadBtn = document.getElementById('scoreDownload');
        const printBtn = document.getElementById('scorePrint');
        const fullscreenBtn = document.getElementById('scoreFullscreen');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                window.webDAW.closeScoreModal();
            });
        }
        
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    window.webDAW.closeScoreModal();
                }
            });
        }
        
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                window.webDAW.downloadScore();
            });
        }
        
        if (printBtn) {
            printBtn.addEventListener('click', () => {
                window.webDAW.printScore();
            });
        }
        
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => {
                window.webDAW.toggleFullscreen();
            });
        }
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                window.webDAW.closeScoreModal();
            }
        });

        document.getElementById('pdf-prev').addEventListener('click', () => {
            window.webDAW.onPrevPage();
        });
        document.getElementById('pdf-next').addEventListener('click', () => {
            window.webDAW.onNextPage();
        });

        document.getElementById('zoomInBtn').addEventListener('click', () => {
            window.webDAW.zoomIn();
        });

        document.getElementById('zoomOutBtn').addEventListener('click', () => {
            window.webDAW.zoomOut();
        });

        document.getElementById('fitToWidthBtn').addEventListener('click', () => {
            window.webDAW.fitToWidth();
        });
});
