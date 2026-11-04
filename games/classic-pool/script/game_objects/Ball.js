"use strict";

function Ball(initPos,color){
	this.initPos = initPos;
    this.position = initPos.copy();
    this.origin = new Vector2(25,25);
    this.velocity = Vector2.zero;
    this.color = color; 
    this.moving = false;
    this.visible = true;
    this.inHole = false;
}

Object.defineProperty(Ball.prototype, "color",
    {
    	get: function(){
    		if(this.sprite == sprites.redBall){
    			return Color.red;
    		}
    		else if(this.sprite == sprites.yellowBall){
    			return Color.yellow;
    		}
			else if(this.sprite == sprites.blackBall){
    			return Color.black;
    		}
    		else{
    			return Color.white;
    		}
    	},
        set: function (value) {
            if (value === Color.red){
                this.sprite = sprites.redBall;
            }
            else if(value == Color.yellow){
            	this.sprite = sprites.yellowBall;
            }
			else if(value == Color.black){
            	this.sprite = sprites.blackBall;
            }
            else{
            	this.sprite = sprites.ball;
            }
        }
    });

Ball.prototype.shoot = function(power, angle){
    if(power <= 0)
        return;

    this.moving = true;

    this.velocity = calculateBallVelocity(power,angle);
}

var calculateBallVelocity = function(power, angle){

    return new Vector2(100*Math.cos(angle)*power,100*Math.sin(angle)*power);
}

// Share of speed a ball keeps each physics step (table friction) and after hitting a cushion.
const BALL_FRICTION = 0.98;
const CUSHION_BOUNCE = 0.9;

// Called once per physics step, after GameWorld has moved the balls.
Ball.prototype.update = function(delta){

    this.velocity.multiplyWith(BALL_FRICTION);

	if(this.moving && Math.abs(this.velocity.x) < 1 && Math.abs(this.velocity.y) < 1){
        this.stop();
    }
}

// Moves the ball by one sub-step, bouncing off cushions and dropping into pockets.
Ball.prototype.updatePosition = function(delta){

    if(!this.moving || this.inHole)
        return;

    var newPos = this.position.add(this.velocity.multiply(delta));

	if(Game.policy.isInsideHole(newPos)){
        if(Game.sound && SOUND_ON){
            var holeSound = sounds.hole.cloneNode(true);
            holeSound.volume = 0.5;
            holeSound.play();
        }
		this.position = newPos;
        this.inHole = true;
        // Done straight away, not on a timer: timers left over from the computer's
        // practice shots used to fire later and hide balls in the real game.
        this.visible = false;
        this.stop();
        Game.policy.handleBallInHole(this);
		return;
	}

    this.position = newPos;
    this.handleCollision();
}

Ball.prototype.handleCollision = function(){

	var policy = Game.policy;
	var r = this.origin.x;
	var collision = false;

	if(this.position.x - r < policy.leftBorderX){
        this.position.x = policy.leftBorderX + r;
        this.velocity.x = Math.abs(this.velocity.x) * CUSHION_BOUNCE;
        collision = true;
    }
    else if(this.position.x + r > policy.rightBorderX){
        this.position.x = policy.rightBorderX - r;
        this.velocity.x = -Math.abs(this.velocity.x) * CUSHION_BOUNCE;
        collision = true;
    }

    // The long cushions have a gap at the middle pockets. Without it, a ball had to arrive
    // within about 10px of dead centre to drop, so the middle pockets almost never took a ball.
    if(Math.abs(this.position.x - policy.topCenterHolePos.x) < MIDDLE_POCKET_MOUTH)
        return collision;

    if(this.position.y - r < policy.topBorderY){
        this.position.y = policy.topBorderY + r;
        this.velocity.y = Math.abs(this.velocity.y) * CUSHION_BOUNCE;
        collision = true;
    }
    else if(this.position.y + r > policy.bottomBorderY){
        this.position.y = policy.bottomBorderY - r;
        this.velocity.y = -Math.abs(this.velocity.y) * CUSHION_BOUNCE;
        collision = true;
    }

    return collision;
}

Ball.prototype.stop = function(){

    this.moving = false;
    this.velocity = Vector2.zero;
}

Ball.prototype.reset = function(){
	this.inHole = false;
	this.moving = false;
	this.velocity = Vector2.zero;
	this.position = this.initPos.copy();   // a copy, so cushion bounces can't move the rack spot
	this.visible = true;
}

Ball.prototype.out = function(){

	this.position = new Vector2(0, 900);
	this.visible = false;
	this.inHole = true;

}

Ball.prototype.draw = function () {
    if(!this.visible)
        return;

	Canvas2D.drawImage(this.sprite, this.position, 0, 1, new Vector2(25,25));
};