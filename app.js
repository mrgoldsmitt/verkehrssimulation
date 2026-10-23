/**
 * Traffic Jam Simulation
 * 
 * Diese Applikation verwendet das Intelligent Driver Model (IDM) 
 * zur Simulation von realistischem Fahrzeugfolgeverhalten.
 */

const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const scenarioSelect = document.getElementById('scenarioSelect');
const resetBtn = document.getElementById('resetBtn');
const carCountSlider = document.getElementById('carCount');
const carCountVal = document.getElementById('carCountVal');
const globalSpeedSlider = document.getElementById('globalSpeed');
const globalSpeedVal = document.getElementById('globalSpeedVal');
const carSpeedSlider = document.getElementById('carSpeed');
const carSpeedVal = document.getElementById('carSpeedVal');
const carControls = document.getElementById('carControls');
const carLabelText = document.getElementById('carLabelText');
const burgerBtn = document.getElementById('burgerBtn');
const sidebar = document.getElementById('sidebar');
const timerDisplay = document.getElementById('timerDisplay');
const scenarioHint = document.getElementById('scenarioHint');
const trafficLightOptions = document.getElementById('trafficLightOptions');
const btnStopAll = document.getElementById('btnStopAll');
const btnStopRed = document.getElementById('btnStopRed');

// Simulation parameters
const ROAD_Y_OFFSET_RATIO = 0.5; // Strassenmitte
const LANE_HEIGHT = 60;
const CAR_WIDTH = 40;
const CAR_HEIGHT = 20;
const SCALE_PX_PER_METER = 5; // Maßstab: 1 Meter = 5 Pixel auf dem Canvas

let simulation;
let lastTime = 0;
let isRunning = true;
let globalSpeedMultiplier = 1;
let currentTimerStopMode = 'allPassed'; // 'allPassed' oder 'manualRed'

// Click / Double-Click Gesture State
let singleClickTimer = null;
let lastClickedVehicle = null;
let lastClickTime = 0;

/**
 * Zeichnet ein Vektor-Huhn (SVG-Qualität) direkt auf dem Canvas.
 */
