/**
 * Gravity Siege - Core Game Logic
 * Using Matter.js for Physics
 */

const { Engine, Render, Runner, World, Bodies, Body, Events, Mouse, MouseConstraint, Constraint, Vector, Composite } = Matter;

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.engine = Engine.create();
        this.world = this.engine.world;
        this.runner = Runner.create();

        this.gameState = {
            players: [],
            currentPlayerIndex: 0,
            timer: 30,
            gameActive: false,
            winner: null,
            characters: [], // All character bodies
            hasShot: false
        };

        this.playerColors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b'];
        this.config = {
            playerCount: 2,
            charsPerPlayer: 2,
            gravity: 0.9,
            terrainResolution: 40,
            groundY: 0,
            explosionRadius: 80,
            explosionForce: 0.05
        };

        this.sling = {
            active: false,
            startPoint: null,
            currentPoint: null,
            maxForce: 0.06,
            projectile: null
        };

        this.setupEventListeners();
        this.initPhysics();
    }

    initPhysics() {
        this.world.gravity.y = this.config.gravity;

        // Setup renderer for debugging or custom loop
        this.render = Render.create({
            canvas: this.canvas,
            engine: this.engine,
            options: {
                width: window.innerWidth,
                height: window.innerHeight,
                wireframes: false,
                background: 'transparent',
                showAngleIndicator: false
            }
        });

        Render.run(this.render);
        Runner.run(this.runner, this.engine);

        // Adjust canvas on resize
        window.addEventListener('resize', () => {
            this.render.canvas.width = window.innerWidth;
            this.render.canvas.height = window.innerHeight;
            this.render.options.width = window.innerWidth;
            this.render.options.height = window.innerHeight;
        });

        // Collision logic
        Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach(pair => {
                this.handleCollision(pair.bodyA, pair.bodyB);
            });
        });
    }

    setupEventListeners() {
        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('restart-btn').addEventListener('click', () => location.reload());

        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    }

    startGame() {
        this.config.playerCount = parseInt(document.getElementById('player-count').value);
        this.config.charsPerPlayer = parseInt(document.getElementById('char-count').value);

        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('hud').classList.remove('hidden');

        this.setupPlayers();
        this.generateTerrain();
        this.gameState.gameActive = true;
        this.startTurnTimer();
        this.updateHUD();
    }

    setupPlayers() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.config.groundY = height - 100;

        for (let i = 0; i < this.config.playerCount; i++) {
            const player = {
                id: i,
                name: `Jogador ${i + 1}`,
                color: this.playerColors[i],
                characters: []
            };

            for (let j = 0; j < this.config.charsPerPlayer; j++) {
                const x = (width / (this.config.playerCount * this.config.charsPerPlayer + 1)) * (i * this.config.charsPerPlayer + j + 1);
                const char = Bodies.rectangle(x, this.config.groundY - 100, 30, 40, {
                    friction: 0.5,
                    restitution: 0.1,
                    label: 'character',
                    render: { fillStyle: player.color },
                    playerIndex: i,
                    hp: 50
                });

                player.characters.push(char);
                this.gameState.characters.push(char);
                World.add(this.world, char);
            }
            this.gameState.players.push(player);
        }
    }

    generateTerrain() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const blockSize = 30;

        // Create a simple hilly terrain with blocks
        for (let x = 0; x < width; x += blockSize) {
            const hillHeight = Math.sin(x * 0.005) * 50 + 100;
            const targetY = height - hillHeight;

            for (let y = targetY; y < height; y += blockSize) {
                const block = Bodies.rectangle(x + blockSize / 2, y + blockSize / 2, blockSize, blockSize, {
                    isStatic: true,
                    label: 'terrain',
                    render: { fillStyle: '#334155' }
                });
                World.add(this.world, block);
            }
        }
    }

    handleMouseDown(e) {
        if (!this.gameState.gameActive || this.sling.active || this.gameState.hasShot) return;

        const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Check if clicked near current player's characters
        const activeChar = currentPlayer.characters.find(c => {
            const dist = Vector.magnitude(Vector.sub(c.position, { x: mouseX, y: mouseY }));
            return dist < 80; // Margin of error
        });

        if (activeChar) {
            this.sling.active = true;
            this.sling.startPoint = { x: mouseX, y: mouseY };
            this.sling.currentPoint = { x: mouseX, y: mouseY };
            this.sling.activeChar = activeChar;
        }
    }

    calculateTrajectory() {
        if (!this.sling.active) return [];

        const force = Vector.sub(this.sling.startPoint, this.sling.currentPoint);
        const magnitude = Vector.magnitude(force);
        const limitedMagnitude = Math.min(magnitude * 0.0002, this.sling.maxForce);
        const normalizedForce = Vector.mult(Vector.normalise(force), limitedMagnitude);

        const radius = 8;
        const density = 0.001;
        const mass = Math.PI * radius * radius * density;

        let vx = (normalizedForce.x / mass) * 16.666;
        let vy = (normalizedForce.y / mass) * 16.666;

        const points = [];
        let currPos = { x: this.sling.activeChar.position.x, y: this.sling.activeChar.position.y - 20 };

        const gravityY = this.world.gravity.y * this.world.gravity.scale * 16.666;
        const frictionAir = 0.02;

        for (let i = 0; i < 120; i++) {
            vx *= (1 - frictionAir);
            vy *= (1 - frictionAir);
            vy += gravityY;

            currPos.x += vx;
            currPos.y += vy;

            if (i % 4 === 0) {
                points.push({ x: currPos.x, y: currPos.y });
            }
            if (currPos.y > window.innerHeight || currPos.x < -100 || currPos.x > window.innerWidth + 100) break;
        }
        return points;
    }

    handleMouseMove(e) {
        if (!this.sling.active) return;
        const rect = this.canvas.getBoundingClientRect();
        this.sling.currentPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    handleMouseUp() {
        if (!this.sling.active) return;

        const force = Vector.sub(this.sling.startPoint, this.sling.currentPoint);
        const magnitude = Vector.magnitude(force);
        const normalizedForce = Vector.mult(Vector.normalise(force), Math.min(magnitude * 0.0002, this.sling.maxForce));

        this.fireProjectile(this.sling.activeChar.position, normalizedForce);

        this.sling.active = false;
        this.sling.startPoint = null;
        this.sling.currentPoint = null;
    }

    fireProjectile(pos, force) {
        const player = this.gameState.players[this.gameState.currentPlayerIndex];
        const projectile = Bodies.circle(pos.x, pos.y - 20, 8, {
            friction: 0.1,
            restitution: 0.4,
            frictionAir: 0.02,
            label: 'projectile',
            render: { fillStyle: player.color },
            playerIndex: player.id
        });

        this.gameState.hasShot = true;

        const initialVelocity = {
            x: (force.x / projectile.mass) * 16.666,
            y: (force.y / projectile.mass) * 16.666
        };

        World.add(this.world, projectile);
        Body.setVelocity(projectile, initialVelocity);

        // Pass the turn immediately
        this.nextTurn();

        // Auto-cleanup projectile without affecting turn flow
        setTimeout(() => this.cleanupProjectile(projectile), 1000);
    }

    cleanupProjectile(projectile) {
        // Simple logic: if moving slowly or outside, remove and next turn
        const check = setInterval(() => {
            const speed = Vector.magnitude(projectile.velocity);
            const isOutside = projectile.position.y > window.innerHeight + 100 || projectile.position.x < -100 || projectile.position.x > window.innerWidth + 100;

            if (speed < 0.15 || isOutside) {
                clearInterval(check);
                World.remove(this.world, projectile);
            }
        }, 200);
    }

    handleCollision(bodyA, bodyB) {
        const bodies = [bodyA, bodyB];
        const projectile = bodies.find(b => b.label === 'projectile');
        const other = bodies.find(b => b.label !== 'projectile');

        if (projectile && other) {
            this.createExplosion(projectile.position);
            World.remove(this.world, projectile);
        }
    }

    createExplosion(pos) {
        // Find nearby bodies
        const bodies = Composite.allBodies(this.world);
        bodies.forEach(body => {
            const dist = Vector.magnitude(Vector.sub(body.position, pos));

            if (dist < this.config.explosionRadius) {
                if (body.label === 'terrain') {
                    World.remove(this.world, body);
                } else if (body.label === 'character') {
                    // Apply force
                    const forceDir = Vector.normalise(Vector.sub(body.position, pos));
                    const forceMag = (1 - (dist / this.config.explosionRadius)) * this.config.explosionForce;
                    Body.applyForce(body, body.position, Vector.mult(forceDir, forceMag));

                    // Damage
                    body.hp -= Math.floor((1 - (dist / this.config.explosionRadius)) * 50);
                    if (body.hp <= 0) {
                        this.killCharacter(body);
                    }
                    this.updateStats();
                }
            }
        });
    }

    killCharacter(char) {
        World.remove(this.world, char);
        this.gameState.characters = this.gameState.characters.filter(c => c !== char);
        this.gameState.players.forEach(p => {
            p.characters = p.characters.filter(c => c !== char);
        });
        this.checkWinCondition();
    }

    checkWinCondition() {
        const activePlayers = this.gameState.players.filter(p => p.characters.length > 0);
        if (activePlayers.length <= 1 && this.gameState.gameActive) {
            this.gameState.gameActive = false;
            this.gameState.winner = activePlayers[0]?.name || "Ninguém";
            this.showGameOver();
        }
    }

    nextTurn() {
        if (!this.gameState.gameActive) return;

        this.gameState.currentPlayerIndex = (this.gameState.currentPlayerIndex + 1) % this.gameState.players.length;

        // Skip players with no characters
        if (this.gameState.players[this.gameState.currentPlayerIndex].characters.length === 0) {
            this.nextTurn();
            return;
        }

        this.gameState.timer = 30;
        this.gameState.hasShot = false;
        this.updateHUD();
    }

    startTurnTimer() {
        setInterval(() => {
            if (this.gameState.gameActive) {
                this.gameState.timer--;
                if (this.gameState.timer <= 0) {
                    this.nextTurn();
                }
                document.getElementById('turn-timer').innerText = this.gameState.timer;
            }
        }, 1000);
    }

    updateHUD() {
        const player = this.gameState.players[this.gameState.currentPlayerIndex];
        document.getElementById('current-player-name').innerText = player.name;
        document.getElementById('player-color-indicator').style.backgroundColor = player.color;
        this.updateStats();
    }

    updateStats() {
        const statsContainer = document.querySelector('.game-stats');
        statsContainer.innerHTML = '';

        this.gameState.players.forEach(p => {
            const totalHP = p.characters.reduce((acc, c) => acc + Math.max(0, c.hp), 0);
            const maxHP = this.config.charsPerPlayer * 50;
            const percentage = (totalHP / maxHP) * 100;

            const row = document.createElement('div');
            row.className = 'player-stat-row';
            row.innerHTML = `
                <span>${p.name}</span>
                <div class="hp-bar-container">
                    <div class="hp-bar-fill" style="width: ${percentage}%; background-color: ${p.color}"></div>
                </div>
            `;
            statsContainer.appendChild(row);
        });
    }

    showGameOver() {
        document.getElementById('winner-name').innerText = this.gameState.winner;
        document.getElementById('game-over').classList.remove('hidden');
    }

    // Custom loop for drawing the sling line
    draw() {
        const ctx = this.canvas.getContext('2d');

        // This is called inside a requestAnimationFrame or similar if we weren't using Render.run
        // But since we are, we can also use Events.on(render, 'afterRender', ...)
    }
}

