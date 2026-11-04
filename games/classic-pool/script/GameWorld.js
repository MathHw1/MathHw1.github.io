"use strict";

function GameWorld() {

    this.whiteBallStartingPosition = new Vector2(413,413);

    this.redBalls = [
    new Ball(new Vector2(1056,433),Color.red),//3
    new Ball(new Vector2(1090,374),Color.red),//4
    new Ball(new Vector2(1126,393),Color.red),//8
    new Ball(new Vector2(1126,472),Color.red),//10;
    new Ball(new Vector2(1162,335),Color.red),//11
    new Ball(new Vector2(1162,374),Color.red),//12
    new Ball(new Vector2(1162,452),Color.red)//14
    ]

    this.yellowBalls = [
    new Ball(new Vector2(1022,413),Color.yellow),//1
    new Ball(new Vector2(1056,393),Color.yellow),//2
    new Ball(new Vector2(1090,452),Color.yellow),//6
    new Ball(new Vector2(1126,354),Color.yellow),//7
    new Ball(new Vector2(1126,433),Color.yellow),//9
    new Ball(new Vector2(1162,413),Color.yellow),//13
    new Ball(new Vector2(1162,491),Color.yellow)//15
    ];

    this.whiteBall = new Ball(new Vector2(413,413),Color.white);
    this.blackBall = new Ball(new Vector2(1090,413),Color.black);

    this.balls = [
    this.yellowBalls[0],
    this.yellowBalls[1],
    this.redBalls[0],
    this.redBalls[1],
    this.blackBall,
    this.yellowBalls[2],
    this.yellowBalls[3],
    this.redBalls[2],
    this.yellowBalls[4],
    this.redBalls[3],
    this.redBalls[4],
    this.redBalls[5],
    this.yellowBalls[5],
    this.redBalls[6],
    this.yellowBalls[6],
    this.whiteBall]

    this.stick = new Stick({ x : 413, y : 413 });

    this.gameOver = false;
}

GameWorld.prototype.getBallsSetByColor = function(color){

    if(color === Color.red){
        return this.redBalls;
    }
    if(color === Color.yellow){
        return this.yellowBalls;
    }
    if(color === Color.white){
        return this.whiteBall;
    }
    if(color === Color.black){
        return this.blackBall;
    }
}

GameWorld.prototype.handleInput = function (delta) {
    this.stick.handleInput(delta);
};

GameWorld.prototype.update = function (delta) {
    this.stick.update(delta);

    // Split the step into sub-steps short enough that no ball moves more than a quarter
    // of its width at a time, so fast balls can't pass straight through each other.
    var fastest = 0;
    for (var i = 0 ; i < this.balls.length; i++) {
        if(this.balls[i].moving && !this.balls[i].inHole){
            fastest = Math.max(fastest, this.balls[i].velocity.length);
        }
    }
    var subSteps = Math.max(1, Math.ceil(fastest * delta / (BALL_SIZE / 4)));
    var subDelta = delta / subSteps;

    for (var s = 0 ; s < subSteps; s++) {
        for (var i = 0 ; i < this.balls.length; i++) {
            this.balls[i].updatePosition(subDelta);
        }
        for (var i = 0 ; i < this.balls.length; i++){
            for(var j = i + 1 ; j < this.balls.length ; j++){
                this.handleCollision(this.balls[i], this.balls[j]);
            }
        }
    }

    for (var i = 0 ; i < this.balls.length; i++) {
        this.balls[i].update(delta);
    }

    // In online games the shooter's game decides what happened and sends it over.
    if(!this.ballsMoving() && AI.finishedSession && !Online.isRemoteTurn()){
        Game.policy.updateTurnOutcome();
        if(Game.policy.foul){
            this.ballInHand();
        }
    }

};