function drawChicken(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    
    // Schatten
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.beginPath();
    ctx.ellipse(0, 15, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Beine & Füße
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, 8); ctx.lineTo(-4, 15); ctx.lineTo(-7, 15);
    ctx.moveTo(4, 8); ctx.lineTo(4, 15); ctx.lineTo(1, 15);
    ctx.stroke();

    // Körper
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Flügel
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.ellipse(-3, 1, 7, 4.5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Kamm (oben rot)
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(4, -10, 3, 0, Math.PI * 2);
    ctx.arc(1, -11, 2.8, 0, Math.PI * 2);
    ctx.arc(7, -8, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Kehllappen (unten rot)
    ctx.beginPath();
    ctx.arc(10, 3, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Schnabel (orange)
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(11, -3);
    ctx.lineTo(17, 0);
    ctx.lineTo(11, 2.5);
    ctx.closePath();
    ctx.fill();

    // Auge (dunkel mit Lichtpunkt)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(7, -2.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(7.5, -3, 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

/**
 * Klasse Vehicle (Fahrzeug)
 * Beinhaltet Position, Kinematik und die IDM (Intelligent Driver Model) Logik.
 */
class Vehicle {
    constructor(x, lane, color, label = '') {
        this.x = x;
        this.lane = lane; // 0 = rechts, 1 = links (Überholspur)
        this.color = color;
        this.label = label;
        
        // Kinematik
        this.v = 0; // Aktuelle Geschwindigkeit (m/s)
        this.a = 0; // Aktuelle Beschleunigung (m/s^2)
        
        // IDM Parameter
        this.v0 = 30; // Wunschgeschwindigkeit (m/s) (~108 km/h)
        this.originalV0 = 30;
        this.T = 1.4; // Sicherer Zeitabstand (s)
        this.s0 = 3.0; // Mindestabstand im Stillstand (m) (3m = 15px bei 5px/m)
        this.a_max = 2.0; // Max Beschleunigung (m/s^2)
        this.b = 3.0; // Angenehme Verzögerung (m/s^2)
        this.delta = 4; // Beschleunigungsexponent
        
        this.width = CAR_WIDTH;
        this.height = CAR_HEIGHT;
        this.isHighlighted = false;
        
        // Lane changing / Overtaking
        this.targetLane = lane;
        this.laneChangeProgress = 0; // 0 to 1
        this.isChangingLane = false;
        this.isOvertaking = false;
        this.overtakeTarget = null; // Auto, das überholt wird
        this.hasPassedTarget = false;
        this.overtakeTimer = 0;
        this.wantsLaneChangeTo0 = false;
        
        // Connected vehicles mode
        this.isConnected = false;
        this.platoonLeader = null;
        
        // Ampel-Tracking (exakte Durchfahrt)
        this.hasPassedTrafficLight = false;
        this.distToPassTrafficLight = 0;
        this.traveledSinceGreen = 0;
    }
    
    // Berechnet die IDM Beschleunigung
    getAcceleration(leadVehicle, roadLength) {
        if (this.isConnected && this.platoonLeader && this.platoonLeader.v > 0) {
            return this.platoonLeader.a;
        }

        let s_star = 0;
        let s = Infinity; 
        
        if (leadVehicle) {
            let gapPx = leadVehicle.x - this.x - this.width;
            if (gapPx < 0 && !leadVehicle.isStatic) {
                gapPx += roadLength;
            }
            if (gapPx < 0 && leadVehicle.isStatic) {
                gapPx = Infinity;
            }
            
            if (gapPx !== Infinity) {
                s = Math.max(0.1, gapPx / SCALE_PX_PER_METER);
                const leadV = leadVehicle.v !== undefined ? leadVehicle.v : 0;
                const delta_v = this.v - leadV;
                s_star = this.s0 + Math.max(0, this.v * this.T + (this.v * delta_v) / (2 * Math.sqrt(this.a_max * this.b)));
            }
        }
        
        const acc = this.a_max * (1 - Math.pow(this.v / this.v0, this.delta) - Math.pow(s_star / s, 2));
        return isNaN(acc) ? 0 : acc;
    }
    
    isSafeToChangeLane(targetLane, vehicles, roadLength) {
        for (const v of vehicles) {
            if (v === this) continue;
            // Falls das andere Fahrzeug auf der Zielspur ist oder dorthin wechselt
            if (v.lane === targetLane || v.targetLane === targetLane) {
                let distAhead = v.x - this.x;
                if (distAhead < 0) distAhead += roadLength;
                
                let distBehind = this.x - v.x;
                if (distBehind < 0) distBehind += roadLength;

                // Prüfen, ob v vor uns oder hinter uns auf dem Rundkurs ist
                if (distAhead <= distBehind) {
                    // v ist VOR uns
                    if (distAhead < this.width + 6) {
                        return false; // Physische Überlappung oder Puffer unterschritten
                    }
                    const gapAhead = distAhead - this.width;
                    const closingSpeed = Math.max(0, this.v - v.v);
                    const minGapAhead = 8 + (closingSpeed * 0.25 * SCALE_PX_PER_METER);
                    if (gapAhead < minGapAhead) {
                        return false;
                    }
                } else {
                    // v ist HINTER uns
                    if (distBehind < v.width + 6) {
                        return false; // Physische Überlappung oder Puffer unterschritten
                    }
                    const gapBehind = distBehind - v.width;
                    const closingSpeed = Math.max(0, v.v - this.v);
                    const minGapBehind = 8 + (closingSpeed * 0.35 * SCALE_PX_PER_METER);
                    if (gapBehind < minGapBehind) {
                        return false;
                    }
                }
            }
        }
        return true;
    }
    
    update(dt, roadLength, vehicles) {
        this.v += this.a * dt;
        if (this.v < 0) this.v = 0; 
        
        this.x += (this.v * SCALE_PX_PER_METER) * dt;
        if (this.x > roadLength) this.x -= roadLength;
        
        if (this.isChangingLane) {
            this.laneChangeProgress += dt * 1.0; 
            if (this.laneChangeProgress >= 1) {
                this.lane = this.targetLane;
                this.isChangingLane = false;
                this.laneChangeProgress = 0;
            }
        }
        
        // Gewünschter Spurwechsel nach unten (Spur 1 -> Spur 0 für angeklickte Autos)
        if (this.wantsLaneChangeTo0 && !this.isChangingLane && this.lane === 1) {
            if (this.isSafeToChangeLane(0, vehicles, roadLength)) {
                this.targetLane = 0;
                this.isChangingLane = true;
                this.laneChangeProgress = 0;
                this.v0 = 15;
                this.originalV0 = 15;
                this.wantsLaneChangeTo0 = false;
            }
        }

        // Überhol-Logik mit Kollisionsschutz
        if (this.isOvertaking && !this.isChangingLane) {
            if (this.lane === 0) {
                // Wir wollen auf die Überholspur (Spur 1)
                if (this.isSafeToChangeLane(1, vehicles, roadLength)) {
                    this.targetLane = 1;
                    this.isChangingLane = true;
                    this.laneChangeProgress = 0;
                    this.hasPassedTarget = false;
                    this.overtakeTimer = 0;
                }
            } else if (this.lane === 1) {
                this.overtakeTimer += dt;
                
                // Wir sind auf der Überholspur: Prüfen, ob wir das Zielfahrzeug überholt haben
                if (this.overtakeTarget) {
                    let dist = this.x - this.overtakeTarget.x;
                    if (dist < 0) dist += roadLength; 
                    
                    if ((dist >= this.width + 16 && dist < roadLength / 2) || this.overtakeTimer > 6.0) {
                        this.hasPassedTarget = true;
                    }
                } else {
                    if (this.overtakeTimer > 2.0) {
                        this.hasPassedTarget = true;
                    }
                }
                
                // Sobald überholt und Rückkehr auf Spur 0 sicher ist
                if (this.hasPassedTarget && this.isSafeToChangeLane(0, vehicles, roadLength)) {
                    this.targetLane = 0;
                    this.isChangingLane = true;
                    this.laneChangeProgress = 0;
                    this.v0 = this.originalV0 || 15; 
                    this.isOvertaking = false;
                    this.overtakeTarget = null;
                    this.hasPassedTarget = false;
                    this.overtakeTimer = 0;
                }
            }
        }
    }
    
    draw(ctx, roadYOffset) {
        let currentLane = this.lane;
        if (this.isChangingLane) {
            const t = this.laneChangeProgress;
            const smoothT = t * t * (3 - 2 * t);
            currentLane = this.lane + (this.targetLane - this.lane) * smoothT;
        }
        
        const y = roadYOffset - (currentLane * LANE_HEIGHT) - this.height / 2;
        
        ctx.fillStyle = this.color;
        if (this.isHighlighted) {
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#6366f1';
            ctx.strokeStyle = '#6366f1';
            ctx.lineWidth = 3;
        } else {
            ctx.shadowBlur = 0;
        }
        
        ctx.beginPath();
        ctx.roundRect(this.x, y, this.width, this.height, 4);
        ctx.fill();
        if (this.isHighlighted) ctx.stroke();
        ctx.shadowBlur = 0; 
        
        // Kennzeichnung / Label auf dem Auto zeichnen (Nummer oder Buchstabe)
        if (this.label) {
            ctx.font = 'bold 11px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Kontur für perfekte Lesbarkeit auf jedem Hintergrund
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.lineWidth = 2.5;
            ctx.strokeText(this.label, this.x + this.width / 2, y + this.height / 2);
            
            ctx.fillStyle = '#ffffff';
            ctx.fillText(this.label, this.x + this.width / 2, y + this.height / 2);
        }
        
        // Blinker für gewünschten oder laufenden Spurwechsel
        const isBlinkingLeft = (this.isOvertaking && this.lane === 0) || 
                               (this.isChangingLane && this.targetLane === 1);
                               
        const isBlinkingRight = (this.wantsLaneChangeTo0) || 
                                (this.isOvertaking && this.lane === 1 && this.hasPassedTarget) ||
                                (this.isChangingLane && this.targetLane === 0);

        if (isBlinkingLeft || isBlinkingRight) {
            const blinkTime = Date.now() % 500;
            if (blinkTime > 250) {
                ctx.fillStyle = '#f59e0b';
                ctx.shadowBlur = 4;
                ctx.shadowColor = '#f59e0b';
                const blinkY = isBlinkingLeft ? y + 2 : y + this.height - 6;
                // Blinker hinten & vorne
                ctx.fillRect(this.x + 2, blinkY, 4, 4);
                ctx.fillRect(this.x + this.width - 6, blinkY, 4, 4);
                ctx.shadowBlur = 0;
            }
        }
    }
}

/**
 * Klasse Simulation
 */
class Simulation {
    constructor(canvasWidth, canvasHeight) {
        this.width = canvasWidth;
        this.height = canvasHeight;
        this.vehicles = [];
        this.numLanes = 1;
        this.highlightedVehicle = null;
        this.carCount = 10;
        
        this.trafficLight = null; 
        this.timer = { active: false, elapsed: 0, completed: false };
        this.chicken = null; 
        
        this.timerStopMode = currentTimerStopMode; // 'allPassed' oder 'manualRed'
    }
    
    getLeadVehicle(vehicle, checkLane = null) {
        const laneToCheck = checkLane !== null ? checkLane : vehicle.targetLane;
        let minDistance = Infinity;
        let lead = null;
        
        for (const other of this.vehicles) {
            if (other === vehicle) continue;
            if (other.lane === laneToCheck || other.targetLane === laneToCheck) {
                let dist = other.x - vehicle.x;
                if (dist < 0) dist += this.width; 
                
                if (dist < minDistance) {
                    minDistance = dist;
                    lead = other;
                }
            }
        }
        
        if (this.trafficLight && this.trafficLight.state === 'red') {
            let dist = this.trafficLight.x - vehicle.x;
            if (dist > 0 && dist < minDistance) {
                minDistance = dist;
                lead = { x: this.trafficLight.x, v: 0, isStatic: true };
            }
        }
        
        // Huhn blockiert ALLE Spuren
        if (this.chicken && this.chicken.active) {
            let dist = this.chicken.x - vehicle.x;
            if (dist > 0 && dist < minDistance) {
                minDistance = dist;
                lead = { x: this.chicken.x, v: 0, isStatic: true };
            }
        }
        
        return lead;
    }
    
    update(dt) {
        if (this.timer.active) {
            this.timer.elapsed += dt;
            timerDisplay.innerText = this.timer.elapsed.toFixed(2) + "s";
            
            if (this.trafficLight && this.trafficLight.state === 'green') {
                // Tracken, welche Fahrzeuge die Ampel passiert haben
                for (const v of this.vehicles) {
                    if (!v.hasPassedTrafficLight) {
                        v.traveledSinceGreen += (v.v * SCALE_PX_PER_METER) * dt;
                        if (v.traveledSinceGreen >= v.distToPassTrafficLight) {
                            v.hasPassedTrafficLight = true;
                        }
                    }
                }
                
                // Automatischer Stopp, wenn Modus 'allPassed' aktiv ist und alle Autos durch sind
                if (this.timerStopMode === 'allPassed' && this.vehicles.length > 0) {
                    const allPassed = this.vehicles.every(v => v.hasPassedTrafficLight);
                    if (allPassed) {
                        this.timer.active = false;
                        this.timer.completed = true;
                        timerDisplay.style.color = "#10b981"; // Signalgrün für Endzeit
                        timerDisplay.innerText = this.timer.elapsed.toFixed(2) + "s";
                    }
                }
            }
        }

        if (this.chicken && this.chicken.active) {
            this.chicken.y += 60 * dt; 
            if (this.chicken.y > this.height * ROAD_Y_OFFSET_RATIO + 50) {
                this.chicken.active = false; 
            }
        }
        
        const nextStates = [];
        for (const vehicle of this.vehicles) {
            const lead = this.getLeadVehicle(vehicle);
            const a = vehicle.getAcceleration(lead, this.width);
            nextStates.push({ vehicle, a });
        }
        
        for (const state of nextStates) {
            state.vehicle.a = state.a;
            state.vehicle.update(dt, this.width, this.vehicles);
        }
    }
    
    draw(ctx) {
        const roadY = this.height * ROAD_Y_OFFSET_RATIO;
        const totalRoadHeight = this.numLanes * LANE_HEIGHT;
        
        // Strasse
        ctx.fillStyle = '#dddddd';
        ctx.fillRect(0, roadY - totalRoadHeight, this.width, totalRoadHeight + 10);
        
        // Fahrbahnmarkierungen
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([20, 20]);
        
        for (let i = 1; i <= this.numLanes; i++) {
            ctx.beginPath();
            ctx.moveTo(0, roadY - i * LANE_HEIGHT);
            ctx.lineTo(this.width, roadY - i * LANE_HEIGHT);
            ctx.stroke();
        }
        ctx.setLineDash([]); 
        
        // Ampel zeichnen
        if (this.trafficLight) {
            const tlX = this.trafficLight.x;
            const tlY = roadY - totalRoadHeight - 55;
            
            // Ampelmast
            ctx.fillStyle = '#475569';
            ctx.fillRect(tlX - 4, roadY - totalRoadHeight, 8, totalRoadHeight);
            
            // Ampelkasten mit Interaktions-Glow
            ctx.shadowBlur = 6;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.fillStyle = '#1e293b';
            ctx.beginPath();
            ctx.roundRect(tlX - 16, tlY, 32, 72, 6);
            ctx.fill();
            ctx.shadowBlur = 0;
            
            // Rotes Licht
            ctx.beginPath();
            ctx.arc(tlX, tlY + 20, 10, 0, Math.PI * 2);
            if (this.trafficLight.state === 'red') {
                ctx.shadowBlur = 12;
                ctx.shadowColor = '#ef4444';
                ctx.fillStyle = '#ef4444';
            } else {
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#475569';
            }
            ctx.fill();
            
            // Grünes Licht
            ctx.beginPath();
            ctx.arc(tlX, tlY + 52, 10, 0, Math.PI * 2);
            if (this.trafficLight.state === 'green') {
                ctx.shadowBlur = 12;
                ctx.shadowColor = '#22c55e';
                ctx.fillStyle = '#22c55e';
            } else {
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#475569';
            }
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Vektor-Huhn zeichnen
        if (this.chicken && this.chicken.active) {
            drawChicken(ctx, this.chicken.x, this.chicken.y);
        }
        
        // Fahrzeuge zeichnen
        for (const v of this.vehicles) {
            if (!v.isHighlighted) v.draw(ctx, roadY - LANE_HEIGHT/2);
        }
        if (this.highlightedVehicle) {
            this.highlightedVehicle.draw(ctx, roadY - LANE_HEIGHT/2);
        }
    }
    
    loadScenario(type) {
        this.vehicles = [];
        this.highlightedVehicle = null;
        this.trafficLight = null;
        this.chicken = null;
        this.timer = { active: false, elapsed: 0, completed: false };
        
        carControls.classList.remove('active');
        timerDisplay.style.display = 'none';
        timerDisplay.style.color = '#000000';
        timerDisplay.innerText = "0.00s";
        
        // SVG Icon Definitionen für die Interaktions-Hinweise
        const chickenSvg = `<svg class="hint-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4a3 3 0 0 0-3 3v2a4 4 0 0 0 4 4h2a4 4 0 0 0 4-4V7a3 3 0 0 0-3-3"/><path d="M9 13v6"/><path d="M15 13v6"/><path d="M19 7h2l-2 3"/></svg>`;
        const lightSvg = `<svg class="hint-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="3"/><circle cx="12" cy="7" r="2" fill="#ef4444"/><circle cx="12" cy="12" r="2" fill="#eab308"/><circle cx="12" cy="17" r="2" fill="#22c55e"/></svg>`;
        const carSvg = `<svg class="hint-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 12l4-4"/><path d="M6 16a6 6 0 0 1 12 0"/></svg>`;
        
        const count = Math.max(1, Math.min(20, this.carCount));
        const colors = ['#ff5555', '#50fa7b', '#f1fa8c', '#8be9fd', '#ffb86c', '#bd93f9'];
        
        // Ampel-Optionen nur bei Ampel-Szenarien anzeigen
        if (type === 'trafficLightClassic' || type === 'trafficLightConnected') {
            if (trafficLightOptions) trafficLightOptions.style.display = 'flex';
        } else {
            if (trafficLightOptions) trafficLightOptions.style.display = 'none';
        }
        
        if (type === 'phantom') {
            this.numLanes = 1;
            scenarioHint.innerHTML = `<p>${chickenSvg} <span><strong>Tippe auf ein Auto</strong>, um direkt davor ein Huhn spawnen zu lassen.</span></p>`;
            
            for (let i = 0; i < count; i++) {
                const color = colors[i % colors.length];
                const label = `${i + 1}`;
                const startX = i * (this.width / count);
                const v = new Vehicle(startX, 0, color, label);
                v.v = 25;
                v.v0 = 25;
                v.originalV0 = 25;
                this.vehicles.push(v);
            }
        } else if (type === 'trafficLightClassic' || type === 'trafficLightConnected') {
            this.numLanes = 1;
            const isConnected = (type === 'trafficLightConnected');
            
            scenarioHint.innerHTML = `<p>${lightSvg} <span><strong>Tippe auf die Ampel</strong>, um sie zwischen Rot und Grün umzuschalten.</span></p>` +
                (isConnected ? `<p style="margin-top:4px;color:#6366f1;">⚡ <span>Vernetzte Fahrzeuge beschleunigen synchron!</span></p>` : '');
            
            this.trafficLight = { x: this.width * 0.8, state: 'red' };
            timerDisplay.style.display = 'block';
            
            for (let i = 0; i < count; i++) {
                const color = colors[i % colors.length];
                const label = `${i + 1}`;
                let startX = this.trafficLight.x - 45 - (i * (CAR_WIDTH + 15));
                if (startX < 0) startX += this.width;
                
                const v = new Vehicle(startX, 0, color, label);
                v.v = 0;
                v.v0 = 30;
                v.originalV0 = 30;
                v.s0 = 3.0; // 3m Standabstand (= 15px bei 5px/m)
                v.isConnected = isConnected;
                this.vehicles.push(v);
            }
            
            if (isConnected && this.vehicles.length > 0) {
                const leader = this.vehicles[0]; 
                for (let i = 1; i < this.vehicles.length; i++) {
                    this.vehicles[i].platoonLeader = leader;
                    this.vehicles[i].T = 0.4; 
                    this.vehicles[i].a_max = 3.5;
                }
            }
        } else if (type === 'overtake') {
            this.numLanes = 2;
            scenarioHint.innerHTML = `<p>${carSvg} <span><strong>Klick auf Auto Spur 1</strong>: Fährt auf untere Spur (bleibt dort).</span></p>` +
                                     `<p>${carSvg} <span><strong>Klick auf Auto Spur 0</strong>: Startet Überholmanöver.</span></p>` +
                                     `<p>${chickenSvg} <span><strong>2x schnell Tippen</strong>: Huhn spawnen.</span></p>`;
            
            // Aufteilung: Rote Autos (schnell, links / Spur 1) und Blaue Autos (langsam, rechts / Spur 0)
            const numFast = Math.max(1, Math.ceil(count / 2));
            const numSlow = Math.max(1, Math.floor(count / 2));
            
            // Rote Autos (Spur 1 - links / schnell) mit Zahlen: 1, 2...
            for (let i = 0; i < numFast; i++) {
                const label = `${i + 1}`;
                const startX = i * (this.width / numFast);
                const v = new Vehicle(startX, 1, '#ff5555', label);
                v.v = 30;
                v.v0 = 30;
                v.originalV0 = 30;
                this.vehicles.push(v);
            }
            
            // Blaue Autos (Spur 0 - rechts / langsam) mit Buchstaben: A, B, C...
            for (let i = 0; i < numSlow; i++) {
                const letter = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');
                const startX = (i * (this.width / numSlow) + 30) % this.width;
                const v = new Vehicle(startX, 0, '#38bdf8', letter);
                v.v = 15;
                v.v0 = 15;
                v.originalV0 = 15;
                this.vehicles.push(v);
            }
        }
    }
    
    // --- Manual / In-Canvas Triggers ---
    spawnChicken(targetVehicle) {
        if (this.vehicles.length === 0) return;
        let xPos = this.width / 2;
        
        if (targetVehicle) {
            xPos = (targetVehicle.x + 60) % this.width;
        } else if(this.vehicles.length > 3) {
            xPos = (this.vehicles[Math.floor(this.vehicles.length / 2)].x + 60) % this.width;
        }
        
        this.chicken = {
            x: xPos,
            y: this.height * ROAD_Y_OFFSET_RATIO - (this.numLanes * LANE_HEIGHT) - 30,
            active: true
        };
    }
    
    forceOvertake(targetVehicle) {
        if (this.vehicles.length === 0 || !targetVehicle) return;
        this.numLanes = 2;
        
        const car = targetVehicle;
        if (car.isChangingLane) return;

        if (car.lane === 1) {
            // Auto befindet sich auf oberer Spur (Spur 1, z.B. rotes Auto):
            // Wechselt auf die untere Spur (Spur 0) und bleibt dort
            car.isOvertaking = false;
            car.overtakeTarget = null;
            car.hasPassedTarget = false;
            car.overtakeTimer = 0;
            if (car.isSafeToChangeLane(0, this.vehicles, this.width)) {
                car.targetLane = 0;
                car.isChangingLane = true;
                car.laneChangeProgress = 0;
                car.v0 = 15;
                car.originalV0 = 15;
                car.wantsLaneChangeTo0 = false;
            } else {
                car.wantsLaneChangeTo0 = true;
            }
        } else if (car.lane === 0) {
            // Auto befindet sich auf unterer Spur (Spur 0, egal ob rot oder blau):
            // Startet einen Überholvorgang!
            if (!car.isOvertaking) {
                car.isOvertaking = true;
                car.wantsLaneChangeTo0 = false;
                car.hasPassedTarget = false;
                car.overtakeTimer = 0;
                car.v0 = 35; // Überhol-Wunschgeschwindigkeit (m/s) (~126 km/h)
                const target = this.getLeadVehicle(car, 0);
                car.overtakeTarget = (target && !target.isStatic) ? target : null;

                // Sofort wechseln, wenn die Überholspur frei ist
                if (car.isSafeToChangeLane(1, this.vehicles, this.width)) {
                    car.targetLane = 1;
                    car.isChangingLane = true;
                    car.laneChangeProgress = 0;
                }
            }
        }
    }
    
    toggleLight() {
        if (!this.trafficLight) {
            this.trafficLight = { x: this.width * 0.8, state: 'red' };
            timerDisplay.style.display = 'block';
        } else {
            if (this.trafficLight.state === 'red') {
                // Ampel wird GRÜN
                this.trafficLight.state = 'green';
                this.timer.active = true;
                this.timer.elapsed = 0;
                this.timer.completed = false;
                timerDisplay.style.color = '#000000';
                
                const tlX = this.trafficLight.x;
                const roadLen = this.width;
                for (const v of this.vehicles) {
                    v.hasPassedTrafficLight = false;
                    let distToLight = tlX - (v.x + v.width);
                    if (distToLight < 0) distToLight += roadLen;
                    v.distToPassTrafficLight = distToLight + v.width;
                    v.traveledSinceGreen = 0;
                }
            } else {
                // Ampel wird ROT
                this.trafficLight.state = 'red';
                if (this.timerStopMode === 'manualRed') {
                    this.timer.active = false;
                    timerDisplay.style.color = '#ef4444';
                }
            }
        }
    }
    
    isTrafficLightAt(x, y) {
        if (!this.trafficLight) return false;
        const roadY = this.height * ROAD_Y_OFFSET_RATIO;
        const totalRoadHeight = this.numLanes * LANE_HEIGHT;
        const tlX = this.trafficLight.x;
        const tlY = roadY - totalRoadHeight - 55;
        
        // Großzügige Klick-/Touch-Box für die Ampel
        return (x >= tlX - 35 && x <= tlX + 35 && y >= tlY - 20 && y <= roadY + 20);
    }
    
    selectVehicleAt(x, y) {
        const roadY = this.height * ROAD_Y_OFFSET_RATIO;
        for (const v of this.vehicles) {
            let currentLane = v.lane;
            if (v.isChangingLane) {
                const t = v.laneChangeProgress;
                const smoothT = t * t * (3 - 2 * t);
                currentLane = v.lane + (v.targetLane - v.lane) * smoothT;
            }
            const vy = roadY - LANE_HEIGHT/2 - (currentLane * LANE_HEIGHT) - v.height / 2;
            const padding = 15;
            if (x >= v.x - padding && x <= v.x + v.width + padding && 
                y >= vy - padding && y <= vy + v.height + padding) {
                if (this.highlightedVehicle) {
                    this.highlightedVehicle.isHighlighted = false;
                }
                v.isHighlighted = true;
                this.highlightedVehicle = v;
                return v;
            }
        }
        if (this.highlightedVehicle) {
            this.highlightedVehicle.isHighlighted = false;
            this.highlightedVehicle = null;
        }
        return null;
    }
}

// --- Setup & Event Listeners ---

function resizeCanvas() {
    const parent = canvas.parentElement;
    if(!parent) return;
    
    const logicalWidth = parent.clientWidth || window.innerWidth;
    const logicalHeight = parent.clientHeight || window.innerHeight;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(logicalWidth * dpr);
    canvas.height = Math.round(logicalHeight * dpr);
    canvas.style.width = `${logicalWidth}px`;
    canvas.style.height = `${logicalHeight}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    
    if (simulation) {
        simulation.width = logicalWidth;
        simulation.height = logicalHeight;
    }
}

window.addEventListener('resize', resizeCanvas);

// Burger Menu Toggle
burgerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    burgerBtn.classList.toggle('open');
    sidebar.classList.toggle('open');
});

// Schließen beim Klick auf die Simulation (wenn Sidebar offen auf mobilen Geräten)
canvas.addEventListener('pointerdown', () => {
    if (sidebar.classList.contains('open') && window.innerWidth <= 1080) {
        // Auf mobilen Geräten schließen für vollen Simulationsüberblick
    }
});

// Szenario Wechsel
scenarioSelect.addEventListener('change', (e) => {
    if (simulation) {
        simulation.loadScenario(e.target.value);
    }
});

// Neustart Button
resetBtn.addEventListener('click', () => {
    if (simulation) {
        simulation.loadScenario(scenarioSelect.value);
    }
});

// Anzahl Autos Slider
carCountSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    carCountVal.textContent = val;
    if (simulation) {
        simulation.carCount = val;
        simulation.loadScenario(scenarioSelect.value);
    }
});

// Ampel Timer-Stopp Modus (Segmented Control)
function setTimerStopMode(mode) {
    currentTimerStopMode = mode;
    if (simulation) simulation.timerStopMode = mode;
    if (btnStopAll && btnStopRed) {
        if (mode === 'allPassed') {
            btnStopAll.classList.add('active');
            btnStopRed.classList.remove('active');
        } else {
            btnStopRed.classList.add('active');
            btnStopAll.classList.remove('active');
        }
    }
}

if (btnStopAll) {
    btnStopAll.addEventListener('click', () => setTimerStopMode('allPassed'));
}

if (btnStopRed) {
    btnStopRed.addEventListener('click', () => setTimerStopMode('manualRed'));
}

// Globale Geschwindigkeit
globalSpeedSlider.addEventListener('input', (e) => {
    globalSpeedMultiplier = parseFloat(e.target.value);
    globalSpeedVal.textContent = `${globalSpeedMultiplier.toFixed(1)}x`;
});

// Geschwindigkeit des markierten Autos
carSpeedSlider.addEventListener('input', (e) => {
    if (simulation && simulation.highlightedVehicle) {
        const kmh = parseFloat(e.target.value);
        simulation.highlightedVehicle.v0 = kmh / 3.6;
        simulation.highlightedVehicle.originalV0 = kmh / 3.6;
        carSpeedVal.textContent = `${Math.round(kmh)} km/h`;
    }
});

// --- Direkte Canvas-Interaktionen (Klick / Doppelklick / Ampel) ---
canvas.addEventListener('pointerdown', (e) => {
    if (!simulation) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 1. Prüfen, ob auf die Ampel geklickt wurde
    if (simulation.isTrafficLightAt(x, y)) {
        simulation.toggleLight();
        return;
    }
    
    // 2. Prüfen, ob auf ein Auto geklickt wurde
    const clickedCar = simulation.selectVehicleAt(x, y);
    const now = Date.now();
    const currentScenario = scenarioSelect.value;
    
    if (clickedCar) {
        carControls.classList.add('active');
        carLabelText.textContent = `Auto ${clickedCar.label || ''}`;
        const currentSpeedKmh = Math.round(clickedCar.v0 * 3.6);
        carSpeedSlider.value = currentSpeedKmh;
        carSpeedVal.textContent = `${currentSpeedKmh} km/h`;
        
        if (currentScenario === 'phantom') {
            // Huhnsimulation: Direktes Spawnen des Huhns beim Klick auf ein Auto
            simulation.spawnChicken(clickedCar);
        } else if (currentScenario === 'overtake') {
            // Überholsimulation: 1x Klick = Überholen | 2x Klick schnell = Huhn spawnen
            if (lastClickedVehicle === clickedCar && (now - lastClickTime) < 320) {
                // Schnell zwei mal geklickt -> Huhn spawnen!
                if (singleClickTimer) {
                    clearTimeout(singleClickTimer);
                    singleClickTimer = null;
                }
                simulation.spawnChicken(clickedCar);
                lastClickTime = 0;
            } else {
                // Erster Klick: Timer starten für Überholmanöver
                if (singleClickTimer) clearTimeout(singleClickTimer);
                lastClickedVehicle = clickedCar;
                lastClickTime = now;
                
                singleClickTimer = setTimeout(() => {
                    simulation.forceOvertake(clickedCar);
                    singleClickTimer = null;
                }, 240);
            }
        }
    } else {
        carControls.classList.remove('active');
        carLabelText.textContent = 'Auto';
    }
});

// --- Main Animation Loop ---

function logicUpdate(dt) {
    if (simulation) {
        const safeDt = Math.min(dt, 0.1); 
        const simulationTimeStep = safeDt * globalSpeedMultiplier;
        
        const fixedDt = 0.016; 
        let remainingTime = simulationTimeStep;
        
        while(remainingTime > 0) {
            const step = Math.min(remainingTime, fixedDt);
            simulation.update(step); 
            remainingTime -= step;
        }
    }
}

function drawLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    
    logicUpdate(dt);
    
    const parent = canvas.parentElement;
    if(parent) {
        ctx.clearRect(0, 0, parent.clientWidth, parent.clientHeight);
    }
    
    if (simulation) {
        simulation.draw(ctx);
    }
    
    if (isRunning) {
        requestAnimationFrame(drawLoop);
    }
}

// Initialisierung
resizeCanvas();
setTimeout(() => {
    resizeCanvas();
    const parent = canvas.parentElement;
    simulation = new Simulation(parent.clientWidth, parent.clientHeight);
    simulation.carCount = parseInt(carCountSlider.value, 10);
    simulation.timerStopMode = currentTimerStopMode;
    simulation.loadScenario(scenarioSelect.value);
    requestAnimationFrame(drawLoop);
}, 0);

// --- Changelog Modal Handling ---
const changelogBtn = document.getElementById('changelogBtn');
const changelogModal = document.getElementById('changelogModal');
const closeChangelogBtn = document.getElementById('closeChangelogBtn');

if (changelogBtn && changelogModal) {
    changelogBtn.addEventListener('click', () => {
        changelogModal.style.display = 'flex';
    });
}

if (closeChangelogBtn && changelogModal) {
    closeChangelogBtn.addEventListener('click', () => {
        changelogModal.style.display = 'none';
    });
}

if (changelogModal) {
    changelogModal.addEventListener('click', (e) => {
        if (e.target === changelogModal) {
            changelogModal.style.display = 'none';
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && changelogModal.style.display === 'flex') {
            changelogModal.style.display = 'none';
        }
    });
}