// Initialize when everything is loaded
window.addEventListener('load', () => {
    const game = new Game();

    // Sling drawing logic on top of Matter.js renderer
    Events.on(game.render, 'afterRender', () => {
        const ctx = game.canvas.getContext('2d');
        if (game.sling.active) {
            // Draw sling line
            ctx.beginPath();
            ctx.moveTo(game.sling.startPoint.x, game.sling.startPoint.y);
            ctx.lineTo(game.sling.currentPoint.x, game.sling.currentPoint.y);
            ctx.strokeStyle = game.gameState.players[game.gameState.currentPlayerIndex].color;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw trajectory dots
            const trajectory = game.calculateTrajectory();
            if (trajectory.length > 0) {
                ctx.fillStyle = game.gameState.players[game.gameState.currentPlayerIndex].color;
                trajectory.forEach((point, index) => {
                    const alpha = 1 - (index / trajectory.length);
                    ctx.globalAlpha = alpha;
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.globalAlpha = 1.0;
            }

            // Draw start indicator (circle)
            ctx.beginPath();
            ctx.arc(game.sling.startPoint.x, game.sling.startPoint.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = 'white';
            ctx.fill();
        }

        // Check for out of bounds characters (falling off)
        game.gameState.characters.forEach(char => {
            if (char.position.y > window.innerHeight) {
                game.killCharacter(char);
            }
        });
    });
});