GameWorld.prototype.ballInHand = function(){
    if(AI_ON && Game.policy.turn === AI_PLAYER_NUM){
        return;
    }

    KEYBOARD_INPUT_ON = false;
    this.stick.visible = false;
    if(!Mouse.left.down){
        this.whiteBall.position = Mouse.position;
    }
    else{
        let ballsOverlap = this.whiteBallOverlapsBalls();

        if(!Game.policy.isOutsideBorder(Mouse.position,this.whiteBall.origin) &&
            !Game.policy.isInsideHole(Mouse.position) &&
            !ballsOverlap){
            KEYBOARD_INPUT_ON = true;
            Keyboard.reset();
            Mouse.reset();
            this.whiteBall.position = Mouse.position;
            this.whiteBall.inHole = false;
            Game.policy.foul = false;
            this.stick.position = this.whiteBall.position;
            this.stick.visible = true;
        }
    }

}

GameWorld.prototype.whiteBallOverlapsBalls = function(){

    let ballsOverlap = false;
    for (var i = 0 ; i < this.balls.length; i++) {
        if(this.whiteBall !== this.balls[i]){
            if(this.whiteBall.position.distanceFrom(this.balls[i].position)<BALL_SIZE){
                ballsOverlap = true;
            }
        }
    }

    return ballsOverlap;
}

GameWorld.prototype.ballsMoving = function(){

    var ballsMoving = false;

    for (var i = 0 ; i < this.balls.length; i++) {
        if(this.balls[i].moving){
            ballsMoving = true;
        }
    }

    return ballsMoving;
}

// Share of the closing speed kept when two balls hit (1 would be a perfectly elastic hit).
const BALL_BOUNCE = 0.95;

GameWorld.prototype.handleCollision = function(ball1, ball2){

    if(ball1.inHole || ball2.inHole)
        return;

    if(!ball1.moving && !ball2.moving)
        return;

    var dx = ball2.position.x - ball1.position.x;
    var dy = ball2.position.y - ball1.position.y;
    var dist = Math.sqrt(dx*dx + dy*dy);

    if(dist >= BALL_SIZE || dist === 0)
        return;

    // Unit vector from ball1's centre to ball2's.
    var nx = dx / dist;
    var ny = dy / dist;

    // Push the balls apart so they never overlap or stick together.
    var overlap = (BALL_SIZE - dist) / 2;
    ball1.position.x -= nx * overlap;
    ball1.position.y -= ny * overlap;
    ball2.position.x += nx * overlap;
    ball2.position.y += ny * overlap;

    // How fast they're moving towards each other along that line.
    var closing = (ball1.velocity.x - ball2.velocity.x) * nx + (ball1.velocity.y - ball2.velocity.y) * ny;
    if(closing <= 0)
        return;

    Game.policy.checkColisionValidity(ball1, ball2);

    if(Game.sound && SOUND_ON){
        var ballsCollide = sounds.ballsCollide.cloneNode(true);
        ballsCollide.volume = Math.min(closing / 2000, 1);
        ballsCollide.play();
    }

    // Equal-mass balls: trade the part of the velocity along the line between centres,
    // the way real pool balls do (a straight hit stops the cue ball, a thin cut barely moves the object ball).
    var impulse = closing * (1 + BALL_BOUNCE) / 2;
    ball1.velocity.x -= impulse * nx;
    ball1.velocity.y -= impulse * ny;
    ball2.velocity.x += impulse * nx;
    ball2.velocity.y += impulse * ny;

    ball1.moving = true;
    ball2.moving = true;
}

GameWorld.prototype.draw = function () {
    Canvas2D.drawImage(sprites.background);
    Game.policy.drawScores();

    for (var i = 0; i < this.balls.length; i++) {
        this.balls[i].draw();
    }

    this.stick.draw();
};

GameWorld.prototype.reset = function () {
    this.gameOver = false;

    for (var i = 0; i < this.balls.length; i++) {
        this.balls[i].reset();
    }

    this.stick.reset();

    if(AI_ON && AI_PLAYER_NUM === 0){
        AI.startSession();
    }
};

GameWorld.prototype.initiateState = function(balls){
    
    for (var i = 0; i < this.balls.length; i++) {
        this.balls[i].position.x = balls[i].position.x;
        this.balls[i].position.y = balls[i].position.y;
        this.balls[i].visible = balls[i].visible;
        this.balls[i].inHole = balls[i].inHole;
    }

    this.stick.position = this.whiteBall.position;
}

